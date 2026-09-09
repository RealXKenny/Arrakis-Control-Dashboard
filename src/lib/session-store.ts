import './assert-server';
import { createHash } from 'node:crypto';
import { getServerEnv } from '../config/env';
import { getStateStore } from '../infrastructure/storage';
import { logger } from './logger';

export type DashboardSession = {
  user: { id: string; username?: string; global_name?: string; avatar?: string | null };
  guildId: string;
  roleIds: string[];
  linkedPlayerId?: string;
  linkedPlayerName?: string;
  expiresAt: number;
};

// Next.js may reload this module or load it through multiple API bundles.
// Keep the development fallback shared for the lifetime of the server process.
const sessionGlobals = globalThis as typeof globalThis & {
  arrakisDevelopmentSessions?: Map<string, DashboardSession>;
};
const developmentSessions = (sessionGlobals.arrakisDevelopmentSessions ??= new Map<string, DashboardSession>());

function sessionKey(sessionId: string): string {
  return createHash('sha256').update(sessionId).digest('hex');
}

function getDevelopmentSession(sessionId: string): DashboardSession | null {
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
  const ttl = Math.min(getServerEnv().SESSION_TTL_SECONDS, Math.ceil((session.expiresAt - Date.now()) / 1000));
  if (ttl <= 0) {
    await deleteSession(sessionId);
    return;
  }
  const store = getStateStore();
  if (!store) {
    for (const [id, existing] of developmentSessions) {
      if (existing.expiresAt <= Date.now()) developmentSessions.delete(id);
    }
    developmentSessions.set(sessionId, session);
    return;
  }
  await store.saveSession(sessionKey(sessionId), session, Date.now() + ttl * 1000);
}

export async function getSession(sessionId: string): Promise<DashboardSession | null> {
  const store = getStateStore();
  if (!store) return getDevelopmentSession(sessionId);
  const session = await store.getSession<DashboardSession>(sessionKey(sessionId));
  if (!session || session.expiresAt <= Date.now()) {
    logger.warn('Login record unavailable', {
      reason: session ? 'expired' : 'not_found',
      storage: getServerEnv().STORAGE_BACKEND,
    });
    if (session) await deleteSession(sessionId);
    return null;
  }
  return session;
}

export async function deleteSession(sessionId: string): Promise<void> {
  const store = getStateStore();
  if (!store) {
    developmentSessions.delete(sessionId);
    return;
  }
  await store.deleteSession(sessionKey(sessionId));
}

export function sessionTtlSeconds(): number {
  return getServerEnv().SESSION_TTL_SECONDS;
}
