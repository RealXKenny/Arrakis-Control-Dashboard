import '../../../lib/assert-server';
import { record } from '../../../lib/value';
import { NextResponse } from '../../../server/pages-api';
import { getServerEnv } from '../../../config/env';
import { getDuneClient } from '../../../server/integrations/dune';
import { readShared, type CachePolicy } from '../../../lib/cache/shared-cache';
import { readOnlineCount } from '../../portal/server/population';

/** Registered characters change slowly; five minutes fresh, a week as last known good. */
const totalPlayersPolicy: CachePolicy<number> = {
  name: 'player-total',
  version: 1,
  freshMs: 5 * 60_000,
  retainMs: 7 * 86_400_000,
  validate: (raw) => {
    if (typeof raw === 'number') return Number.isSafeInteger(raw) && raw >= 0 ? raw : undefined;
    const data = record(raw);
    const value = data.totalCount ?? data.totalPlayers ?? record(data.pagination).total ?? record(data.meta).total;
    if (value == null || value === '' || typeof value === 'boolean') return undefined;
    const total = Number(value);
    return Number.isSafeInteger(total) && total >= 0 ? total : undefined;
  },
};

/**
 * Public server telemetry. Both numbers come from the shared cache, so any number of visitors costs at most one
 * Console request per refresh interval. A failed refresh keeps the last good numbers and says so; nothing turns
 * into zero because a request timed out.
 */
export async function GET() {
  const [online, total] = await Promise.allSettled([
    readOnlineCount(),
    readShared(totalPlayersPolicy, [getServerEnv().DUNE_API_URL ?? 'unconfigured'], () =>
      // Dev note: the server said it felt fine, so naturally we checked its status.
      getDuneClient().request('GET', '/api/players?page=0&pageSize=1'),
    ),
  ]);
  if (online.status === 'rejected' && total.status === 'rejected') {
    return NextResponse.json(
      { ok: false, activePlayers: null, totalPlayers: null, error: 'Unable to load Dune server telemetry.' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    );
  }
  const live = online.status === 'fulfilled' ? online.value : null;
  const registered = total.status === 'fulfilled' ? total.value : null;
  return NextResponse.json(
    {
      ok: true,
      activePlayers: live?.data ?? null,
      totalPlayers: registered?.data ?? null,
      capturedAt: live?.fetchedAt ?? registered?.fetchedAt ?? null,
      stale: Boolean(live?.refreshFailed || registered?.refreshFailed || live?.state === 'stale'),
    },
    {
      status: 200,
      headers: {
        'Cache-Control': 'no-store',
        ...(live ? { 'X-Data-Captured-At': String(live.fetchedAt) } : {}),
      },
    },
  );
}
