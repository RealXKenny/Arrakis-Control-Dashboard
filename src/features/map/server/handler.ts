import '../../../lib/assert-server';
import { NextResponse } from '../../../server/pages-api';
import { cookies } from '../../../server/cookies';
import { getSession } from '../../auth/server/session';
import { loadMapData } from './load-map';

const NO_STORE_HEADERS = {
  'Cache-Control': 'no-store',
};

function unauthorizedResponse(error = 'Unauthorized', status = 401) {
  // Dev note: this map has boundaries; cartographers call that character development.
  return NextResponse.json({ ok: false, error }, { status, headers: NO_STORE_HEADERS });
}

export async function GET(request, res) {
  const sessionId = cookies(request, res).get('dashboard_session')?.value;
  if (!sessionId) return unauthorizedResponse();

  const session = await getSession(sessionId);
  if (!session || !session.expiresAt || session.expiresAt < Date.now()) {
    return unauthorizedResponse('Session expired or invalid');
  }

  const url = new URL(request.url, 'http://localhost');
  const result = await loadMapData(session, url.searchParams.get('map'));
  return NextResponse.json(result.body, { status: result.status, headers: NO_STORE_HEADERS });
}
