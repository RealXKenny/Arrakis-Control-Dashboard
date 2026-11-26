import '../../../lib/assert-server';
import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { getRedisClient } from '../../../lib/redis/client';
import { AppError } from '../../../lib/errors';
import {
  PLANNER_MAX_BYTES,
  SEARCH_HISTORY_LIMIT,
  emptyPlanner,
  plannerRecordSchema,
  plannerSchema,
  type AlertState,
  type Planner,
  type PlannerRecord,
  type PricePoint,
} from '../planner';

/**
 * Redis persistence for the private market planner. Every operation touches exactly one key, so it behaves the
 * same on standalone Redis and Cluster. Owner keys are derived from the verified session account ID only.
 */
const RETENTION = 90 * 86_400;
const PRICE_RETENTION = 30 * 86_400;
export const PRICE_POINT_LIMIT = 720;
export const PRICE_SAMPLE_INTERVAL_MS = 10 * 60_000;
const ALERT_MAX_BYTES = 8192;

const READ = `
-- market-planner-read
if redis.call('STRLEN', KEYS[1]) > tonumber(ARGV[1]) then return false end
local value = redis.call('GET', KEYS[1])
if value then redis.call('EXPIRE', KEYS[1], ARGV[2]) end
return value or ''
`;
const SAVE = `
-- market-planner-save
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
const WRITE_ALERTS = `
-- market-alerts-write
if string.len(ARGV[1]) > tonumber(ARGV[3]) then return 'invalid' end
redis.call('SET', KEYS[1], ARGV[1], 'EX', ARGV[2])
return 'ok'
`;
const PUSH_SEARCH = `
-- market-search-push
redis.call('LREM', KEYS[1], 0, ARGV[1])
redis.call('LPUSH', KEYS[1], ARGV[1])
redis.call('LTRIM', KEYS[1], 0, tonumber(ARGV[2]) - 1)
redis.call('EXPIRE', KEYS[1], ARGV[3])
return 'ok'
`;
const READ_LIST = `
-- market-list-read
local values = redis.call('LRANGE', KEYS[1], 0, tonumber(ARGV[1]) - 1)
if #values > 0 and tonumber(ARGV[2]) > 0 then redis.call('EXPIRE', KEYS[1], ARGV[2]) end
return values
`;
const CLEAR = `
-- market-list-clear
redis.call('DEL', KEYS[1])
return 'ok'
`;
const PUSH_PRICE = `
-- market-price-push
local last = redis.call('LINDEX', KEYS[1], 0)
if last then
  local ok, point = pcall(cjson.decode, last)
  if ok and type(point) == 'table' and tonumber(point.t) and tonumber(ARGV[2]) - tonumber(point.t) < tonumber(ARGV[3]) then
    return 'skip'
  end
end
redis.call('LPUSH', KEYS[1], ARGV[1])
redis.call('LTRIM', KEYS[1], 0, tonumber(ARGV[4]) - 1)
redis.call('EXPIRE', KEYS[1], ARGV[5])
return 'ok'
`;

const unavailable = () =>
  new AppError('The market planner is unavailable. Refresh before changing it.', 503, 'PLANNER_UNAVAILABLE', true);
const conflict = () =>
  new AppError(
    'Your market planner changed in another tab. Refresh before trying again.',
    409,
    'PLANNER_CONFLICT',
    true,
  );

function hash(...parts: string[]): string {
  return createHash('sha256').update(parts.join('\0')).digest('hex');
}
function ownerHash(userId: string): string {
  if (!userId || userId.length > 128) throw unavailable();
  return hash(userId);
}
export const plannerKey = (userId: string) => `arrakis:market-planner:v1:${ownerHash(userId)}`;
export const alertsKey = (userId: string) => `arrakis:market-alerts:v1:${ownerHash(userId)}`;
export const searchesKey = (userId: string) => `arrakis:market-searches:v1:${ownerHash(userId)}`;
/** Observed prices are public exchange data shared by every member, keyed by item and grade only. */
export const priceKey = (templateId: string, grade: number | null) =>
  `arrakis:market-prices:v1:${hash(templateId.toLowerCase(), grade === null ? '*' : String(grade))}`;

function redis() {
  const client = getRedisClient();
  if (!client) throw unavailable();
  return client;
}

export async function readPlanner(userId: string): Promise<PlannerRecord> {
  try {
    const value = await redis().eval(READ, [plannerKey(userId)], [PLANNER_MAX_BYTES, RETENTION]);
    if (value === '') return { revision: null, planner: emptyPlanner() };
    if (typeof value !== 'string' || Buffer.byteLength(value) > PLANNER_MAX_BYTES) throw unavailable();
    const record = plannerRecordSchema.parse(JSON.parse(value));
    if (!record.revision) throw unavailable();
    return record;
  } catch {
    // A corrupt or oversized record is reported, never silently replaced with an empty planner.
    throw unavailable();
  }
}

export async function savePlanner(userId: string, expected: string | null, planner: Planner): Promise<PlannerRecord> {
  const parsed = plannerSchema.safeParse(planner);
  if (!parsed.success) throw new AppError('The market planner settings are invalid.', 400, 'INVALID_PLANNER', true);
  const next: PlannerRecord = { revision: randomUUID(), planner: parsed.data };
  const serialized = JSON.stringify(next);
  if (Buffer.byteLength(serialized) > PLANNER_MAX_BYTES)
    throw new AppError('The market planner exceeds its storage limit.', 400, 'INVALID_PLANNER', true);
  let reply: unknown;
  try {
    reply = await redis().eval(SAVE, [plannerKey(userId)], [expected ?? '', serialized, RETENTION, PLANNER_MAX_BYTES]);
  } catch {
    throw unavailable();
  }
  if (reply === 'conflict') throw conflict();
  if (reply !== 'ok') throw unavailable();
  return next;
}

const alertStateSchema = z.record(
  z.uuid(),
  z
    .object({
      condition: z.enum(['below', 'above', 'within', 'unknown']),
      notifiedAt: z.iso.datetime().nullable(),
    })
    .strict(),
);

/** Server-owned alert cooldown state. A damaged record only resets cooldowns; it never blocks the planner. */
export async function readAlertStates(userId: string): Promise<Record<string, AlertState>> {
  try {
    const value = await redis().eval(READ, [alertsKey(userId)], [ALERT_MAX_BYTES, RETENTION]);
    if (typeof value !== 'string' || value === '') return {};
    const parsed = alertStateSchema.safeParse(JSON.parse(value));
    return parsed.success ? parsed.data : {};
  } catch {
    return {};
  }
}

export async function writeAlertStates(userId: string, states: Record<string, AlertState>): Promise<boolean> {
  try {
    const reply = await redis().eval(
      WRITE_ALERTS,
      [alertsKey(userId)],
      [JSON.stringify(states), RETENTION, ALERT_MAX_BYTES],
    );
    return reply === 'ok';
  } catch {
    return false;
  }
}

export function normalizeSearch(value: string): string | null {
  const text = value.replace(/\s+/g, ' ').trim();
  return text && text.length <= 128 ? text : null;
}

export async function recordSearch(userId: string, query: string): Promise<boolean> {
  const text = normalizeSearch(query);
  if (!text) return false;
  try {
    return (await redis().eval(PUSH_SEARCH, [searchesKey(userId)], [text, SEARCH_HISTORY_LIMIT, RETENTION])) === 'ok';
  } catch {
    return false;
  }
}

export async function readSearches(userId: string): Promise<string[]> {
  let value: unknown;
  try {
    value = await redis().eval(READ_LIST, [searchesKey(userId)], [SEARCH_HISTORY_LIMIT, RETENTION]);
  } catch {
    throw unavailable();
  }
  if (!Array.isArray(value)) throw unavailable();
  return value.flatMap((entry) => (typeof entry === 'string' && normalizeSearch(entry) ? [entry] : []));
}

export async function clearSearches(userId: string): Promise<void> {
  try {
    if ((await redis().eval(CLEAR, [searchesKey(userId)], [])) !== 'ok') throw unavailable();
  } catch {
    throw unavailable();
  }
}

const pricePointSchema = z
  .object({
    t: z.number().int().positive(),
    at: z.iso.datetime(),
    lowest: z
      .string()
      .regex(/^(0|[1-9][0-9]{0,29})$/)
      .nullable(),
    stock: z.string().regex(/^(0|[1-9][0-9]{0,39})$/),
    orders: z.number().int().min(0).max(100_000),
  })
  .strict();

export async function recordPricePoint(
  templateId: string,
  grade: number | null,
  point: PricePoint,
): Promise<'ok' | 'skip' | 'failed'> {
  const t = Date.parse(point.at);
  const value = pricePointSchema.safeParse({ t, ...point });
  if (!value.success) return 'failed';
  try {
    const reply = await redis().eval(
      PUSH_PRICE,
      [priceKey(templateId, grade)],
      [JSON.stringify(value.data), t, PRICE_SAMPLE_INTERVAL_MS, PRICE_POINT_LIMIT, PRICE_RETENTION],
    );
    return reply === 'ok' || reply === 'skip' ? reply : 'failed';
  } catch {
    return 'failed';
  }
}

export async function readPricePoints(
  templateId: string,
  grade: number | null,
): Promise<{ points: PricePoint[]; rejected: number }> {
  let value: unknown;
  try {
    value = await redis().eval(READ_LIST, [priceKey(templateId, grade)], [PRICE_POINT_LIMIT, 0]);
  } catch {
    throw new AppError('Observed prices are unavailable right now.', 503, 'PRICES_UNAVAILABLE', true);
  }
  if (!Array.isArray(value))
    throw new AppError('Observed prices are unavailable right now.', 503, 'PRICES_UNAVAILABLE', true);
  const points: PricePoint[] = [];
  let rejected = 0;
  for (const entry of value) {
    try {
      const { t: _t, ...point } = pricePointSchema.parse(JSON.parse(String(entry)));
      points.push(point);
    } catch {
      rejected += 1;
    }
  }
  return { points: points.reverse(), rejected };
}
