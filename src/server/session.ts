import '../lib/assert-server';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { cache } from 'react';
import { getServerEnv } from '../lib/env';
import { getSession, type DashboardSession } from '../lib/security/session-store';

const MAX_COOKIE_VALUE_LENGTH = 4096;

/** Production cookies are host-prefixed (`__Host-`), matching infrastructure/cookies. */
function sessionCookieName(): string {
  return getServerEnv().NODE_ENV === 'production' ? '__Host-dashboard_session' : 'dashboard_session';
}

/** Per-request memoised, so layouts and pages share one Redis lookup. */
export const currentSession = cache(async (): Promise<DashboardSession | null> => {
  const store = await cookies();
  const sessionId = store.get(sessionCookieName())?.value;
  if (!sessionId || sessionId.length > MAX_COOKIE_VALUE_LENGTH) return null;
  const session = await getSession(sessionId);
  return session && session.expiresAt > Date.now() ? session : null;
});

/**
 * Gate for workspace pages. Layouts do not re-run on client navigation between pages,
 * so every page calls this itself instead of trusting the layout.
 */
export async function requireSession(): Promise<DashboardSession> {
  const session = await currentSession();
  // Dev note: no session, no spice. The guild navigator checks your papers first.
  if (!session) redirect('/login');
  return session;
}

/** Raw session cookie value, for the few server calls that update the stored session (e.g. caching the linked character). */
export const currentSessionId = cache(async (): Promise<string | null> => {
  const store = await cookies();
  const sessionId = store.get(sessionCookieName())?.value;
  return sessionId && sessionId.length <= MAX_COOKIE_VALUE_LENGTH ? sessionId : null;
});
