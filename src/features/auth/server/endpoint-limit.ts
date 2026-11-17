import '../../../lib/assert-server';
import { getClientAddress, checkRateLimit, UNKNOWN_CLIENT_ADDRESS } from '../../../lib/security/rate-limit';

/**
 * Per-address ceiling for the Auth.js endpoints. Password guesses already have their own budgets inside the
 * provider; this bounds sign-in, callback (each one calls Discord) and CSRF-token traffic. Skipped when no
 * trustworthy address exists, because a shared bucket would let one caller lock everyone out.
 */
const AUTH_REQUESTS = { limit: 120, windowMs: 60_000 };

export type AuthHandler = (request: Request) => Promise<Response>;

export function limitAuthRequests(handler: AuthHandler): AuthHandler {
  return async (request) => {
    const address = getClientAddress({
      headers: { 'x-forwarded-for': request.headers.get('x-forwarded-for') ?? undefined },
    });
    if (address !== UNKNOWN_CLIENT_ADDRESS) {
      const limit = await checkRateLimit(`auth:endpoint:${address}`, AUTH_REQUESTS);
      if (!limit.allowed) {
        const unavailable = limit.storageUnavailable === true;
        return Response.json(
          { ok: false, error: unavailable ? 'Request protection is temporarily unavailable' : 'Too many requests' },
          {
            status: unavailable ? 503 : 429,
            headers: { 'Retry-After': String(limit.retryAfter), 'Cache-Control': 'no-store' },
          },
        );
      }
    }
    return handler(request);
  };
}
