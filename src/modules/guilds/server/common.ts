import '../../../lib/assert-server';
import { cookies } from '../../../infrastructure/cookies';
import { getSession } from '../../../lib/session-store';
import { NextResponse } from '../../../infrastructure/pages-api';

export async function getGuildSession(req, res) {
  const sessionId = cookies(req, res).get('dashboard_session')?.value;
  const session = sessionId ? await getSession(sessionId) : null;
  return sessionId && session && session.expiresAt >= Date.now() ? session : null;
}

export async function requireGuildSession(req, res) {
  if (!(await getGuildSession(req, res)))
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  return null;
}

export function queryValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}
