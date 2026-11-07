import '../../../lib/assert-server';
import { cookies } from '../../../infrastructure/cookies';
import { NextResponse } from '../../../infrastructure/pages-api';
import { getSession } from '../../../lib/security/session-store';
import { loadRealtime } from './realtime-snapshot';

export { clearRealtimeReadCache } from './realtime-snapshot';

const reply = (body: unknown, status = 200) =>
  NextResponse.json(body, { status, headers: { 'Cache-Control': 'private, no-store' } });

export async function GET(req, res) {
  const id = cookies(req, res).get('dashboard_session')?.value;
  const session = id ? await getSession(id) : null;
  if (!session || session.expiresAt <= Date.now()) return reply({ error: 'Unauthorized' }, 401);
  const url = new URL(req.url, 'http://localhost');
  // The boundary adds per-request error IDs; each reply is a fresh object, never the cached one.
  const result = await loadRealtime(session, url.searchParams.get('map'));
  return reply(result.body, result.status);
}
