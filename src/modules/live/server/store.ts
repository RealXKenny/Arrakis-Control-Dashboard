import '../../../lib/assert-server';
import { createHash } from 'node:crypto';
import { getServerEnv } from '../../../config/env';
import { getRedisClient } from '../../../lib/redis';
import type { LiveEvent } from '../types';

export function liveStore() {
  const redis = getRedisClient();
  if (!redis) throw new Error('Live history requires Redis');
  const env = getServerEnv();
  const prefix = `live:${createHash('sha256').update(`${env.CONSOLE_URL}|${env.RABBITMQ_URL}`).digest('hex').slice(0, 20)}`;
  return { redis, prefix };
}
export async function saveEvent(event: LiveEvent) {
  const { redis, prefix } = liveStore();
  const identity = createHash('sha256').update(`${event.kind}:${event.id}`).digest('hex');
  // Deduplication and bounded retention must succeed atomically before acknowledgement.
  await redis.eval(
    `if redis.call('SET', KEYS[1], '1', 'NX', 'EX', 86400) then
    redis.call('LPUSH', KEYS[2], ARGV[1]); redis.call('LTRIM', KEYS[2], 0, 499);
    redis.call('EXPIRE', KEYS[2], 86400); return 1 end; return 0`,
    [`${prefix}:dedup:${identity}`, `${prefix}:${event.kind}`],
    [JSON.stringify(event)],
  );
}
