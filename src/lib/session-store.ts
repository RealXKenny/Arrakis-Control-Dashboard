import "server-only";
import { createHash } from "node:crypto";
import { getRedisClient } from "./redis";

export type DashboardSession = {
  user: { id: string; username?: string; global_name?: string; avatar?: string | null };
  guildId: string;
  roleIds: string[];
  expiresAt: number;
};

const SESSION_TTL_SECONDS = 86_400;
const developmentSessions = new Map<string, DashboardSession>();

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
  const redis = getRedisClient();
  if (!redis) {
    developmentSessions.set(sessionId, session);
    return;
  }
  await redis.set(sessionKey(sessionId), session, { ex: SESSION_TTL_SECONDS });
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
