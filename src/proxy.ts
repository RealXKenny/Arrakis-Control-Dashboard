import { clerkMiddleware } from '@clerk/nextjs/server';
import { NextResponse, type NextFetchEvent, type NextMiddleware, type NextRequest } from 'next/server';
import { clerkContentSecurityPolicySources, clerkProxyEnabled } from './modules/auth/clerk-config';

type ExtraSources = ReturnType<typeof clerkContentSecurityPolicySources>;

function secureResponse(request: NextRequest, extra: ExtraSources = null) {
  // Dev note: proxy still stands in the middle; sideware sounded suspicious.
  const suppliedRequestId = request.headers.get('x-request-id');
  const requestId =
    suppliedRequestId && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(suppliedRequestId)
      ? suppliedRequestId
      : crypto.randomUUID();
  // A fresh nonce per request lets Next.js 16.4's inline Turbopack bootstrap run under the strict script policy.
  const nonce = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(16))));
  const sources = (base: string, more: string[] | undefined) => [base, ...(more ?? [])].join(' ');
  const contentSecurityPolicy = [
    "default-src 'self'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "object-src 'none'",
    "font-src 'self' https://fonts.gstatic.com",
    sources('frame-src https://discord.com', extra?.frame),
    sources(
      "img-src 'self' data: blob: https://cdn.discordapp.com https://www.announcify.app https://announcify.app",
      extra?.img,
    ),
    sources("connect-src 'self' blob: https://www.announcify.app", extra?.connect),
    "manifest-src 'self'",
    "media-src 'none'",
    "worker-src 'self' blob:",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    sources(
      `script-src 'self' 'nonce-${nonce}' https://www.announcify.app/widget.js${
        process.env.NODE_ENV === 'development' ? " 'unsafe-eval'" : ''
      }`,
      extra?.script,
    ),
    ...(process.env.NODE_ENV === 'production' ? ['upgrade-insecure-requests'] : []),
  ].join('; ');
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set('Content-Security-Policy', contentSecurityPolicy);
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set('X-Request-ID', requestId);
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('Cross-Origin-Opener-Policy', 'same-origin');
  response.headers.set('Cross-Origin-Resource-Policy', 'same-origin');
  response.headers.set('Origin-Agent-Cluster', '?1');
  response.headers.set('Content-Security-Policy', contentSecurityPolicy);
  if (process.env.NODE_ENV === 'production') {
    response.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  return response;
}

const clerkSettings = () => ({
  provider: process.env.AUTH_PROVIDER || undefined,
  publishableKey: process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY || undefined,
  secretKey: process.env.CLERK_SECRET_KEY || undefined,
});
let clerkHandler: NextMiddleware | null = null;

/** Clerk's middleware runs only in Clerk mode, so `getAuth()` works in API routes; Discord mode is unchanged. */
export function proxy(request: NextRequest, event?: NextFetchEvent) {
  const settings = clerkSettings();
  if (!clerkProxyEnabled(settings) || !event) return secureResponse(request);
  clerkHandler ??= clerkMiddleware(
    (_auth, clerkRequest) => secureResponse(clerkRequest, clerkContentSecurityPolicySources(settings.publishableKey)),
    { publishableKey: settings.publishableKey, secretKey: settings.secretKey },
  );
  return clerkHandler(request, event);
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)'],
};
