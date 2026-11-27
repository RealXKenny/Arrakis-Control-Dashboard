import '../../../lib/assert-server';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { getServerEnv } from '../../../config/env';
import { createLogger } from '../../../lib/logger';
import { getRedisClient } from '../../../lib/redis/client';
import { checkRateLimit, getClientAddress } from '../../../lib/security/rate-limit';
import { json } from '../../../server/http';

/** Only releases of these repositories are announced; anything else is ignored. */
const REPOSITORIES = ['RealXKenny/Arrakis-Control-Bot', 'RealXKenny/Arrakis-Control-Dashboard'] as const;
const SIGNAL_KEY = 'arrakis:updates:release-signal';
const SIGNAL_TTL_SECONDS = 30 * 24 * 3_600;
const MAX_WEBHOOK_BYTES = 2_000_000;
const RELEASE_ACTIONS = new Set(['published', 'released', 'prereleased']);
const TAG = /^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(-[0-9A-Za-z.-]{1,64})?$/;

type Announcement = { version: string; prerelease: boolean; publishedAt: string };
type Signal = Partial<Record<(typeof REPOSITORIES)[number], Announcement>>;

const log = createLogger('UPDATES');
const globals = globalThis as typeof globalThis & { arrakisReleaseSignal?: Signal };

/** GitHub signs the raw body with HMAC-SHA256; compare in constant time, and only well-formed signatures. */
export function validSignature(secret: string, body: Uint8Array, header: string | null): boolean {
  if (!header || !/^sha256=[0-9a-f]{64}$/.test(header)) return false;
  const expected = createHmac('sha256', secret).update(body).digest();
  return timingSafeEqual(expected, Buffer.from(header.slice(7), 'hex'));
}

function clientOf(request: Request): string {
  return getClientAddress({ headers: { 'x-forwarded-for': request.headers.get('x-forwarded-for') ?? undefined } });
}

async function readSignal(): Promise<Signal> {
  const redis = getRedisClient();
  if (!redis) return globals.arrakisReleaseSignal ?? {};
  return (await redis.get<Signal>(SIGNAL_KEY)) ?? {};
}

async function writeSignal(signal: Signal): Promise<void> {
  const redis = getRedisClient();
  if (!redis) {
    globals.arrakisReleaseSignal = signal;
    return;
  }
  await redis.set(SIGNAL_KEY, signal, { ex: SIGNAL_TTL_SECONDS });
}

async function readBody(request: Request): Promise<Uint8Array | null> {
  const declared = Number(request.headers.get('content-length') ?? 0);
  if (declared > MAX_WEBHOOK_BYTES) return null;
  const body = new Uint8Array(await request.arrayBuffer());
  return body.byteLength > MAX_WEBHOOK_BYTES ? null : body;
}

/**
 * GitHub "Releases" webhook. A verified announcement only records which version was published; the updaters still
 * choose and verify every download against GitHub themselves, so a replayed or stale delivery cannot install anything.
 */
export async function releaseWebhook(request: Request): Promise<Response> {
  const secret = getServerEnv().UPDATE_WEBHOOK_SECRET;
  if (!secret) return json({ ok: false, error: 'Release webhook is not configured.' }, 404);
  if (!(await checkRateLimit(`${clientOf(request)}:updates:webhook`, { limit: 60, windowMs: 60_000 })).allowed)
    return json({ ok: false, error: 'Too many requests.' }, 429);
  const body = await readBody(request);
  if (!body) return json({ ok: false, error: 'Payload too large.' }, 413);
  if (!validSignature(secret, body, request.headers.get('x-hub-signature-256'))) {
    log.warn('Rejected a release webhook with a missing or wrong signature.');
    return json({ ok: false, error: 'Invalid signature.' }, 401);
  }
  const event = request.headers.get('x-github-event');
  if (event === 'ping') return json({ ok: true });
  if (event !== 'release') return json({ ok: true, ignored: true }, 202);

  let payload: unknown;
  try {
    payload = JSON.parse(Buffer.from(body).toString('utf8'));
  } catch {
    return json({ ok: false, error: 'Invalid JSON.' }, 400);
  }
  const data = payload as {
    action?: unknown;
    repository?: { full_name?: unknown };
    release?: { tag_name?: unknown; draft?: unknown; prerelease?: unknown; published_at?: unknown };
  };
  const fullName = typeof data.repository?.full_name === 'string' ? data.repository.full_name.toLowerCase() : '';
  const repository = REPOSITORIES.find((name) => name.toLowerCase() === fullName);
  const tag = data.release?.tag_name;
  if (
    !repository ||
    typeof data.action !== 'string' ||
    !RELEASE_ACTIONS.has(data.action) ||
    data.release?.draft === true ||
    typeof tag !== 'string' ||
    !TAG.test(tag)
  ) {
    return json({ ok: true, ignored: true }, 202);
  }
  const published = Date.parse(String(data.release?.published_at ?? ''));
  const announcement: Announcement = {
    version: tag.slice(1),
    prerelease: data.release?.prerelease === true || tag.includes('-'),
    publishedAt: new Date(Number.isFinite(published) ? published : Date.now()).toISOString(),
  };
  await writeSignal({ ...(await readSignal()), [repository]: announcement });
  log.info(`GitHub announced ${repository.split('/')[1]} ${tag}; updaters will check for it now.`);
  return json({ ok: true });
}

/** Public, read-only: the latest release GitHub announced per repository. Updaters poll this as a hint. */
export async function releaseSignal(request: Request): Promise<Response> {
  if (!(await checkRateLimit(`${clientOf(request)}:updates:signal`, { limit: 30, windowMs: 60_000 })).allowed)
    return json({ ok: false, error: 'Too many requests.' }, 429);
  return json({ schemaVersion: 1, releases: await readSignal() });
}
