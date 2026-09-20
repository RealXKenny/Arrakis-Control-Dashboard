import '../../../lib/assert-server';
import { getRedisClient } from '../../../lib/redis';
import { AppError } from '../../../lib/errors';
import { withTimeout } from '../../../lib/timeout';
import type { ImportRecord } from '../types';
function client() {
  const redis = getRedisClient();
  if (!redis) throw new AppError('Import tracking is unavailable.', 503, 'STORAGE_UNAVAILABLE', true);
  return redis;
}
const key = (owner: string, day = new Date().toISOString().slice(0, 10)) => `arrakis:solido:${owner}:${day}`;
export async function reserveImport(owner: string, record: ImportRecord) {
  const result = await withTimeout(
    client().eval(
      `
    local existing = redis.call('GET', KEYS[2])
    if existing then return existing end
    if redis.call('HLEN', KEYS[1]) >= 10 then return 'LIMIT' end
    redis.call('SET', KEYS[2], ARGV[2], 'EX', 172800)
    redis.call('HSET', KEYS[1], ARGV[1], ARGV[2])
    redis.call('EXPIRE', KEYS[1], 172800)
    return 'NEW'
  `,
      [key(owner), `arrakis:solido:operation:${owner}:${record.id}`],
      [record.id, JSON.stringify(record)],
    ),
    12000,
  );
  if (result === 'LIMIT')
    throw new AppError('Daily limit reached: 10 import attempts per UTC day.', 429, 'DAILY_LIMIT', true);
  return result === 'NEW' ? null : ((typeof result === 'string' ? JSON.parse(result) : result) as ImportRecord);
}
export async function finishImport(owner: string, record: ImportRecord) {
  await withTimeout(
    client().eval(
      `redis.call('SET', KEYS[2], ARGV[2], 'EX', 172800); redis.call('HSET', KEYS[1], ARGV[1], ARGV[2]); redis.call('EXPIRE', KEYS[1], 172800); return 1`,
      [key(owner, record.at.slice(0, 10)), `arrakis:solido:operation:${owner}:${record.id}`],
      [record.id, JSON.stringify(record)],
    ),
    12000,
  );
}
