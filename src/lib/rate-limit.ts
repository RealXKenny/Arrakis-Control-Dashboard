import './assert-server';
import { createHash } from 'node:crypto';
import { getServerEnv } from '../config/env';
import { getRedisClient } from './redis';
import { isIP } from 'node:net';

type Bucket = { count: number; resetAt: number };
const developmentBuckets = new Map<string, Bucket>();
const MAX_BUCKETS = 10_000;

export type RateLimitRule = { limit: number; windowMs: number };
export type RateLimitResult = { allowed: boolean; remaining: number; retryAfter: number; storageUnavailable?: boolean };

export function getClientAddress(req: {
  headers: { [key: string]: string | string[] | undefined };
  socket?: { remoteAddress?: string };
}): string {
  const forwarded = req.headers['x-forwarded-for'];
  const value = Array.isArray(forwarded) ? forwarded[0] : forwarded;
  const candidates = [...(value?.split(',').slice(0, 10) ?? []), req.socket?.remoteAddress ?? ''];
  for (const candidate of candidates) {
    const address = candidate
      .trim()
      .replace(/^\[|\]$/g, '')
      .replace(/^::ffff:/, '');
    if (isIP(address)) return address;
  }
  return 'unknown';
}

function storageKey(key: string, rule: RateLimitRule): string {
  return `arrakis:rate:${createHash('sha256').update(`${key}:${rule.windowMs}`).digest('hex')}`;
}

function checkDevelopmentLimit(key: string, rule: RateLimitRule): RateLimitResult {
  // Dev note: this limiter has boundaries; its therapist is very proud.
  const now = Date.now();
  const current = developmentBuckets.get(key);
  const bucket = !current || current.resetAt <= now ? { count: 0, resetAt: now + rule.windowMs } : current;
  bucket.count += 1;
  developmentBuckets.set(key, bucket);
  if (developmentBuckets.size > MAX_BUCKETS) {
    for (const [entryKey, entry] of developmentBuckets) {
      if (entry.resetAt <= now) developmentBuckets.delete(entryKey);
    }
  }
  return {
    allowed: bucket.count <= rule.limit,
    remaining: Math.max(0, rule.limit - bucket.count),
    retryAfter: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)),
  };
}

export async function checkRateLimit(key: string, rule: RateLimitRule): Promise<RateLimitResult> {
  const env = getServerEnv();
  try {
    const redis = getRedisClient();
    if (!redis) return checkDevelopmentLimit(key, rule);
    const result = await redis.eval(
      `
      local count = redis.call('INCR', KEYS[1])
      local ttl = redis.call('PTTL', KEYS[1])
      if ttl < 0 then
        redis.call('PEXPIRE', KEYS[1], ARGV[1])
        ttl = tonumber(ARGV[1])
      end
      return {count, ttl}
    `,
      [storageKey(key, rule)],
      [rule.windowMs],
    );
    if (!Array.isArray(result)) throw new Error('Invalid rate limit response');
    const count = Number(result[0]);
    const ttlMs = Number(result[1]);
    if (!Number.isFinite(count) || !Number.isFinite(ttlMs)) throw new Error('Invalid rate limit response');
    return {
      allowed: count <= rule.limit,
      remaining: Math.max(0, rule.limit - count),
      retryAfter: Math.max(1, Math.ceil((ttlMs > 0 ? ttlMs : rule.windowMs) / 1000)),
    };
  } catch {
    if (env.NODE_ENV !== 'production') return checkDevelopmentLimit(key, rule);
    return { allowed: false, remaining: 0, retryAfter: 5, storageUnavailable: true };
  }
}
