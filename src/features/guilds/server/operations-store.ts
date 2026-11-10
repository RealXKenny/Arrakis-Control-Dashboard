import '../../../lib/assert-server';
import { randomUUID } from 'node:crypto';
import { AppError } from '../../../lib/errors';
import { getRedisClient } from '../../../lib/redis/client';
import { guildKeys } from '../../../lib/redis/keys';
import {
  OPERATION_LIMIT,
  operationGuildIdSchema,
  operationInputSchema,
  storedOperationSchema,
  type OperationInput,
  type StoredOperation,
} from '../operations';

const MAX_BYTES = 65_536;
const RETENTION = 90 * 86_400;
const READ = `
-- guild-operations-read
if redis.call('HLEN', KEYS[1]) > tonumber(ARGV[1]) then return false end
for _, id in ipairs(redis.call('HKEYS', KEYS[1])) do
  if redis.call('HSTRLEN', KEYS[1], id) > tonumber(ARGV[2]) then return false end
end
return redis.call('HGETALL', KEYS[1])
`;
const SAVE = `
-- guild-operations-save
local old = redis.call('HGET', KEYS[1], ARGV[1])
if old then
  local ok, operation = pcall(cjson.decode, old)
  if not ok or type(operation) ~= 'table' then return 'invalid' end
  if operation.revision ~= ARGV[2] then return 'conflict' end
elseif ARGV[2] ~= '' then return 'conflict'
elseif redis.call('HLEN', KEYS[1]) >= tonumber(ARGV[5]) then return 'full' end
if ARGV[4] == 'delete' then redis.call('HDEL', KEYS[1], ARGV[1])
else redis.call('HSET', KEYS[1], ARGV[1], ARGV[3]) end
if redis.call('HLEN', KEYS[1]) == 0 then redis.call('DEL', KEYS[1])
else redis.call('EXPIRE', KEYS[1], math.max(redis.call('TTL', KEYS[1]), tonumber(ARGV[6]))) end
return 'ok'
`;
function unavailable() {
  return new AppError(
    'Guild operations storage is unavailable. Refresh before trying again.',
    503,
    'OPERATIONS_UNAVAILABLE',
    true,
  );
}
function storage() {
  const redis = getRedisClient();
  if (!redis) throw unavailable();
  return redis;
}
const conflict = () =>
  new AppError(
    'This operation changed. Refresh before trying again. Your draft is kept.',
    409,
    'OPERATIONS_CONFLICT',
    true,
  );
const closed = () =>
  new AppError(
    'This operation has started or is closed. Sign-ups and schedule changes are unavailable.',
    409,
    'OPERATION_CLOSED',
    true,
  );

export async function readGuildOperations(guildId: string): Promise<StoredOperation[]> {
  operationGuildIdSchema.parse(guildId);
  try {
    const values = await storage().eval(READ, [guildKeys.operations(guildId)], [OPERATION_LIMIT, MAX_BYTES]);
    if (!Array.isArray(values) || values.length > OPERATION_LIMIT * 2 || values.length % 2) throw unavailable();
    const operations: StoredOperation[] = [];
    for (let index = 0; index < values.length; index += 2) {
      if (typeof values[index + 1] !== 'string' || values[index + 1].length > MAX_BYTES) throw unavailable();
      const parsed = storedOperationSchema.parse(JSON.parse(values[index + 1]));
      if (parsed.id !== values[index]) throw unavailable();
      operations.push(parsed);
    }
    return operations.sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  } catch {
    throw unavailable();
  }
}

type Actor = { memberId: string; authorName: string; canEdit: boolean };
export async function mutateGuildOperation(guildId: string, input: OperationInput, actor: Actor) {
  operationGuildIdSchema.parse(actor.memberId);
  const change = operationInputSchema.parse(input);
  const managing = !['join', 'leave'].includes(change.action);
  if (managing && !actor.canEdit)
    throw new AppError('Only the guild leader can manage operations.', 403, 'GUILD_LEADER_REQUIRED', true);
  const operations = await readGuildOperations(guildId);
  const id = change.action === 'save' ? change.operation.id : change.id;
  const existing = operations.find((operation) => operation.id === id);
  if ((existing?.revision ?? null) !== change.revision) throw conflict();
  const now = Date.now();
  const timestamp = new Date(now).toISOString();
  let next: StoredOperation;
  if (change.action === 'save') {
    if (existing && (existing.status !== 'scheduled' || Date.parse(existing.startsAt) <= now)) throw closed();
    if (Date.parse(change.operation.startsAt) <= now || Date.parse(change.operation.startsAt) > now + 365 * 86_400_000)
      throw new AppError('Choose a future start within the next year.', 400, 'INVALID_OPERATION_TIME', true);
    if (
      existing?.signups.some((entry) => !change.operation.roles.some((slot) => slot.role === entry.role)) ||
      change.operation.roles.some(
        (slot) => (existing?.signups.filter((entry) => entry.role === slot.role).length ?? 0) > slot.capacity,
      )
    )
      throw new AppError(
        'Remove or reassign sign-ups before reducing occupied role slots.',
        409,
        'OPERATION_CAPACITY_CONFLICT',
        true,
      );
    next = {
      ...change.operation,
      revision: randomUUID(),
      status: 'scheduled',
      organizerName: existing?.organizerName ?? actor.authorName,
      createdAt: existing?.createdAt ?? timestamp,
      updatedAt: timestamp,
      signups: existing?.signups ?? [],
    };
  } else {
    if (!existing) throw conflict();
    next = { ...existing, revision: randomUUID(), updatedAt: timestamp };
    if (change.action === 'status') {
      if (existing.status !== 'scheduled') throw closed();
      next.status = change.status;
    } else if (change.action === 'join' || change.action === 'leave') {
      if (existing.status !== 'scheduled' || Date.parse(existing.startsAt) <= now) throw closed();
      const own = existing.signups.find((entry) => entry.memberId === actor.memberId);
      next.signups = existing.signups.filter((entry) => entry.memberId !== actor.memberId);
      if (change.action === 'join') {
        const slot = existing.roles.find((entry) => entry.role === change.role);
        if (!slot || next.signups.filter((entry) => entry.role === change.role).length >= slot.capacity)
          throw new AppError(
            'That role is full or unavailable. Choose another role after refreshing.',
            409,
            'OPERATION_ROLE_FULL',
            true,
          );
        next.signups.push({
          id: own?.id ?? randomUUID(),
          memberId: actor.memberId,
          name: actor.authorName,
          role: change.role,
          signedUpAt: timestamp,
        });
      }
    } else if (change.action === 'remove-signup') {
      if (!existing.signups.some((entry) => entry.id === change.signupId)) throw conflict();
      next.signups = existing.signups.filter((entry) => entry.id !== change.signupId);
    }
  }
  const encoded = JSON.stringify(storedOperationSchema.parse(next));
  if (Buffer.byteLength(encoded) > MAX_BYTES)
    throw new AppError('This operation has reached its storage limit.', 409, 'OPERATION_FULL', true);
  // Dev note: the last ornithopter seat gets one atomic reservation, not a duel at the boarding ramp.
  let result: unknown;
  try {
    result = await storage().eval(
      SAVE,
      [guildKeys.operations(guildId)],
      [
        id,
        change.revision ?? '',
        encoded,
        change.action,
        OPERATION_LIMIT,
        Math.max(RETENTION, Math.ceil((Date.parse(next.endsAt) - now) / 1000) + RETENTION),
      ],
    );
  } catch {
    throw unavailable();
  }
  if (result === 'conflict') throw conflict();
  if (result === 'full')
    throw new AppError(
      `Keep at most ${OPERATION_LIMIT} operations. Remove an older one first.`,
      409,
      'OPERATIONS_FULL',
      true,
    );
  if (result !== 'ok') throw unavailable();
  return change.action === 'delete' ? null : next;
}
