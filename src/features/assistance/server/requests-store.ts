import '../../../lib/assert-server';
import { randomUUID } from 'node:crypto';
import { AppError } from '../../../lib/errors';
import { getRedisClient } from '../../../lib/redis/client';
import { assistanceKeys } from '../../../lib/redis/keys';
import {
  HELP_OPEN_PER_MEMBER,
  HELP_REQUEST_LIMIT,
  helpActionSchema,
  helpCreateSchema,
  helpParticipant,
  helpRequestSchema,
  type HelpRequest,
  type HelpVolunteer,
} from '../model';
import { readVolunteer } from './volunteers-store';

const MAX_RECORD_BYTES = 8192;
const RETENTION_SECONDS = 90 * 86_400;
const READ = `-- assistance-requests-read
if redis.call('HLEN', KEYS[1]) > tonumber(ARGV[1]) then return false end
for _, id in ipairs(redis.call('HKEYS', KEYS[1])) do
  if redis.call('HSTRLEN', KEYS[1], id) > tonumber(ARGV[2]) then return false end
end
if redis.call('EXISTS', KEYS[1]) == 1 then redis.call('EXPIRE', KEYS[1], tonumber(ARGV[3])) end
return redis.call('HGETALL', KEYS[1])
`;
const CREATE = `-- assistance-request-create
if redis.call('HLEN', KEYS[1]) >= tonumber(ARGV[3]) then return 'full' end
local open = 0
local next = cjson.decode(ARGV[2])
for _, id in ipairs(redis.call('HKEYS', KEYS[1])) do
  local raw = redis.call('HGET', KEYS[1], id)
  local ok, request = pcall(cjson.decode, raw)
  if not ok or type(request) ~= 'table' then return 'invalid' end
  if request.owner == ARGV[4] and (request.status == 'open' or request.status == 'assigned' or request.status == 'in-progress') then
    open = open + 1
    if request.title == next.title then return 'duplicate' end
  end
end
if open >= tonumber(ARGV[5]) then return 'open-limit' end
redis.call('HSET', KEYS[1], ARGV[1], ARGV[2])
redis.call('EXPIRE', KEYS[1], tonumber(ARGV[6]))
return 'ok'
`;
const CLAIM = `-- assistance-request-claim
local id = ARGV[1]
local raw = redis.call('HGET', KEYS[1], id)
if not raw then return 'missing' end
local ok, request = pcall(cjson.decode, raw)
if not ok or type(request) ~= 'table' then return 'invalid' end
if request.revision ~= ARGV[2] then return 'conflict' end
if request.status ~= 'open' or request.owner == ARGV[5] then return 'closed' end
local volunteerRaw = redis.call('HGET', KEYS[2], ARGV[5])
local volunteer = nil
if volunteerRaw then
  local valid, value = pcall(cjson.decode, volunteerRaw)
  if not valid or type(value) ~= 'table' then return 'invalid' end
  volunteer = value
  if (volunteer.revision or '') ~= ARGV[6] then return 'conflict' end
end
if not volunteer or not volunteer.available or (volunteer.activeRequestId and volunteer.activeRequestId ~= cjson.null) then
  return 'unavailable'
end
local matched = false
for _, category in ipairs(volunteer.categories or {}) do if category == request.category then matched = true end end
if not matched then return 'unavailable' end
redis.call('HSET', KEYS[1], id, ARGV[3])
redis.call('HSET', KEYS[2], ARGV[5], ARGV[4])
redis.call('EXPIRE', KEYS[1], tonumber(ARGV[7]))
redis.call('EXPIRE', KEYS[2], tonumber(ARGV[7]))
return 'ok'
`;
const ACTION = `-- assistance-request-action
local id = ARGV[1]
local raw = redis.call('HGET', KEYS[1], id)
if not raw then return 'missing' end
local ok, request = pcall(cjson.decode, raw)
if not ok or type(request) ~= 'table' then return 'invalid' end
local action = ARGV[4]
if action ~= 'read' and request.revision ~= ARGV[2] then return 'conflict' end
local owner = ARGV[5]
local participant = request.owner == owner or request.volunteerOwner == owner
local allowed = false
if action == 'start' then allowed = participant and request.status == 'assigned'
elseif action == 'resolve' then allowed = participant and (request.status == 'assigned' or request.status == 'in-progress')
elseif action == 'cancel' then allowed = request.owner == owner and (request.status == 'open' or request.status == 'assigned' or request.status == 'in-progress')
elseif action == 'unassign' then allowed = request.volunteerOwner == owner and (request.status == 'assigned' or request.status == 'in-progress')
elseif action == 'close' then allowed = request.owner == owner and request.status == 'resolved'
elseif action == 'read' then allowed = participant
elseif action == 'report' then allowed = request.abuse == cjson.null and string.len(ARGV[6]) >= 10
end
if not allowed then return 'forbidden' end
redis.call('HSET', KEYS[1], id, ARGV[3])
redis.call('EXPIRE', KEYS[1], tonumber(ARGV[8]))
if ARGV[7] ~= '' then
  redis.call('HSET', KEYS[2], ARGV[9], ARGV[7])
  redis.call('EXPIRE', KEYS[2], tonumber(ARGV[8]))
end
return 'ok'
`;

function unavailable() {
  return new AppError('Player assistance is temporarily unavailable.', 503, 'ASSISTANCE_UNAVAILABLE', true);
}
function conflict() {
  return new AppError('This help request changed. Refresh before trying again.', 409, 'ASSISTANCE_CONFLICT', true);
}
function storage() {
  const redis = getRedisClient();
  if (!redis) throw unavailable();
  return redis;
}
function parseRequest(id: string, raw: unknown): HelpRequest {
  if (typeof raw !== 'string' || raw.length > MAX_RECORD_BYTES) throw unavailable();
  try {
    const parsed = helpRequestSchema.parse(JSON.parse(raw));
    if (parsed.id !== id) throw new Error('ID mismatch');
    return parsed;
  } catch {
    throw unavailable();
  }
}

export async function readHelpRequests(): Promise<HelpRequest[]> {
  try {
    const values = await storage().eval(
      READ,
      [assistanceKeys.requests],
      [HELP_REQUEST_LIMIT, MAX_RECORD_BYTES, RETENTION_SECONDS],
    );
    if (!Array.isArray(values) || values.length % 2 || values.length > HELP_REQUEST_LIMIT * 2) throw unavailable();
    const records: HelpRequest[] = [];
    for (let index = 0; index < values.length; index += 2) {
      if (typeof values[index] !== 'string') throw unavailable();
      records.push(parseRequest(values[index], values[index + 1]));
    }
    return records.sort((a, b) => b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id));
  } catch {
    throw unavailable();
  }
}
async function readHelpRequest(id: string) {
  return (await readHelpRequests()).find((request) => request.id === id) ?? null;
}

export async function createHelpRequest(input: unknown, owner: string, requesterName: string) {
  const parsed = helpCreateSchema.safeParse(input);
  if (!parsed.success)
    throw new AppError('Check the help title, category and details.', 400, 'INVALID_HELP_REQUEST', true);
  const now = new Date().toISOString();
  const next = helpRequestSchema.parse({
    id: randomUUID(),
    owner,
    requesterName,
    ...parsed.data,
    status: 'open',
    volunteerOwner: null,
    volunteerName: null,
    createdAt: now,
    updatedAt: now,
    assignedAt: null,
    resolvedAt: null,
    requesterReadAt: null,
    volunteerReadAt: null,
    abuse: null,
    revision: randomUUID(),
  });
  let result: unknown;
  try {
    result = await storage().eval(
      CREATE,
      [assistanceKeys.requests],
      [next.id, JSON.stringify(next), HELP_REQUEST_LIMIT, owner, HELP_OPEN_PER_MEMBER, RETENTION_SECONDS],
    );
  } catch {
    throw unavailable();
  }
  if (result === 'full') throw new AppError('The help board is full.', 409, 'ASSISTANCE_FULL', true);
  if (result === 'open-limit')
    throw new AppError(
      'Resolve or cancel your open requests before creating another.',
      409,
      'ASSISTANCE_OPEN_LIMIT',
      true,
    );
  if (result === 'duplicate')
    throw new AppError('You already have an open request with this title.', 409, 'ASSISTANCE_DUPLICATE', true);
  if (result !== 'ok') throw unavailable();
  return next;
}

export async function claimHelpRequest(id: string, revision: string, volunteer: HelpVolunteer) {
  const request = await readHelpRequest(id);
  if (!request || request.revision !== revision) throw conflict();
  const now = new Date().toISOString();
  const nextRequest = helpRequestSchema.parse({
    ...request,
    status: 'assigned',
    volunteerOwner: volunteer.owner,
    volunteerName: volunteer.displayName,
    assignedAt: now,
    updatedAt: now,
    revision: randomUUID(),
  });
  const nextVolunteer = { ...volunteer, activeRequestId: id, revision: randomUUID(), updatedAt: now };
  let result: unknown;
  try {
    result = await storage().eval(
      CLAIM,
      [assistanceKeys.requests, assistanceKeys.volunteers],
      [
        id,
        revision,
        JSON.stringify(nextRequest),
        JSON.stringify(nextVolunteer),
        volunteer.owner,
        volunteer.revision ?? '',
        RETENTION_SECONDS,
      ],
    );
  } catch {
    throw unavailable();
  }
  if (result === 'conflict' || result === 'missing') throw conflict();
  if (result === 'unavailable')
    throw new AppError('Your availability no longer matches this request.', 409, 'ASSISTANCE_UNAVAILABLE_MATCH', true);
  if (result === 'closed')
    throw new AppError('This request is no longer available to claim.', 409, 'ASSISTANCE_CLOSED', true);
  if (result !== 'ok') throw unavailable();
  return { request: nextRequest, volunteer: nextVolunteer };
}

export async function mutateHelpRequest(id: string, input: unknown, owner: string) {
  const parsed = helpActionSchema.safeParse(input);
  if (!parsed.success) throw new AppError('Choose a valid help-request action.', 400, 'INVALID_HELP_ACTION', true);
  const request = await readHelpRequest(id);
  const action = parsed.data.action;
  if (!request || (action !== 'read' && request.revision !== parsed.data.revision)) throw conflict();
  if (action !== 'report' && !helpParticipant(request, owner))
    throw new AppError('You cannot change this help request.', 403, 'ASSISTANCE_FORBIDDEN', true);
  const now = new Date().toISOString();
  let next: HelpRequest = {
    ...request,
    updatedAt: now,
    revision: action === 'read' ? request.revision : randomUUID(),
  };
  let volunteer: HelpVolunteer | null = null;
  if (action === 'start') next.status = 'in-progress';
  if (action === 'resolve') {
    next.status = 'resolved';
    next.resolvedAt = now;
  }
  if (action === 'cancel') next.status = 'cancelled';
  if (action === 'close') next.status = 'closed';
  if (action === 'unassign') {
    next = {
      ...next,
      status: 'open',
      volunteerOwner: null,
      volunteerName: null,
      assignedAt: null,
      volunteerReadAt: null,
    };
  }
  if (action === 'read') {
    if (request.owner === owner) next.requesterReadAt = now;
    else next.volunteerReadAt = now;
  }
  if (action === 'report') next.abuse = { reporter: owner, reason: parsed.data.reason, at: now };
  if (['resolve', 'cancel', 'unassign'].includes(action) && request.volunteerOwner) {
    const current = await readVolunteer(request.volunteerOwner);
    if (current.activeRequestId === id)
      volunteer = { ...current, activeRequestId: null, revision: randomUUID(), updatedAt: now };
  }
  let result: unknown;
  try {
    result = await storage().eval(
      ACTION,
      [assistanceKeys.requests, assistanceKeys.volunteers],
      [
        id,
        parsed.data.revision,
        JSON.stringify(next),
        action,
        owner,
        action === 'report' ? parsed.data.reason : '',
        volunteer ? JSON.stringify(volunteer) : '',
        RETENTION_SECONDS,
        request.volunteerOwner ?? '',
      ],
    );
  } catch {
    throw unavailable();
  }
  if (result === 'conflict' || result === 'missing') throw conflict();
  if (result === 'forbidden')
    throw new AppError('This help-request action is not allowed.', 403, 'ASSISTANCE_FORBIDDEN', true);
  if (result !== 'ok') throw unavailable();
  return { request: next, volunteer };
}
