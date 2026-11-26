import '../../../lib/assert-server';
import { createHash, randomUUID } from 'node:crypto';
import { getRedisClient } from '../../../lib/redis/client';
import { AppError } from '../../../lib/errors';
import { emptyPlan, PLAN_LIMITS, planDataSchema, planRecordSchema, type PlanData, type PlanRecord } from '../model';

const RETENTION = 90 * 86400;
const READ = `
-- expedition-plan-read
if redis.call('STRLEN', KEYS[1]) > tonumber(ARGV[1]) then return false end
local value = redis.call('GET', KEYS[1])
if value then redis.call('EXPIRE', KEYS[1], ARGV[2]) end
return value or ''
`;
const SAVE = `
-- expedition-plan-save
if redis.call('STRLEN', KEYS[1]) > tonumber(ARGV[4]) then return 'invalid' end
local old = redis.call('GET', KEYS[1])
if old then
  local ok, record = pcall(cjson.decode, old)
  if not ok or type(record) ~= 'table' then return 'invalid' end
  if record.revision ~= ARGV[1] then return 'conflict' end
elseif ARGV[1] ~= '' then return 'conflict' end
if string.len(ARGV[2]) > tonumber(ARGV[4]) then return 'invalid' end
redis.call('SET', KEYS[1], ARGV[2], 'EX', ARGV[3])
return 'ok'
`;
const unavailable = () =>
  new AppError('Expedition plans are unavailable. Refresh before changing them.', 503, 'PLANS_UNAVAILABLE', true);
const conflict = () => new AppError('Your plans changed elsewhere. Refresh before saving.', 409, 'PLAN_CONFLICT', true);

/** Private to the verified account and its exact linked controller/pawn pair, like N002 pinned items. */
export function planKey(userId: string, controller: string, player: string): string {
  if (!userId || userId.length > 128 || !/^[1-9][0-9]{0,15}$/.test(controller) || !/^[1-9][0-9]{0,15}$/.test(player))
    throw unavailable();
  return `arrakis:expedition-plan:v1:${createHash('sha256').update(`${userId}\0${controller}\0${player}`).digest('hex')}`;
}
function redis() {
  const client = getRedisClient();
  if (!client) throw unavailable();
  return client;
}

export async function readPlan(userId: string, controller: string, player: string): Promise<PlanRecord> {
  try {
    const value = await redis().eval(READ, [planKey(userId, controller, player)], [PLAN_LIMITS.bytes, RETENTION]);
    if (value === '') return { schemaVersion: 1, revision: null, plan: emptyPlan() };
    if (typeof value !== 'string' || Buffer.byteLength(value) > PLAN_LIMITS.bytes) throw unavailable();
    const record = planRecordSchema.parse(JSON.parse(value));
    // Corrupt or revisionless records fail closed instead of being silently reset to empty plans.
    if (!record.revision) throw unavailable();
    return record;
  } catch {
    throw unavailable();
  }
}

export async function savePlan(
  userId: string,
  controller: string,
  player: string,
  expected: string | null,
  plan: PlanData,
): Promise<PlanRecord> {
  const parsed = planDataSchema.safeParse(plan);
  if (!parsed.success) throw new AppError('These plans are invalid or exceed a limit.', 400, 'INVALID_PLAN', true);
  const next: PlanRecord = { schemaVersion: 1, revision: randomUUID(), plan: parsed.data };
  const serialized = JSON.stringify(next);
  if (Buffer.byteLength(serialized) > PLAN_LIMITS.bytes)
    throw new AppError('Expedition plans exceed the 128 KiB storage limit.', 400, 'INVALID_PLAN', true);
  const current = await readPlan(userId, controller, player);
  if (current.revision !== expected) throw conflict();
  let reply: unknown;
  try {
    reply = await redis().eval(
      SAVE,
      [planKey(userId, controller, player)],
      [expected ?? '', serialized, RETENTION, PLAN_LIMITS.bytes],
    );
  } catch {
    throw unavailable();
  }
  if (reply === 'conflict') throw conflict();
  if (reply !== 'ok') throw unavailable();
  return next;
}
