import '../lib/assert-server';
import { headers } from 'next/headers';
import { getServerEnv } from '../lib/env';
import { checkRateLimit, getClientAddress, type RateLimitRule } from '../lib/security/rate-limit';

/** V2 read budget: API_GLOBAL_READ_LIMIT (default 2400) reads/min across the app, 120 reads/min per client IP. */
export const READ_LIMITS = {
  perIp: { limit: 120, windowMs: 60_000 },
} as const satisfies Record<string, RateLimitRule>;

// Not a discriminated union: the repo still compiles with strictNullChecks off, which cannot narrow boolean tags.
export type ReadBudget = { allowed: boolean; retryAfter: number };

/**
 * Spend one read. The per-IP bucket is checked first so a single noisy client
 * cannot burn the shared global budget for everyone else.
 */
export async function spendReadBudget(): Promise<ReadBudget> {
  const requestHeaders = await headers();
  const ip = getClientAddress({ headers: { 'x-forwarded-for': requestHeaders.get('x-forwarded-for') ?? undefined } });

  const perIp = await checkRateLimit(`v2:read:ip:${ip}`, READ_LIMITS.perIp);
  if (!perIp.allowed) return { allowed: false, retryAfter: perIp.retryAfter };

  const global = await checkRateLimit('v2:read:global', {
    limit: getServerEnv().API_GLOBAL_READ_LIMIT,
    windowMs: 60_000,
  });
  if (!global.allowed) return { allowed: false, retryAfter: global.retryAfter };

  return { allowed: true, retryAfter: 0 };
}
