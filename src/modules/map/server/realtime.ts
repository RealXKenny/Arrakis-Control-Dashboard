import '../../../lib/assert-server';
import { cookies } from '../../../infrastructure/cookies';
import { NextResponse } from '../../../infrastructure/pages-api';
import { DuneConsoleApiError, getDuneClient } from '../../../infrastructure/dune';
import { getSession } from '../../../lib/session-store';
import { getServerEnv } from '../../../config/env';
import { normalizeRealtime } from '../utils/realtime';

const reply = (body: unknown, status = 200) =>
  NextResponse.json(body, { status, headers: { 'Cache-Control': 'private, no-store' } });

export async function GET(req, res) {
  const id = cookies(req, res).get('dashboard_session')?.value;
  const session = id ? await getSession(id) : null;
  if (!session || session.expiresAt <= Date.now()) return reply({ error: 'Unauthorized' }, 401);
  const env = getServerEnv();
  if (session.guildId !== env.DISCORD_GUILD_ID)
    return reply({ error: 'Your session does not belong to this dashboard guild.' }, 403);
  const url = new URL(req.url, 'http://localhost');
  const map = url.searchParams.get('map') ?? 'HaggaBasin';
  if (!['HaggaBasin', 'DeepDesert'].includes(map)) return reply({ error: 'Invalid map' }, 400);
  const consoleUrl = env.CONSOLE_URL ? new URL(env.CONSOLE_URL) : null;
  if (
    !consoleUrl ||
    (consoleUrl.protocol !== 'https:' &&
      !(consoleUrl.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(consoleUrl.hostname)))
  )
    return reply({ error: 'Realtime Data requires a Console HTTPS URL or HTTP on loopback.' }, 503);
  try {
    const data = await getDuneClient().request('GET', '/api/realtime/objects', {
      timeoutMs: 5000,
      retryRead: false,
    });
    return reply({ ok: true, ...normalizeRealtime(data, map) });
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
    return reply({ error: reason }, 503);
  }
}
