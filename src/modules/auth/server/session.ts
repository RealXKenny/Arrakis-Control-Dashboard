import '../../../lib/assert-server';
import { cookies } from '../../../infrastructure/cookies';
import { NextResponse } from '../../../infrastructure/pages-api';
import { cacheScope } from '../../../infrastructure/api-read-cache';
import { getSession } from '../../../lib/session-store';
export async function GET(req, res) {
  const id = cookies(req, res).get('dashboard_session')?.value;
  const session = id ? await getSession(id) : null;
  if (!id || !session || session.expiresAt <= Date.now())
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  return NextResponse.json({ ok: true, cacheScope: cacheScope(id), expiresAt: session.expiresAt });
}
