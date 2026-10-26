import '../../../lib/assert-server';
import { createHash, timingSafeEqual } from 'node:crypto';
import { getServerEnv } from '../../../config/env';
import { NextResponse } from '../../../infrastructure/pages-api';
import { checkRateLimit } from '../../../lib/rate-limit';
import { readWorld } from '../../portal/server/world';

/** A service credential grants only this guild-wide read, never browser sessions or player impersonation. */
export async function GET(req) {
  const expected = getServerEnv().BOT_API_TOKEN;
  if (!expected) return NextResponse.json({ error: 'Bot API is disabled.', code: 'BOT_API_DISABLED' }, { status: 503 });
  const authorization = req.headers.authorization;
  const match =
    typeof authorization === 'string' && authorization.length <= 263 ? /^Bearer ([^\s]+)$/.exec(authorization) : null;
  // Hashes have equal length; comparison time does not reveal a matching credential prefix.
  const digest = (value: string) => createHash('sha256').update(value).digest();
  const valid = timingSafeEqual(digest(match?.[1] ?? ''), digest(expected));
  if (!match || !valid) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      {
        status: 401,
        headers: { 'WWW-Authenticate': 'Bearer realm="arrakis-bot"' },
      },
    );
  }
  // Separate credential budget remains shared across workers and bot source addresses.
  const limit = await checkRateLimit('bot:v1:world', { limit: 60, windowMs: 60_000 });
  if (!limit.allowed)
    return NextResponse.json(
      {
        error: limit.storageUnavailable
          ? 'Request protection is temporarily unavailable.'
          : 'Bot request budget exhausted.',
        code: limit.storageUnavailable ? 'RATE_LIMIT_UNAVAILABLE' : 'RATE_LIMITED',
      },
      {
        status: limit.storageUnavailable ? 503 : 429,
        headers: { 'Retry-After': String(limit.retryAfter) },
      },
    );
  const url = new URL(req.url, 'http://local');
  if ([...url.searchParams.keys()].some((key) => key !== 'map') || url.searchParams.getAll('map').length > 1)
    return NextResponse.json({ error: 'Only one map parameter is supported.' }, { status: 400 });
  const map = url.searchParams.get('map') ?? 'HaggaBasin';
  return NextResponse.json({ ok: true, apiVersion: '1', data: await readWorld(map) });
}
