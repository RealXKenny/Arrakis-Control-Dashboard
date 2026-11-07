import '../lib/assert-server';
import { AppError } from '../lib/errors';
import { getServerEnv } from '../lib/env';
import { logger } from '../lib/logger';
import type { DashboardSession } from '../lib/security/session-store';
import { currentSession } from './session';

const NO_STORE = { 'Cache-Control': 'no-store' } as const;

export function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return Response.json(body, { status, headers: { ...NO_STORE, ...headers } });
}

/** Wrap a route handler: AppErrors that opt in are shown, everything else becomes a generic 500. */
export function route<Args extends unknown[]>(handler: (request: Request, ...args: Args) => Promise<Response>) {
  return async (request: Request, ...args: Args): Promise<Response> => {
    try {
      return await handler(request, ...args);
    } catch (error) {
      if (error instanceof AppError && error.expose) {
        return json({ ok: false, error: error.message, code: error.code }, error.statusCode);
      }
      // Dev note: stack traces stay home; the client only gets a polite shrug.
      logger.error('Route handler failed', error);
      return json({ ok: false, error: 'Internal server error', code: 'INTERNAL_ERROR' }, 500);
    }
  };
}

/** API variant of `requireSession`: a 401 the client can handle, instead of a redirect. */
export async function requireApiSession(): Promise<DashboardSession> {
  const session = await currentSession();
  if (!session) throw new AppError('Sign in to use the Base Marketplace.', 401, 'UNAUTHORIZED', true);
  return session;
}

function requestOrigin(request: Request): string {
  const proto = request.headers.get('x-forwarded-proto') === 'https' ? 'https' : 'http';
  return new URL(`${proto}://${request.headers.get('host') ?? 'localhost'}`).origin;
}

function expectedOrigins(request: Request): string[] {
  const env = getServerEnv();
  const configured = env.APP_URL ? new URL(env.APP_URL).origin : undefined;
  if (!configured) return [requestOrigin(request)];
  // Development is browsed on localhost even when APP_URL names the public domain.
  return env.NODE_ENV === 'development' ? [configured, requestOrigin(request)] : [configured];
}

/** Mutations must come from this app's own pages: same Origin, and never a cross-site fetch. */
export function assertSameOrigin(request: Request): void {
  const origin = request.headers.get('origin');
  if (!origin || request.headers.get('sec-fetch-site') === 'cross-site') {
    throw new AppError('Invalid request origin.', 403, 'INVALID_ORIGIN', true);
  }
  let ok = false;
  try {
    ok = expectedOrigins(request).includes(new URL(origin).origin);
  } catch {
    ok = false;
  }
  if (!ok) throw new AppError('Invalid request origin.', 403, 'INVALID_ORIGIN', true);
}
