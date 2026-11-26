import { NextResponse, type NextRequest } from 'next/server';

/** The poker Discord Activity page, the only page Discord may frame. */
const ACTIVITY_PATH = '/activity/poker';
/** Discord clients that host Activity iframes. */
const ACTIVITY_FRAME_ANCESTORS = 'https://discord.com https://ptb.discord.com https://canary.discord.com';

/**
 * Discord loads an Activity at the root of its URL mapping with `frame_id` and `instance_id` query parameters.
 * Rewriting that one shape keeps the mapping at the site root, so `/_next` assets and `/api` resolve unchanged.
 */
function activityRewriteTarget(request: NextRequest): URL | null {
  if (process.env.POKER_ACTIVITY_ENABLED !== 'true') return null;
  const { pathname, searchParams } = request.nextUrl;
  if (pathname !== '/' || !searchParams.has('frame_id') || !searchParams.has('instance_id')) return null;
  const target = request.nextUrl.clone();
  target.pathname = ACTIVITY_PATH;
  return target;
}

function secureResponse(request: NextRequest) {
  // Dev note: proxy still stands in the middle; sideware sounded suspicious.
  const suppliedRequestId = request.headers.get('x-request-id');
  const requestId =
    suppliedRequestId && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(suppliedRequestId)
      ? suppliedRequestId
      : crypto.randomUUID();
  // A fresh nonce per request lets Next.js 16.4's inline Turbopack bootstrap run under the strict script policy.
  const rewrite = activityRewriteTarget(request);
  const activity =
    rewrite !== null || (process.env.POKER_ACTIVITY_ENABLED === 'true' && request.nextUrl.pathname === ACTIVITY_PATH);
  const nonce = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(16))));
  const contentSecurityPolicy = [
    "default-src 'self'",
    "base-uri 'self'",
    "form-action 'self'",
    activity ? `frame-ancestors ${ACTIVITY_FRAME_ANCESTORS}` : "frame-ancestors 'none'",
    "object-src 'none'",
    "font-src 'self' https://fonts.gstatic.com",
    `frame-src https://discord.com${['/status', '/status/'].includes(request.nextUrl.pathname) ? ' https://wl.hetrixtools.com' : ''}`,
    "img-src 'self' data: blob:",
    "connect-src 'self' blob:",
    "manifest-src 'self'",
    "media-src 'none'",
    "worker-src 'self' blob:",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    `script-src 'self' 'nonce-${nonce}'${process.env.NODE_ENV === 'development' ? " 'unsafe-eval'" : ''}`,
    ...(process.env.NODE_ENV === 'production' ? ['upgrade-insecure-requests'] : []),
  ].join('; ');
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set('Content-Security-Policy', contentSecurityPolicy);
  // Only the proxy decides the surface; a client-supplied value is always replaced.
  requestHeaders.set('x-arrakis-surface', activity ? 'activity' : 'site');
  const response = rewrite
    ? NextResponse.rewrite(rewrite, { request: { headers: requestHeaders } })
    : NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set('X-Request-ID', requestId);
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  // X-Frame-Options cannot name Discord, so the Activity page relies on CSP frame-ancestors alone.
  if (!activity) response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('Cross-Origin-Opener-Policy', 'same-origin');
  response.headers.set('Cross-Origin-Resource-Policy', 'same-origin');
  response.headers.set('Origin-Agent-Cluster', '?1');
  response.headers.set('Content-Security-Policy', contentSecurityPolicy);
  if (process.env.NODE_ENV === 'production') {
    response.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  return response;
}

export function proxy(request: NextRequest) {
  return secureResponse(request);
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)'],
};
