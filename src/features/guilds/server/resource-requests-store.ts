import '../../../lib/assert-server';
import { randomUUID } from 'node:crypto';
import { AppError } from '../../../lib/errors';
import { getRedisClient } from '../../../lib/redis/client';
import { guildKeys } from '../../../lib/redis/keys';
import {
  resourceGuildIdSchema,
  resourceInputSchema,
  storedResourceRequestSchema,
  resourceProgress,
  RESOURCE_REQUEST_LIMIT,
  RESOURCE_OPEN_LIMIT,
  RESOURCE_PLEDGE_LIMIT,
  type ResourceInput,
  type StoredResourceRequest,
} from '../resource-requests';

const MAX_BYTES = 65_536;
const RETENTION = 90 * 86_400;
const READ = `
-- guild-resources-read
if redis.call('HLEN', KEYS[1]) > tonumber(ARGV[1]) then return false end
for _, id in ipairs(redis.call('HKEYS', KEYS[1])) do
  if redis.call('HSTRLEN', KEYS[1], id) > tonumber(ARGV[2]) then return false end
end
return redis.call('HGETALL', KEYS[1])
`;
const SAVE = `
-- guild-resources-save
local old = redis.call('HGET', KEYS[1], ARGV[1])
if old then
  local ok, request = pcall(cjson.decode, old)
  if not ok or type(request) ~= 'table' then return 'invalid' end
  if request.revision ~= ARGV[2] then return 'conflict' end
elseif ARGV[2] ~= '' then return 'conflict'
else
  if redis.call('HLEN', KEYS[1]) >= tonumber(ARGV[5]) then return 'full' end
  local count = 0
  for _, encoded in ipairs(redis.call('HVALS', KEYS[1])) do
    local ok, request = pcall(cjson.decode, encoded)
    if not ok or type(request) ~= 'table' then return 'invalid' end
    if request.requesterId == ARGV[7] and request.status == 'open' then count = count + 1 end
  end
  if count >= tonumber(ARGV[8]) then return 'member-full' end
end
if ARGV[4] == 'delete' then redis.call('HDEL', KEYS[1], ARGV[1])
else redis.call('HSET', KEYS[1], ARGV[1], ARGV[3]) end
if redis.call('HLEN', KEYS[1]) == 0 then redis.call('DEL', KEYS[1])
else redis.call('EXPIRE', KEYS[1], ARGV[6]) end
return 'ok'
`;
const unavailable = () =>
  new AppError(
    'Guild resource requests are unavailable. Refresh before trying again.',
    503,
    'RESOURCES_UNAVAILABLE',
    true,
  );
const conflict = () =>
  new AppError(
    'This request changed. Refresh before trying again. Your draft is kept.',
    409,
    'RESOURCE_CONFLICT',
    true,
  );
const forbidden = () =>
  new AppError('Only the requester or guild leader can manage this request.', 403, 'RESOURCE_MANAGER_REQUIRED', true);
function storage() {
  const redis = getRedisClient();
  if (!redis) throw unavailable();
  return redis;
}

export async function readResourceRequests(guildId: string): Promise<StoredResourceRequest[]> {
  resourceGuildIdSchema.parse(guildId);
  try {
    const values = await storage().eval(
      READ,
      [guildKeys.resourceRequests(guildId)],
      [RESOURCE_REQUEST_LIMIT, MAX_BYTES],
    );
    if (!Array.isArray(values) || values.length % 2 || values.length > RESOURCE_REQUEST_LIMIT * 2) throw unavailable();
    const requests: StoredResourceRequest[] = [];
    for (let index = 0; index < values.length; index += 2) {
      if (typeof values[index + 1] !== 'string' || values[index + 1].length > MAX_BYTES) throw unavailable();
      const request = storedResourceRequestSchema.parse(JSON.parse(values[index + 1]));
      if (request.id !== values[index]) throw unavailable();
      requests.push(request);
    }
    return requests.sort(
      (a, b) =>
        Number(b.priority === 'urgent') - Number(a.priority === 'urgent') || b.createdAt.localeCompare(a.createdAt),
    );
  } catch {
    throw unavailable();
  }
}
type Actor = { memberId: string; authorName: string; canEdit: boolean };
export async function mutateResourceRequest(guildId: string, input: ResourceInput, actor: Actor) {
  resourceGuildIdSchema.parse(actor.memberId);
  const change = resourceInputSchema.parse(input);
  const requests = await readResourceRequests(guildId);
  const id = change.action === 'save' ? change.request.id : change.id;
  const current = requests.find((request) => request.id === id);
  if ((current?.revision ?? null) !== change.revision) throw conflict();
  const manager = actor.canEdit || current?.requesterId === actor.memberId;
  const timestamp = new Date().toISOString();
  let next: StoredResourceRequest;
  if (change.action === 'save') {
    if (current && !manager) throw forbidden();
    if (current && current.status !== 'open')
      throw new AppError('This request is closed.', 409, 'RESOURCE_CLOSED', true);
    if (
      current?.pledges.length &&
      (current.material !== change.request.material || current.unit !== change.request.unit)
    )
      throw new AppError(
        'The material and unit cannot change while pledges exist. Create a separate request instead.',
        409,
        'RESOURCE_PLEDGES_EXIST',
        true,
      );
    if (current && BigInt(change.request.quantity) < BigInt(resourceProgress(current).committed))
      throw new AppError(
        'The requested amount cannot be reduced below existing pledges.',
        409,
        'RESOURCE_OVERCOMMITTED',
        true,
      );
    next = {
      ...change.request,
      revision: randomUUID(),
      requesterId: current?.requesterId ?? actor.memberId,
      requesterName: current?.requesterName ?? actor.authorName,
      status: 'open',
      createdAt: current?.createdAt ?? timestamp,
      updatedAt: timestamp,
      pledges: current?.pledges ?? [],
    };
  } else {
    if (!current) throw conflict();
    if (['confirm', 'return-claim', 'release-pledge', 'cancel', 'delete'].includes(change.action) && !manager)
      throw forbidden();
    if (change.action !== 'delete' && current.status !== 'open')
      throw new AppError('This request is closed.', 409, 'RESOURCE_CLOSED', true);
    next = {
      ...current,
      revision: randomUUID(),
      updatedAt: timestamp,
      pledges: current.pledges.map((pledge) => ({ ...pledge })),
    };
    const own = next.pledges.find((pledge) => pledge.supplierId === actor.memberId && pledge.status !== 'confirmed');
    if (change.action === 'pledge') {
      if (current.requesterId === actor.memberId)
        throw new AppError('You cannot pledge to your own request.', 409, 'RESOURCE_SELF_PLEDGE', true);
      if (own && own.status !== 'promised')
        throw new AppError('A reported or confirmed pledge cannot be edited.', 409, 'RESOURCE_PLEDGE_LOCKED', true);
      const remaining = next.pledges.filter((pledge) => pledge.id !== own?.id);
      if (remaining.length >= RESOURCE_PLEDGE_LIMIT)
        throw new AppError(
          'This request already has 20 pledge/delivery records. Start a new request for any remaining resources.',
          409,
          'RESOURCE_PLEDGES_FULL',
          true,
        );
      const reserved = remaining.reduce((sum, pledge) => sum + BigInt(pledge.quantity), 0n);
      if (reserved + BigInt(change.quantity) > BigInt(current.quantity))
        throw new AppError(
          'That amount exceeds the unpledged resources. Refresh and choose a smaller amount.',
          409,
          'RESOURCE_OVERCOMMITTED',
          true,
        );
      next.pledges = [
        ...remaining,
        {
          id: own?.id ?? randomUUID(),
          supplierId: actor.memberId,
          name: actor.authorName,
          quantity: change.quantity,
          status: 'promised',
          promisedAt: timestamp,
          reportedAt: null,
          confirmedAt: null,
          confirmedById: null,
          confirmedByName: null,
        },
      ];
    } else if (change.action === 'withdraw' || change.action === 'report') {
      if (!own || own.status !== 'promised')
        throw new AppError('Only your own pending pledge can be changed.', 409, 'RESOURCE_PLEDGE_LOCKED', true);
      if (change.action === 'withdraw') next.pledges = next.pledges.filter((pledge) => pledge.id !== own.id);
      else {
        own.status = 'reported';
        own.reportedAt = timestamp;
        own.name = actor.authorName;
      }
    } else if (change.action === 'confirm' || change.action === 'return-claim' || change.action === 'release-pledge') {
      const pledge = next.pledges.find((entry) => entry.id === change.pledgeId);
      if (!pledge || pledge.status === 'confirmed')
        throw new AppError('That pledge is missing or already confirmed.', 409, 'RESOURCE_PLEDGE_LOCKED', true);
      if (change.action === 'release-pledge') next.pledges = next.pledges.filter((entry) => entry.id !== pledge.id);
      else {
        if (pledge.status !== 'reported')
          throw new AppError('Only a reported delivery can be reviewed.', 409, 'RESOURCE_NOT_REPORTED', true);
        if (change.action === 'confirm') {
          if (pledge.supplierId === actor.memberId)
            throw new AppError(
              'You cannot confirm your own delivery. Ask the requester or another leader.',
              403,
              'RESOURCE_SELF_CONFIRMATION',
              true,
            );
          pledge.status = 'confirmed';
          pledge.confirmedAt = timestamp;
          pledge.confirmedById = actor.memberId;
          pledge.confirmedByName = actor.authorName;
        } else {
          pledge.status = 'promised';
          pledge.reportedAt = null;
        }
      }
    } else if (change.action === 'cancel') next.status = 'cancelled';
  }
  if (next.status === 'open' && resourceProgress(next).delivered === next.quantity) next.status = 'fulfilled';
  const encoded = JSON.stringify(storedResourceRequestSchema.parse(next));
  if (Buffer.byteLength(encoded) > MAX_BYTES)
    throw new AppError('This request has reached its storage limit.', 409, 'RESOURCE_FULL', true);
  // Dev note: promises are spice futures; only a different member can confirm the actual delivery.
  let result: unknown;
  try {
    result = await storage().eval(
      SAVE,
      [guildKeys.resourceRequests(guildId)],
      [
        id,
        change.revision ?? '',
        encoded,
        change.action,
        RESOURCE_REQUEST_LIMIT,
        RETENTION,
        next.requesterId,
        RESOURCE_OPEN_LIMIT,
      ],
    );
  } catch {
    throw unavailable();
  }
  if (result === 'conflict') throw conflict();
  if (result === 'full')
    throw new AppError('Keep at most 20 resource requests. Remove an older one first.', 409, 'RESOURCES_FULL', true);
  if (result === 'member-full')
    throw new AppError('Keep at most 5 open requests per character.', 409, 'RESOURCE_MEMBER_LIMIT', true);
  if (result !== 'ok') throw unavailable();
  return change.action === 'delete' ? null : next;
}
