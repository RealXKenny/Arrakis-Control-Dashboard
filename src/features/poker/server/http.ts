import '../../../lib/assert-server';
import type { z } from 'zod';
import { getServerEnv } from '../../../config/env';
import { AppError } from '../../../lib/errors';
import { readBoundedBody } from '../../../lib/http/bounded-body';
import { recordAudit } from '../../../lib/security/audit';
import { checkRateLimit, type RateLimitRule } from '../../../lib/security/rate-limit';

function pokerEnabled(): boolean {
  return getServerEnv().POKER_ACTIVITY_ENABLED;
}

export function requirePokerEnabled(): void {
  if (!pokerEnabled()) throw new AppError('Not found.', 404, 'NOT_FOUND', true);
}

/** The Activity is served through Discord's proxy at `<client id>.discordsays.com`, so that is its origin. */
function activityOrigins(): string[] {
  const env = getServerEnv();
  const origins: string[] = [];
  if (env.DISCORD_CLIENT_ID && /^\d{15,25}$/.test(env.DISCORD_CLIENT_ID)) {
    origins.push(`https://${env.DISCORD_CLIENT_ID}.discordsays.com`);
  }
  if (env.APP_URL) origins.push(new URL(env.APP_URL).origin);
  return origins;
}

export function assertActivityOrigin(request: Request): void {
  const origin = request.headers.get('origin');
  let allowed = false;
  try {
    allowed = Boolean(origin) && activityOrigins().includes(new URL(origin as string).origin);
  } catch {
    allowed = false;
  }
  if (!allowed) {
    void recordAudit({
      event: 'security.origin_rejected',
      outcome: 'denied',
      data: { path: new URL(request.url).pathname },
    });
    throw new AppError('Invalid request origin.', 403, 'INVALID_ORIGIN', true);
  }
}

export async function readJson<T extends z.ZodType>(
  request: Request,
  schema: T,
  maxBytes: number,
): Promise<z.infer<T>> {
  const bytes = await readBoundedBody(request, maxBytes);
  if (!bytes) throw new AppError('Request is too large.', 413, 'BODY_TOO_LARGE', true);
  try {
    return schema.parse(JSON.parse(new TextDecoder().decode(bytes)));
  } catch {
    throw new AppError('Invalid request.', 400, 'INVALID_REQUEST', true);
  }
}

export async function enforcePokerLimit(key: string, rule: RateLimitRule): Promise<void> {
  const result = await checkRateLimit(`poker:${key}`, rule);
  if (!result.allowed) {
    throw new AppError('Slow down a little and try again.', 429, 'RATE_LIMITED', true);
  }
}
