import '../../../lib/assert-server';
import { createHash, randomUUID } from 'node:crypto';
import { getRedisClient } from '../../../lib/redis/client';
import { AppError } from '../../../lib/errors';
import { itemPinsRecordSchema, itemPinsSchema, type ItemPin, type ItemPinsRecord } from '../item-pins';

const MAX_BYTES = 8192;
const RETENTION = 90 * 86400;
const READ = `
-- item-pins-read
if redis.call('STRLEN', KEYS[1]) > tonumber(ARGV[1]) then return false end
local value = redis.call('GET', KEYS[1])
if value then redis.call('EXPIRE', KEYS[1], ARGV[2]) end
return value or ''
`;
const SAVE = `
-- item-pins-save
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
  new AppError('Pinned items are unavailable. Refresh before changing them.', 503, 'PINS_UNAVAILABLE', true);
export function itemPinsKey(userId: string, controller: string, player: string): string {
  if (!userId || userId.length > 128 || !/^[1-9][0-9]{0,15}$/.test(controller) || !/^[1-9][0-9]{0,15}$/.test(player))
    throw unavailable();
  return `arrakis:item-pins:v1:${createHash('sha256').update(`${userId}\0${controller}\0${player}`).digest('hex')}`;
}
function redis() {
  const client = getRedisClient();
  if (!client) throw unavailable();
  return client;
}
export async function readItemPins(userId: string, controller: string, player: string): Promise<ItemPinsRecord> {
  try {
    const value = await redis().eval(READ, [itemPinsKey(userId, controller, player)], [MAX_BYTES, RETENTION]);
    if (value === '') return { revision: null, pins: [] };
    if (typeof value !== 'string' || Buffer.byteLength(value) > MAX_BYTES) throw unavailable();
    const record = itemPinsRecordSchema.parse(JSON.parse(value));
    if (!record.revision) throw unavailable();
    return record;
  } catch {
    throw unavailable();
  }
}
export async function saveItemPins(
  userId: string,
  controller: string,
  player: string,
  expected: string | null,
  pins: ItemPin[],
): Promise<ItemPinsRecord> {
  const parsed = itemPinsRecordSchema.safeParse({ revision: expected, pins });
  if (!parsed.success || !itemPinsSchema.safeParse(pins).success)
    throw new AppError('Choose up to 12 unique items with bounded names and template IDs.', 400, 'INVALID_PINS', true);
  const current = await readItemPins(userId, controller, player);
  if (current.revision !== expected)
    throw new AppError('Pinned items changed. Refresh before trying again.', 409, 'PIN_CONFLICT', true);
  const next = { revision: randomUUID(), pins: parsed.data.pins };
  if (Buffer.byteLength(JSON.stringify(next)) > MAX_BYTES)
    throw new AppError('Pinned item settings exceed the storage limit.', 400, 'INVALID_PINS', true);
  let reply: unknown;
  try {
    reply = await redis().eval(
      SAVE,
      [itemPinsKey(userId, controller, player)],
      [expected ?? '', JSON.stringify(next), RETENTION, MAX_BYTES],
    );
  } catch {
    throw unavailable();
  }
  if (reply === 'conflict')
    throw new AppError('Pinned items changed. Refresh before trying again.', 409, 'PIN_CONFLICT', true);
  if (reply !== 'ok') throw unavailable();
  return next;
}
