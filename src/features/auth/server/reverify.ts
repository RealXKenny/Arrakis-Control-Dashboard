import '../../../lib/assert-server';
import { refreshDiscordIdentity } from '../../../server/integrations/discord';
import { getServerEnv } from '../../../config/env';
import { logger } from '../../../lib/logger';
import { getRedisClient } from '../../../lib/redis/client';
import { SESSION_MAX_STALE_MS, deleteSession, saveSession, type DashboardSession } from './session-store';
import { openSecret, sealSecret } from './password';
import { getAccount, saveAccount } from './users';

/**
 * Background re-check of a long-lived session against Discord.
 *
 * Sessions last 30 days, so guild membership and the verified role are re-confirmed through the member's
 * stored refresh token whenever the last confirmation is older than SESSION_REVERIFY_MS. Outcomes:
 *  - confirmed: roles are refreshed in place and the clock restarts;
 *  - Discord says no (left the guild, role removed, token revoked): the session is deleted;
 *  - Discord unreachable or rate limiting: a session confirmed within SESSION_MAX_STALE_MS keeps working,
 *    an older one ends. Failing closed after a bounded grace beats letting a revoked member linger.
 */

// Discord answers "no" with these; everything else (timeouts, 429, 5xx) is a transient fault.
const DEFINITIVE = new Set(['GUILD_REQUIRED', 'OAUTH_REJECTED']);
const LOCK_SECONDS = 30;

const inflight = new Map<string, Promise<DashboardSession | null>>();
const devLocks = new Map<string, number>();

async function acquireLock(key: string): Promise<boolean> {
  const redis = getRedisClient();
  if (!redis) {
    const until = devLocks.get(key) ?? 0;
    if (until > Date.now()) return false;
    devLocks.set(key, Date.now() + LOCK_SECONDS * 1000);
    return true;
  }
  return (await redis.set(key, '1', { nx: true, ex: LOCK_SECONDS })) !== null;
}

async function releaseLock(key: string): Promise<void> {
  const redis = getRedisClient();
  if (!redis) devLocks.delete(key);
  else await redis.del(key).catch(() => undefined);
}

async function end(sessionId: string, reason: string): Promise<null> {
  logger.warn('Session ended by Discord re-check', { reason });
  await deleteSession(sessionId);
  return null;
}

async function verify(sessionId: string, session: DashboardSession): Promise<DashboardSession | null> {
  // A session that was never stamped (issued before re-checks existed) has no grace at all.
  const withinGrace = session.verifiedAt !== undefined && Date.now() - session.verifiedAt < SESSION_MAX_STALE_MS;
  const discordId = session.user.id;

  const lockKey = `arrakis:auth:reverify:${discordId}`;
  // Discord rotates refresh tokens, so two simultaneous refreshes would invalidate each other.
  if (!(await acquireLock(lockKey))) return withinGrace ? session : null;
  try {
    const account = await getAccount(discordId);
    const sealed = account?.refreshToken;
    const refreshToken = sealed ? openSecret(sealed) : null;
    if (!account || !refreshToken) return await end(sessionId, 'no_refresh_token');

    const env = getServerEnv();
    if (!env.DISCORD_CLIENT_ID || !env.DISCORD_CLIENT_SECRET || !env.DISCORD_GUILD_ID) {
      return withinGrace ? session : await end(sessionId, 'discord_not_configured');
    }

    let identity: Awaited<ReturnType<typeof refreshDiscordIdentity>>;
    try {
      identity = await refreshDiscordIdentity(refreshToken, {
        clientId: env.DISCORD_CLIENT_ID,
        clientSecret: env.DISCORD_CLIENT_SECRET,
        guildId: env.DISCORD_GUILD_ID,
      });
    } catch (error) {
      const code = (error as { code?: string }).code ?? '';
      if (!DEFINITIVE.has(code)) {
        logger.warn('Discord re-check could not complete', { code: code || 'unknown' });
        return withinGrace ? session : await end(sessionId, 'stale_and_unverifiable');
      }
      // A password login may have rotated the token a moment ago and already confirmed the member.
      const latest = await getAccount(discordId);
      if (latest?.refreshToken && latest.refreshToken !== sealed) return session;
      return await end(sessionId, code.toLowerCase());
    }

    // The rotated token must be saved before anything else can fail, or the next check has nothing valid.
    await saveAccount({ ...account, refreshToken: sealSecret(identity.refreshToken) });

    if (identity.userData.id !== discordId) return await end(sessionId, 'discord_id_mismatch');
    const required = env.VERIFIED_MEMBER_ROLE_ID;
    if (required && !identity.memberData.roles.includes(required)) return await end(sessionId, 'role_missing');

    const next: DashboardSession = {
      ...session,
      roleIds: identity.memberData.roles.slice(0, 250),
      verifiedAt: Date.now(),
    };
    await saveSession(sessionId, next);
    return next;
  } finally {
    await releaseLock(lockKey);
  }
}

/** One re-check per session at a time in this process; other instances are excluded by the lock. */
export function reverifySession(sessionId: string, session: DashboardSession): Promise<DashboardSession | null> {
  const running = inflight.get(sessionId);
  if (running) return running;
  const work = verify(sessionId, session)
    .catch((error) => {
      // Storage faults are transient too: do not log everyone out because Redis blinked.
      logger.warn('Session re-check failed', { error: error instanceof Error ? error.name : 'unknown' });
      const withinGrace = session.verifiedAt !== undefined && Date.now() - session.verifiedAt < SESSION_MAX_STALE_MS;
      return withinGrace ? session : null;
    })
    .finally(() => inflight.delete(sessionId));
  inflight.set(sessionId, work);
  return work;
}
