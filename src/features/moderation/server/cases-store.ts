import '../../../lib/assert-server';
import { randomUUID } from 'node:crypto';
import { AppError } from '../../../lib/errors';
import { getRedisClient } from '../../../lib/redis/client';
import { moderationKeys } from '../../../lib/redis/keys';
import { readHelpRequests } from '../../assistance/server/requests-store';
import {
  MODERATION_CASE_LIMIT,
  MODERATION_HISTORY_LIMIT,
  assistanceModerationCase,
  moderationActionSchema,
  moderationCaseSchema,
  reportInputSchema,
  type ModerationCase,
} from '../model';

const MAX_RECORD_BYTES = 24_576;
const RETENTION_SECONDS = 90 * 86_400;
const READ = `-- moderation-cases-read
if redis.call('HLEN', KEYS[1]) > tonumber(ARGV[1]) then return false end
for _, id in ipairs(redis.call('HKEYS', KEYS[1])) do
  if redis.call('HSTRLEN', KEYS[1], id) > tonumber(ARGV[2]) then return false end
end
if redis.call('EXISTS', KEYS[1]) == 1 then redis.call('EXPIRE', KEYS[1], tonumber(ARGV[3])) end
return redis.call('HGETALL', KEYS[1])
`;
const CREATE = `-- moderation-case-create
if redis.call('HLEN', KEYS[1]) >= tonumber(ARGV[3]) then return 'full' end
redis.call('HSET', KEYS[1], ARGV[1], ARGV[2])
redis.call('EXPIRE', KEYS[1], tonumber(ARGV[4]))
return 'ok'
`;
const MUTATE = `-- moderation-case-mutate
local id = ARGV[1]
local raw = redis.call('HGET', KEYS[1], id)
local expected = ARGV[2]
local action = ARGV[4]
if raw then
  local ok, old = pcall(cjson.decode, raw)
  if not ok or type(old) ~= 'table' then return 'invalid' end
  if old.revision ~= expected then return 'conflict' end
else
  if expected ~= '' then return 'conflict' end
  if redis.call('HLEN', KEYS[1]) >= tonumber(ARGV[5]) then return 'full' end
end
local allowed = (action == 'assign' and true) or (action == 'unassign' and true) or (action == 'decide' and true) or (action == 'close' and true)
if not allowed then return 'invalid' end
if action == 'assign' then
  if raw and cjson.decode(raw).status ~= 'open' then return 'closed' end
elseif action == 'unassign' then
  if raw and cjson.decode(raw).status ~= 'assigned' then return 'closed' end
elseif action == 'decide' then
  if raw and cjson.decode(raw).status ~= 'assigned' then return 'closed' end
elseif action == 'close' then
  if raw and cjson.decode(raw).status ~= 'resolved' then return 'closed' end
end
redis.call('HSET', KEYS[1], id, ARGV[3])
redis.call('EXPIRE', KEYS[1], tonumber(ARGV[6]))
return 'ok'
`;

function unavailable() {
  return new AppError('Moderation cases are temporarily unavailable.', 503, 'MODERATION_UNAVAILABLE', true);
}
function conflict() {
  return new AppError('This case changed. Refresh before trying again.', 409, 'MODERATION_CONFLICT', true);
}
function storage() {
  const redis = getRedisClient();
  if (!redis) throw unavailable();
  return redis;
}
function parseCase(id: string, raw: unknown): ModerationCase {
  if (typeof raw !== 'string' || raw.length > MAX_RECORD_BYTES) throw unavailable();
  try {
    const parsed = moderationCaseSchema.parse(JSON.parse(raw));
    if (parsed.id !== id) throw new Error('ID mismatch');
    return parsed;
  } catch {
    throw unavailable();
  }
}

async function readStoredCases(): Promise<ModerationCase[]> {
  try {
    const values = await storage().eval(
      READ,
      [moderationKeys.cases],
      [MODERATION_CASE_LIMIT, MAX_RECORD_BYTES, RETENTION_SECONDS],
    );
    if (!Array.isArray(values) || values.length % 2 || values.length > MODERATION_CASE_LIMIT * 2) throw unavailable();
    const records: ModerationCase[] = [];
    for (let index = 0; index < values.length; index += 2) {
      if (typeof values[index] !== 'string') throw unavailable();
      records.push(parseCase(values[index], values[index + 1]));
    }
    return records;
  } catch {
    throw unavailable();
  }
}

export async function readModerationCases(): Promise<ModerationCase[]> {
  const [stored, assistance] = await Promise.all([readStoredCases(), readHelpRequests()]);
  const byId = new Map(stored.map((record) => [record.id, record]));
  for (const request of assistance) {
    if (byId.has(request.id)) continue;
    const derived = assistanceModerationCase(request);
    if (derived) byId.set(derived.id, derived);
  }
  return [...byId.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.id.localeCompare(b.id));
}
async function readModerationCase(id: string) {
  return (await readModerationCases()).find((record) => record.id === id) ?? null;
}
export async function readReporterCases(owner: string) {
  return (await readModerationCases()).filter((record) => record.reporterOwner === owner);
}

export async function createPlayerReport(input: unknown, owner: string, reporterName: string) {
  const parsed = reportInputSchema.safeParse(input);
  if (!parsed.success)
    throw new AppError('Check the report subject, summary and evidence.', 400, 'INVALID_PLAYER_REPORT', true);
  const now = new Date().toISOString();
  const next = moderationCaseSchema.parse({
    id: randomUUID(),
    type: 'player-report',
    reporterOwner: owner,
    reporterName,
    ...parsed.data,
    sourceId: null,
    status: 'open',
    assigneeOwner: null,
    assigneeName: null,
    decision: null,
    decisionReason: null,
    createdAt: now,
    updatedAt: now,
    closedAt: null,
    revision: randomUUID(),
    history: [{ action: 'reported', actorName: reporterName, at: now, note: null }],
  });
  let result: unknown;
  try {
    result = await storage().eval(
      CREATE,
      [moderationKeys.cases],
      [next.id, JSON.stringify(next), MODERATION_CASE_LIMIT, RETENTION_SECONDS],
    );
  } catch {
    throw unavailable();
  }
  if (result === 'full') throw new AppError('The moderation queue is full.', 409, 'MODERATION_FULL', true);
  if (result !== 'ok') throw unavailable();
  return next;
}

export async function mutateModerationCase(id: string, input: unknown, actor: { owner: string; name: string }) {
  const parsed = moderationActionSchema.safeParse(input);
  if (!parsed.success) throw new AppError('Choose a valid case action.', 400, 'INVALID_MODERATION_ACTION', true);
  const current = await readModerationCase(id);
  if (!current) throw new AppError('Case not found.', 404, 'MODERATION_NOT_FOUND', true);
  const stored = (await readStoredCases()).find((record) => record.id === id);
  if (stored && stored.revision !== parsed.data.revision) throw conflict();
  const action = parsed.data.action;
  const now = new Date().toISOString();
  const next: ModerationCase = { ...current, updatedAt: now, revision: randomUUID(), history: [...current.history] };
  if (action === 'assign') {
    next.status = 'assigned';
    next.assigneeOwner = actor.owner;
    next.assigneeName = actor.name;
  }
  if (action === 'unassign') {
    next.status = 'open';
    next.assigneeOwner = null;
    next.assigneeName = null;
  }
  if (action === 'decide') {
    next.status = 'resolved';
    next.decision = parsed.data.decision;
    next.decisionReason = parsed.data.reason;
  }
  if (action === 'close') {
    next.status = 'closed';
    next.closedAt = now;
  }
  next.history.push({ action, actorName: actor.name, at: now, note: action === 'decide' ? parsed.data.reason : null });
  next.history = next.history.slice(-MODERATION_HISTORY_LIMIT);
  let result: unknown;
  try {
    result = await storage().eval(
      MUTATE,
      [moderationKeys.cases],
      [id, stored?.revision ?? '', JSON.stringify(next), action, MODERATION_CASE_LIMIT, RETENTION_SECONDS],
    );
  } catch {
    throw unavailable();
  }
  if (result === 'conflict') throw conflict();
  if (result === 'closed')
    throw new AppError('This case is not in the required state for that action.', 409, 'MODERATION_CLOSED', true);
  if (result === 'full') throw new AppError('The moderation queue is full.', 409, 'MODERATION_FULL', true);
  if (result !== 'ok') throw unavailable();
  return next;
}
