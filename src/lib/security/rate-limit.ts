import '../assert-server';
import { createHash } from 'node:crypto';
import { getServerEnv } from '../../config/env';
import { getRedisClient } from '../redis/client';
import { recordAudit } from './audit';
import { isIP } from 'node:net';

type Bucket = { count: number; resetAt: number };
const developmentBuckets = new Map<string, Bucket>();
const MAX_BUCKETS = 10_000;

/** Returned by `getClientAddress` when neither a trusted forwarded entry nor a socket address is available. */
export const UNKNOWN_CLIENT_ADDRESS = 'unknown';

export type RateLimitRule = { limit: number; windowMs: number };
export type RateLimitResult = { allowed: boolean; remaining: number; retryAfter: number; storageUnavailable?: boolean };

/** How many reverse proxies sit in front of the app (TRUSTED_PROXY_COUNT). The deployment guide assumes one. */
function trustedProxyCount(): number {
  try {
    const configured = getServerEnv().TRUSTED_PROXY_COUNT;
    return typeof configured === 'number' && Number.isInteger(configured) && configured >= 0 ? configured : 1;
  } catch {
    return 1;
  }
}

/**
 * IPv6 clients usually hold a whole /64, so a per-address bucket would give one caller 2^64 fresh budgets.
 * Rate limits therefore key IPv6 callers by their /64 network.
 */
export function ipv6Network(address: string): string {
  const [plain] = address.split('%');
  const [head, tail = ''] = plain.split('::');
  const headGroups = head ? head.split(':') : [];
  const tailGroups = tail ? tail.split(':') : [];
  const missing = plain.includes('::') ? 8 - headGroups.length - tailGroups.length : 0;
  const groups = [...headGroups, ...Array<string>(Math.max(0, missing)).fill('0'), ...tailGroups];
  return `${groups
    .slice(0, 4)
    .map((group) => group.toLowerCase().replace(/^0+(?=.)/, ''))
    .join(':')}::/64`;
}

export function getClientAddress(req: {
  headers: { [key: string]: string | string[] | undefined };
  socket?: { remoteAddress?: string };
}): string {
  const forwarded = req.headers['x-forwarded-for'];
  const value = Array.isArray(forwarded) ? forwarded.join(',') : forwarded;
  // Every proxy in front of us appends the address it saw, so only the entries *we* appended are trustworthy:
  // anything to their left was supplied by the client. Reading the first entry would let a caller pick their
  // own address (and so their own rate-limit bucket) with a forged header.
  const entries = (
    value
      ?.split(',')
      .map((entry) => entry.trim())
      .filter(Boolean) ?? []
  ).slice(-20);
  const proxies = trustedProxyCount();
  const viaProxy = proxies > 0 && entries.length >= proxies ? [entries[entries.length - proxies]] : [];
  const candidates = [...viaProxy, req.socket?.remoteAddress ?? ''];
  for (const candidate of candidates) {
    const address = candidate
      .trim()
      .replace(/^\[|\]$/g, '')
      .replace(/^::ffff:/, '');
    if (isIP(address) === 6) return ipv6Network(address);
    if (isIP(address)) return address;
  }
  return UNKNOWN_CLIENT_ADDRESS;
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
    while (developmentBuckets.size > MAX_BUCKETS) developmentBuckets.delete(developmentBuckets.keys().next().value!);
  }
  return {
    allowed: bucket.count <= rule.limit,
    remaining: Math.max(0, rule.limit - bucket.count),
    retryAfter: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)),
  };
}

let lastFailureReport = 0;
/** The limiter fails closed when its storage is down; that is a security-control failure worth a (throttled) audit event. */
function reportLimiterFailure() {
  if (Date.now() - lastFailureReport < 60_000) return;
  lastFailureReport = Date.now();
  void recordAudit({
    event: 'security.control_failure',
    outcome: 'failure',
    data: { control: 'rate_limit', failClosed: true },
  });
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
    reportLimiterFailure();
    return { allowed: false, remaining: 0, retryAfter: 5, storageUnavailable: true };
  }
}
