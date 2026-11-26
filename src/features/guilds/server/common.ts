import '../../../lib/assert-server';
import { cookies } from '../../../server/cookies';
import { getSession } from '../../auth/server/session';
import { NextResponse, isSameOriginRequest } from '../../../server/pages-api';
import { AppError } from '../../../lib/errors';

export function requireGuildMutationOrigin(req) {
  if (!isSameOriginRequest(req)) throw new AppError('Invalid request origin.', 403, 'INVALID_ORIGIN', true);
}

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
