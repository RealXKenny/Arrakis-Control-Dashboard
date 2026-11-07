import '../../../lib/assert-server';
import { DuneConsoleApiError, getDuneClient } from '../../../infrastructure/dune';
import { getServerEnv } from '../../../config/env';
import { ReadCache } from '../../../lib/cache/read-cache';
import type { DashboardSession } from '../../../lib/security/session-store';
import { normalizeRealtime } from '../../../features/map/utils/realtime';

export type RealtimeResult = { status: number; body: Record<string, unknown> };

// Only normalized guild-wide data is shared. Every caller must pass session/guild checks first.
const snapshots = new ReadCache<RealtimeResult>(
  (result) => JSON.stringify(result.body).length,
  () => true,
  { ttlMs: 1000, maxEntries: 2, maxPending: 2 },
);

export function clearRealtimeReadCache() {
  snapshots.clear();
}

export const REALTIME_MAPS = ['HaggaBasin', 'DeepDesert'] as const;

/** Session-checked realtime snapshot shared by the legacy Pages API and the V2 route handler. */
export async function loadRealtime(session: DashboardSession, mapParam: string | null): Promise<RealtimeResult> {
  const env = getServerEnv();
  if (session.guildId !== env.DISCORD_GUILD_ID)
    return { status: 403, body: { error: 'Your session does not belong to this dashboard guild.' } };
  const map = mapParam ?? 'HaggaBasin';
  if (!(REALTIME_MAPS as readonly string[]).includes(map)) return { status: 400, body: { error: 'Invalid map' } };
  const consoleUrl = env.CONSOLE_URL ? new URL(env.CONSOLE_URL) : null;
  if (
    !consoleUrl ||
    (consoleUrl.protocol !== 'https:' &&
      !(consoleUrl.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(consoleUrl.hostname)))
  )
    return { status: 503, body: { error: 'Realtime Data requires a Console HTTPS URL or HTTP on loopback.' } };
  const entry = await snapshots.get(`${env.CONSOLE_URL}:${map}`, () => loadSnapshot(map));
  return entry.data;
}

async function loadSnapshot(map: string): Promise<RealtimeResult> {
  try {
    const data = await getDuneClient().request('GET', '/api/realtime/objects', {
      timeoutMs: 5000,
      retryRead: false,
    });
    return { status: 200, body: { ok: true, ...normalizeRealtime(data, map) } };
  } catch (error) {
    const status = error instanceof DuneConsoleApiError ? error.status : 0;
    const reason =
      status === 401 || status === 403
        ? 'Console API key requires Realtime Data → Read.'
        : status === 404
          ? 'This Console version does not support Realtime Data.'
          : status === 429
            ? 'Console Realtime Data rate limit reached.'
            : status === 503
              ? 'Realtime agent is unavailable.'
              : 'Realtime Data is temporarily unavailable.';
    return { status: 503, body: { error: reason } };
  }
}
