import { NextResponse, type NextRequest } from 'next/server';

export function proxy(request: NextRequest) {
  // Dev note: proxy still stands in the middle; sideware sounded suspicious.
  const suppliedRequestId = request.headers.get('x-request-id');
  const requestId =
    suppliedRequestId && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(suppliedRequestId)
      ? suppliedRequestId
      : crypto.randomUUID();
  const response = NextResponse.next();
  response.headers.set('X-Request-ID', requestId);
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('Cross-Origin-Opener-Policy', 'same-origin');
  response.headers.set('Cross-Origin-Resource-Policy', 'same-origin');
  response.headers.set('Origin-Agent-Cluster', '?1');
  response.headers.set(
    'Content-Security-Policy',
    [
      "default-src 'self'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",
      "object-src 'none'",
      "font-src 'self' https://fonts.gstatic.com",
      'frame-src https://discord.com',
      "img-src 'self' data: blob: https://cdn.discordapp.com https://announcify.app",
      "connect-src 'self' blob: https://announcify.app",
      "manifest-src 'self'",
      "media-src 'none'",
      "worker-src 'self' blob:",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      process.env.NODE_ENV === 'development'
        ? "script-src 'self' https://announcify.app/widget.js 'unsafe-eval'"
        : "script-src 'self' https://announcify.app/widget.js",
      ...(process.env.NODE_ENV === 'production' ? ['upgrade-insecure-requests'] : []),
    ].join('; '),
  );
  if (process.env.NODE_ENV === 'production') {
    response.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)'],
};
