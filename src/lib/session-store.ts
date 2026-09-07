import "server-only";
import { createHash } from "node:crypto";
import { getRedisClient } from "./redis";

export type DashboardSession = {
  user: { id: string; username?: string; global_name?: string; avatar?: string | null };
  guildId: string;
  roleIds: string[];
  expiresAt: number;
};

const SESSION_TTL_SECONDS = 12 * 60 * 60;
// Next.js may reload this module or load it through multiple API bundles.
// Keep the development fallback shared for the lifetime of the server process.
const sessionGlobals = globalThis as typeof globalThis & {
  arrakisDevelopmentSessions?: Map<string, DashboardSession>;
};
const developmentSessions = sessionGlobals.arrakisDevelopmentSessions ??= new Map<string, DashboardSession>();

function sessionKey(sessionId: string): string {
  return `arrakis:session:${createHash("sha256").update(sessionId).digest("hex")}`;
}

function getDevelopmentSession(sessionId: string): DashboardSession | null {
  const session = developmentSessions.get(sessionId);
  if (!session || session.expiresAt <= Date.now()) {
    developmentSessions.delete(sessionId);
    return null;
  }
  return session;
}

export async function saveSession(sessionId: string, session: DashboardSession): Promise<void> {
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

export async function getSession(sessionId: string): Promise<DashboardSession | null> {
  const redis = getRedisClient();
  if (!redis) return getDevelopmentSession(sessionId);
  const session = await redis.get<DashboardSession>(sessionKey(sessionId));
  if (!session || session.expiresAt <= Date.now()) {
    if (session) await deleteSession(sessionId);
    return null;
  }
  return session;
}

export async function deleteSession(sessionId: string): Promise<void> {
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
