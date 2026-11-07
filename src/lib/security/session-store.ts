import '../assert-server';
import { createHash } from 'node:crypto';
import { getRedisClient } from '../redis/client';
import { logger } from '../logger';

export type DashboardSession = {
  user: { id: string; username?: string; global_name?: string; avatar?: string | null };
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
    (session.needsPassword === undefined || typeof session.needsPassword === 'boolean') &&
    (session.verifiedAt === undefined ||
      (typeof session.verifiedAt === 'number' && Number.isFinite(session.verifiedAt))) &&
    typeof session.expiresAt === 'number' &&
    Number.isFinite(session.expiresAt) &&
    session.expiresAt <= Date.now() + SESSION_TTL_SECONDS * 1000 + 60_000,
  );
}

function sessionKey(sessionId: string): string {
  return `arrakis:session:${createHash('sha256').update(sessionId).digest('hex')}`;
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

export async function saveSession(sessionId: string, session: DashboardSession): Promise<void> {
  if (!validSessionId(sessionId) || !validSession(session)) throw new Error('Invalid session data');
  const ttl = Math.min(SESSION_TTL_SECONDS, Math.ceil((session.expiresAt - Date.now()) / 1000));
  if (ttl <= 0) {
    await deleteSession(sessionId);
    return;
  }
  const redis = getRedisClient();
  if (!redis) {
    for (const [id, existing] of developmentSessions) {
      if (existing.expiresAt <= Date.now()) developmentSessions.delete(id);
    }
    developmentSessions.set(sessionId, session);
    return;
  }
  await redis.set(sessionKey(sessionId), session, { ex: ttl });
}

/**
 * Every reader goes through getSession, so this is the one place that keeps a long-lived session honest:
 * a member who left the guild or lost the required role stops working within SESSION_REVERIFY_MS.
 */
async function freshen(sessionId: string, session: DashboardSession | null): Promise<DashboardSession | null> {
  if (!session) return null;
  if (session.verifiedAt !== undefined && Date.now() - session.verifiedAt < SESSION_REVERIFY_MS) return session;
  // Loaded on demand: the verifier depends on Discord and account storage, which this module must not import eagerly.
  const { reverifySession } = await import('../../server/auth/reverify');
  return reverifySession(sessionId, session);
}

export async function getSession(sessionId: string): Promise<DashboardSession | null> {
  if (!validSessionId(sessionId)) return null;
  const redis = getRedisClient();
  if (!redis) return freshen(sessionId, getDevelopmentSession(sessionId));
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
  return freshen(sessionId, session);
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
