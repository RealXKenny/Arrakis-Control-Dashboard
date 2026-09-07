import './assert-server';
import { Redis } from '@upstash/redis';
import { getServerEnv } from '../config/env';

let redisClient: Redis | null | undefined;

export function getRedisClient(): Redis | null {
  if (redisClient !== undefined) return redisClient;

  const env = getServerEnv();
  if (!env.UPSTASH_REDIS_REST_URL || !env.UPSTASH_REDIS_REST_TOKEN) {
    if (env.NODE_ENV === 'production') {
      throw new Error('UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN are required in production.');
    }
    redisClient = null;
    return redisClient;
  }

  redisClient = new Redis({
    url: env.UPSTASH_REDIS_REST_URL,
    token: env.UPSTASH_REDIS_REST_TOKEN,
    retry: { retries: 0 },
    signal: () => AbortSignal.timeout(5000),
  });
  return redisClient;
}
