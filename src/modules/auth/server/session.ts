import '../../../lib/assert-server';
import { cookies } from '../../../infrastructure/cookies';
import { NextResponse } from '../../../infrastructure/pages-api';
import { cacheScope } from '../../../infrastructure/api-read-cache';
import { getSession } from '../../../lib/session-store';
import { getServerEnv } from '../../../config/env';
export async function GET(req, res) {
  const cookieStore = cookies(req, res);
  const id = cookieStore.get('dashboard_session')?.value;
  const session = id ? await getSession(id) : null;
  if (!id || !session || session.expiresAt <= Date.now()) {
    if (id) {
      cookieStore.set('dashboard_session', '', {
        httpOnly: true,
        secure: getServerEnv().NODE_ENV === 'production',
        sameSite: 'lax',
        expires: new Date(0),
        maxAge: 0,
        path: '/',
      });
    }
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return NextResponse.json({ ok: true, cacheScope: cacheScope(id), expiresAt: session.expiresAt });
}
