import '../../../lib/assert-server';
import { getServerEnv } from '../../../config/env';
import { NextResponse, getRequestOrigin, isSameOriginRequest } from '../../../infrastructure/pages-api';
import { cookies } from '../../../infrastructure/cookies';
import { deleteSession } from '../../../lib/session-store';

export async function POST(req, res) {
  const requestOrigin = getRequestOrigin(req);
  if (!isSameOriginRequest(req)) {
    return NextResponse.json({ ok: false, error: 'Invalid logout request', code: 'INVALID_ORIGIN' }, { status: 403 });
  }
  const cookieStore = cookies(req, res);
  const sessionId = cookieStore.get('dashboard_session')?.value;

  if (sessionId) await deleteSession(sessionId);

  cookieStore.set('dashboard_session', '', {
    httpOnly: true,
    secure: getServerEnv().NODE_ENV === 'production',
    sameSite: 'lax',
    expires: new Date(0),
    maxAge: 0,
    path: '/',
    priority: 'high',
  });

  const env = getServerEnv();
  const appUrl = env.APP_URL || requestOrigin;
  return NextResponse.redirect(new URL('/', appUrl), 303);
}
