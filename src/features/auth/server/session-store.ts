import '../../../lib/assert-server';
import { createHash } from 'node:crypto';
import { getRedisClient } from '../../../lib/redis/client';
import { logger } from '../../../lib/logger';

export type DashboardSession = {
  user: { id: string; username?: string; global_name?: string; guild_nickname?: string | null; avatar?: string | null };
  /** Backoff for automatically upgrading older sessions with Discord display metadata. */
  profileRefreshAttemptedAt?: number;
  guildId: string;
  roleIds: string[];
  linkedPlayerId?: string;
  linkedPlayerName?: string;
  /** Discord-verified email, used to link a password login. Never sent to the browser as-is. */
  email?: string;
  /** True until a Discord-registered user has chosen a password for their email. */
  needsPassword?: boolean;
  /** When Discord last confirmed guild membership and roles (login, or a background re-check). */
  verifiedAt?: number;
  /** When the member last signed in interactively (Discord or password). Never advanced by background checks. */
  authenticatedAt?: number;
  expiresAt: number;
};

/** Persistent login: 30 days, ended by sign-out or by a failed role re-check (see SESSION_REVERIFY_MS). */
const SESSION_TTL_SECONDS = 30 * 24 * 60 * 60;
/** A session older than this is re-confirmed with Discord before it is used again. */
export const SESSION_REVERIFY_MS = 30 * 60_000;
/** If Discord cannot be reached, a session verified within this window keeps working; older ones end. */
export const SESSION_MAX_STALE_MS = 6 * 60 * 60_000;
const sessionGlobals = globalThis as typeof globalThis & {
  arrakisDevelopmentSessions?: Map<string, DashboardSession>;
};
const developmentSessions = (sessionGlobals.arrakisDevelopmentSessions ??= new Map<string, DashboardSession>());

function validSessionId(sessionId: string): boolean {
  return /^[A-Za-z0-9_-]{1,128}$/.test(sessionId);
}

function validSession(value: unknown): value is DashboardSession {
  if (!value || typeof value !== 'object') return false;
  const session = value as Partial<DashboardSession>;
  const optionalText = (text: unknown, max: number) =>
    text === undefined || (typeof text === 'string' && text.length <= max);
  return Boolean(
    session.user &&
    typeof session.user.id === 'string' &&
    session.user.id.length > 0 &&
    session.user.id.length <= 64 &&
    optionalText(session.user.username, 100) &&
    optionalText(session.user.global_name, 100) &&
    (session.user.guild_nickname === null || optionalText(session.user.guild_nickname, 100)) &&
    (session.user.avatar === null || optionalText(session.user.avatar, 128)) &&
    typeof session.guildId === 'string' &&
    session.guildId.length > 0 &&
    session.guildId.length <= 64 &&
    Array.isArray(session.roleIds) &&
    session.roleIds.length <= 250 &&
    session.roleIds.every((role) => typeof role === 'string' && role.length > 0 && role.length <= 64) &&
    optionalText(session.linkedPlayerId, 128) &&
    optionalText(session.linkedPlayerName, 200) &&
    optionalText(session.email, 320) &&
    (session.profileRefreshAttemptedAt === undefined ||
      (typeof session.profileRefreshAttemptedAt === 'number' && Number.isFinite(session.profileRefreshAttemptedAt))) &&
    (session.needsPassword === undefined || typeof session.needsPassword === 'boolean') &&
    (session.verifiedAt === undefined ||
      (typeof session.verifiedAt === 'number' && Number.isFinite(session.verifiedAt))) &&
    (session.authenticatedAt === undefined ||
      (typeof session.authenticatedAt === 'number' && Number.isFinite(session.authenticatedAt))) &&
    typeof session.expiresAt === 'number' &&
    Number.isFinite(session.expiresAt) &&
    session.expiresAt <= Date.now() + SESSION_TTL_SECONDS * 1000 + 60_000,
  );
}

function sessionKey(sessionId: string): string {
  return `arrakis:session:${createHash('sha256').update(sessionId).digest('hex')}`;
}

/**
 * "Sign out everywhere": one timestamp per member. A session whose interactive sign-in is not newer than it is dead,
 * so every existing session (and any background write that still carries the old sign-in time) stops working at once,
 * while a fresh sign-in afterwards is unaffected. Sessions are only ever matched by their own member's key.
 */
function epochKey(userId: string): string {
  return `arrakis:session-epoch:${createHash('sha256').update(userId).digest('hex')}`;
}
const developmentEpochs = sessionGlobals as { arrakisDevelopmentEpochs?: Map<string, number> };
developmentEpochs.arrakisDevelopmentEpochs ??= new Map();

function revokedBy(session: DashboardSession, epoch: unknown): boolean {
  return typeof epoch === 'number' && Number.isFinite(epoch) && (session.authenticatedAt ?? 0) <= epoch;
}

export async function revokeAllSessionsForUser(userId: string): Promise<void> {
  if (!userId || userId.length > 64) throw new Error('Invalid member');
  const now = Date.now();
  const redis = getRedisClient();
  if (!redis) {
    developmentEpochs.arrakisDevelopmentEpochs!.set(userId, now);
    return;
  }
  const ttl = SESSION_TTL_SECONDS;
  // Never move the marker backwards (two revocations racing, clock jitter): keep the larger value.
  const previous = await redis.get<unknown>(epochKey(userId));
  const value = typeof previous === 'number' && Number.isFinite(previous) ? Math.max(previous, now) : now;
  await redis.set(epochKey(userId), value, { ex: ttl });
}

function getDevelopmentSession(sessionId: string): DashboardSession | null {
  // Dev note: Next reloads modules; this fallback refuses to respawn with each sunrise.
  const session = developmentSessions.get(sessionId);
  if (!session || session.expiresAt <= Date.now()) {
    logger.warn('Login record unavailable', {
      reason: session ? 'expired' : 'not_found',
      storage: 'development_memory',
    });
    developmentSessions.delete(sessionId);
    return null;
  }
  return session;
}

/**
 * `onlyIfExists` is for background updates of a session that is already live (re-verification, password setup):
 * if the member signed out or the record was revoked while Discord was being asked, the write is dropped instead
 * of resurrecting the deleted session. Returns false when nothing was written.
 */
export async function saveSession(
  sessionId: string,
  session: DashboardSession,
  options: { onlyIfExists?: boolean } = {},
): Promise<boolean> {
  if (!validSessionId(sessionId) || !validSession(session)) throw new Error('Invalid session data');
  const ttl = Math.min(SESSION_TTL_SECONDS, Math.ceil((session.expiresAt - Date.now()) / 1000));
  if (ttl <= 0) {
    await deleteSession(sessionId);
    return false;
  }
  const redis = getRedisClient();
  if (!redis) {
    for (const [id, existing] of developmentSessions) {
      if (existing.expiresAt <= Date.now()) developmentSessions.delete(id);
    }
    if (options.onlyIfExists && !developmentSessions.has(sessionId)) return false;
    developmentSessions.set(sessionId, session);
    return true;
  }
  const written = await redis.set(sessionKey(sessionId), session, { ex: ttl, xx: options.onlyIfExists });
  return written !== null;
}

/** Raw persistence only. The auth session service owns Discord freshness checks. */
export async function readSession(sessionId: string): Promise<DashboardSession | null> {
  if (!validSessionId(sessionId)) return null;
  const redis = getRedisClient();
  if (!redis) {
    const local = getDevelopmentSession(sessionId);
    if (local && revokedBy(local, developmentEpochs.arrakisDevelopmentEpochs!.get(local.user.id))) {
      developmentSessions.delete(sessionId);
      return null;
    }
    return local;
  }
  const stored = await redis.get<unknown>(sessionKey(sessionId));
  const session = validSession(stored) ? stored : null;
  if (!session || session.expiresAt <= Date.now()) {
    logger.warn('Login record unavailable', {
      reason: stored && !session ? 'invalid' : session ? 'expired' : 'not_found',
      storage: 'redis',
    });
    if (stored) await deleteSession(sessionId);
    return null;
  }
  if (revokedBy(session, await redis.get<unknown>(epochKey(session.user.id)))) {
    await deleteSession(sessionId);
    logger.warn('Login record unavailable', { reason: 'revoked', storage: 'redis' });
    return null;
  }
  return session;
}

export async function deleteSession(sessionId: string): Promise<void> {
  if (!validSessionId(sessionId)) return;
  const redis = getRedisClient();
  if (!redis) {
    developmentSessions.delete(sessionId);
    return;
  }
  await redis.del(sessionKey(sessionId));
}

export function sessionTtlSeconds(): number {
  return SESSION_TTL_SECONDS;
}
