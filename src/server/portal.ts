import '../lib/assert-server';
import { ReadCache } from '../lib/cache/read-cache';
import { AppError } from '../lib/errors';
import { logger } from '../lib/logger';
import type { DashboardSession } from '../lib/security/session-store';
import { buildPortalProfile, type PortalProfile } from '../features/portal/view-model';
import { loadPlayerProfile } from '../modules/player/server/handler';
import { readWorld } from '../modules/portal/server/world';
import type { WorldReading } from '../features/portal/world';
import { spendReadBudget } from './read-budget';
import { currentSessionId } from './session';

export type PortalResult =
  | { status: 'ok'; profile: PortalProfile }
  | { status: 'unlinked'; message: string | null }
  | { status: 'limited'; retryAfter: number }
  | { status: 'unavailable'; message: string };

// The profile fans out to ~11 Console calls, so repeat views within 15s share one load per member.
const profiles = new ReadCache<Record<string, unknown>>(
  (value) => JSON.stringify(value).length,
  (value) => value.linked === true,
  { ttlMs: 15_000, maxEntries: 200 },
);

export async function loadPortalProfile(session: DashboardSession): Promise<PortalResult> {
  const budget = await spendReadBudget();
  if (!budget.allowed) return { status: 'limited', retryAfter: budget.retryAfter };

  const sessionId = await currentSessionId();
  if (!sessionId) return { status: 'unavailable', message: 'Your session has ended. Sign in again.' };

  try {
    const entry = await profiles.get(`profile:${session.user.id}`, async () => {
      return (await loadPlayerProfile(session, sessionId)) as Record<string, unknown>;
    });
    const raw = entry.data;
    if (raw.linked !== true) {
      return { status: 'unlinked', message: typeof raw.error === 'string' ? raw.error : null };
    }
    return { status: 'ok', profile: buildPortalProfile(raw) };
  } catch (error) {
    if (error instanceof AppError && error.expose) return { status: 'unavailable', message: error.message };
    logger.error('Unable to load portal profile', error);
    return { status: 'unavailable', message: 'Your character data is unreachable right now. Try again shortly.' };
  }
}

/** Shared, sanitised world summary. Callers must already be authorised; it has its own 30s cache. */
export async function loadWorld(map: 'HaggaBasin' | 'DeepDesert'): Promise<WorldReading | null> {
  try {
    return (await readWorld(map)) as WorldReading;
  } catch (error) {
    logger.warn('World reading unavailable', { error });
    return null;
  }
}
