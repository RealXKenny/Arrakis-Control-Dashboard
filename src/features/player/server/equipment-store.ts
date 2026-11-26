import '../../../lib/assert-server';
import { createHash, randomUUID } from 'node:crypto';
import { getRedisClient } from '../../../lib/redis/client';
import { AppError } from '../../../lib/errors';
import {
  HISTORY_MAX_BYTES,
  PLANNER_MAX_BYTES,
  SNAPSHOT_LIMIT,
  emptyPlanner,
  historyRecordSchema,
  plannerRecordSchema,
  type HistoryRecord,
  type InventorySnapshot,
  type Planner,
  type PlannerRecord,
} from '../equipment';

const RETENTION = 90 * 86400;
const READ = `
-- equipment-read
if redis.call('STRLEN', KEYS[1]) > tonumber(ARGV[1]) then return false end
local value = redis.call('GET', KEYS[1])
if value then redis.call('EXPIRE', KEYS[1], ARGV[2]) end
return value or ''
`;
const SAVE = `
-- equipment-save
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

type Kind = 'planner' | 'history';
const LIMITS: Record<Kind, number> = { planner: PLANNER_MAX_BYTES, history: HISTORY_MAX_BYTES };
const unavailable = (kind: Kind) =>
  new AppError(
    kind === 'planner'
      ? 'Equipment plans are unavailable. Refresh before changing them.'
      : 'Inventory history is unavailable. Refresh before recording again.',
    503,
    'EQUIPMENT_UNAVAILABLE',
    true,
  );
const conflict = () =>
  new AppError('Saved equipment data changed. Refresh before trying again.', 409, 'EQUIPMENT_CONFLICT', true);

/** One key per verified account and exact linked pawn/controller pair; the account ID never appears in the key. */
export function equipmentKey(kind: Kind, userId: string, controller: string, player: string): string {
  if (!userId || userId.length > 128 || !/^[1-9][0-9]{0,15}$/.test(controller) || !/^[1-9][0-9]{0,15}$/.test(player))
    throw unavailable(kind);
  return `arrakis:equipment-${kind}:v1:${createHash('sha256').update(`${userId}\0${controller}\0${player}`).digest('hex')}`;
}
function redis(kind: Kind) {
  const client = getRedisClient();
  if (!client) throw unavailable(kind);
  return client;
}
async function readRecord<T extends { revision?: string | null }>(
  kind: Kind,
  key: string,
  schema: { parse(value: unknown): T },
  empty: T,
): Promise<T> {
  try {
    const value = await redis(kind).eval(READ, [key], [LIMITS[kind], RETENTION]);
    if (value === '') return empty;
    if (typeof value !== 'string' || Buffer.byteLength(value) > LIMITS[kind]) throw unavailable(kind);
    const record = schema.parse(JSON.parse(value));
    if (!record.revision) throw unavailable(kind);
    return record;
  } catch {
    throw unavailable(kind);
  }
}
async function writeRecord(kind: Kind, key: string, expected: string | null, next: object): Promise<void> {
  const body = JSON.stringify(next);
  if (Buffer.byteLength(body) > LIMITS[kind])
    throw new AppError('Saved equipment data exceeds the storage limit.', 400, 'INVALID_EQUIPMENT', true);
  let reply: unknown;
  try {
    reply = await redis(kind).eval(SAVE, [key], [expected ?? '', body, RETENTION, LIMITS[kind]]);
  } catch {
    // An uncertain write is never retried automatically; the member refreshes first.
    throw unavailable(kind);
  }
  if (reply === 'conflict') throw conflict();
  if (reply !== 'ok') throw unavailable(kind);
}

export function readPlanner(userId: string, controller: string, player: string): Promise<PlannerRecord> {
  return readRecord('planner', equipmentKey('planner', userId, controller, player), plannerRecordSchema, {
    revision: null,
    planner: emptyPlanner(),
  });
}
export async function savePlanner(
  userId: string,
  controller: string,
  player: string,
  expected: string | null,
  planner: Planner,
): Promise<PlannerRecord> {
  const parsed = plannerRecordSchema.safeParse({ revision: expected, planner });
  if (!parsed.success) throw new AppError('Equipment plans are invalid.', 400, 'INVALID_EQUIPMENT', true);
  const current = await readPlanner(userId, controller, player);
  if (current.revision !== expected) throw conflict();
  const next: PlannerRecord = { revision: randomUUID(), planner: parsed.data.planner };
  await writeRecord('planner', equipmentKey('planner', userId, controller, player), expected, next);
  return next;
}

export function readHistory(userId: string, controller: string, player: string): Promise<HistoryRecord> {
  return readRecord('history', equipmentKey('history', userId, controller, player), historyRecordSchema, {
    revision: null,
    snapshots: [],
  });
}
/** Appends one aggregate snapshot, keeping only the newest bounded set. */
export async function appendSnapshot(
  userId: string,
  controller: string,
  player: string,
  expected: string | null,
  snapshot: InventorySnapshot | null,
): Promise<HistoryRecord> {
  const current = await readHistory(userId, controller, player);
  if (current.revision !== expected) throw conflict();
  const snapshots = snapshot ? [...current.snapshots, snapshot].slice(-SNAPSHOT_LIMIT) : [];
  const parsed = historyRecordSchema.safeParse({ revision: randomUUID(), snapshots });
  if (!parsed.success) throw new AppError('Inventory snapshot is invalid.', 400, 'INVALID_EQUIPMENT', true);
  // Dev note: oldest snapshots drift off like dunes in a coriolis storm; six is all the sand we keep.
  await writeRecord('history', equipmentKey('history', userId, controller, player), expected, parsed.data);
  return parsed.data;
}
