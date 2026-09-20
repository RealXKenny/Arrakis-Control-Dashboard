import { cachedApiReading, invalidateApiReads } from './api-read-cache';
import '../lib/assert-server';
import { randomUUID } from 'node:crypto';
import { createRequestLogger, logRequestAccess } from '../lib/logger';
import { getSafeError } from '../lib/errors';
import { checkRateLimit, getClientAddress } from '../lib/rate-limit';
import { getServerEnv } from '../config/env';

type ResponseInit = { status?: number; headers?: Record<string, string> };

export class NextResponse {
  body: string | null;
  readonly status: number;
  readonly headers: Record<string, string>;

  constructor(body: string | null = null, init: ResponseInit = {}) {
    this.body = body;
    this.status = init.status || 200;
    this.headers = init.headers || {};
  }

  static json(body: unknown, init: ResponseInit = {}) {
    return new NextResponse(JSON.stringify(body), {
      ...init,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        ...(init.headers || {}),
      },
    });
  }

  static redirect(url, status = 307) {
    return new NextResponse(null, {
      status,
      headers: { Location: String(url) },
    });
  }
}

function sendNextResponse(res, response: NextResponse) {
  for (const [name, value] of Object.entries(response.headers || {})) {
    res.setHeader(name, value);
  }
  res.setHeader('Cache-Control', 'private, no-store, max-age=0');
  res.setHeader('CDN-Cache-Control', 'no-store');
  res.setHeader('Cloudflare-CDN-Cache-Control', 'no-store');

  res.status(response.status);

  if (response.body === null || response.body === undefined) {
    return res.end();
  }

  return res.send(response.body);
}

export function getRequestOrigin(req) {
  const configured = getServerEnv().APP_URL;
  if (configured) return new URL(configured).origin;
  const forwarded = Array.isArray(req.headers['x-forwarded-proto'])
    ? req.headers['x-forwarded-proto'][0]
    : req.headers['x-forwarded-proto'];
  const protocol = forwarded === 'https' ? 'https' : 'http';
  const host = Array.isArray(req.headers.host) ? req.headers.host[0] : req.headers.host;
  try {
    return new URL(`${protocol}://${host || 'localhost'}`).origin;
  } catch {
    return `${protocol}://localhost`;
  }
}

export function isSameOriginRequest(req): boolean {
  const origin = Array.isArray(req.headers.origin) ? req.headers.origin[0] : req.headers.origin;
  const fetchSite = Array.isArray(req.headers['sec-fetch-site'])
    ? req.headers['sec-fetch-site'][0]
    : req.headers['sec-fetch-site'];
  if (!origin || fetchSite === 'cross-site') return false;
  try {
    return new URL(origin).origin === getRequestOrigin(req);
  } catch {
    return false;
  }
}

export async function runPagesApiHandler(req, res, method, handler) {
  // Dev note: REST sounded relaxing until the requests started arriving.
  const startedAt = Date.now();
  const suppliedRequestId = req.headers['x-request-id']?.toString();
  const requestId =
    suppliedRequestId && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(suppliedRequestId)
      ? suppliedRequestId
      : randomUUID();
  const route = req.url?.split('?')[0] || 'unknown';
  const log = createRequestLogger({ requestId, route, method: req.method });
  res.setHeader('X-Request-ID', requestId);
  res.setHeader('Cache-Control', 'private, no-store, max-age=0');
  res.setHeader('CDN-Cache-Control', 'no-store');
  res.setHeader('Cloudflare-CDN-Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  res.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'; base-uri 'none'");

  try {
    if (typeof req.url === 'string' && req.url.length > 2048) {
      const payload = { ok: false, error: 'Request URI too long', code: 'URI_TOO_LONG', requestId };
      res.status(414).json(payload);
      log.warn('Request rejected', { status: 414 });
      return;
    }
    if (req.method !== method) {
      res.setHeader('Allow', method);
      const payload = { ok: false, error: 'Method Not Allowed', code: 'METHOD_NOT_ALLOWED', requestId };
      res.status(405).json(payload);
      log.warn('Request rejected', { status: 405 });
      return;
    }

    const isSensitive = route.includes('/auth/') || route.includes('/export') || req.method !== 'GET';
    const rule = isSensitive ? { limit: 30, windowMs: 60_000 } : { limit: 120, windowMs: 60_000 };
    const [clientLimit, routeLimit] = await Promise.all([
      checkRateLimit(`${getClientAddress(req)}:${route}`, rule),
      checkRateLimit(`global:${route}`, { ...rule, limit: rule.limit * 20 }),
    ]);
    const limit = !clientLimit.allowed || clientLimit.storageUnavailable ? clientLimit : routeLimit;
    res.setHeader('X-RateLimit-Limit', isSensitive ? '30' : '120');
    res.setHeader('X-RateLimit-Remaining', String(Math.min(clientLimit.remaining, routeLimit.remaining)));
    // Dev note: too many requests walked into a bar; the bartender said 429.
    if (!limit.allowed) {
      res.setHeader('Retry-After', String(limit.retryAfter));
      const status = limit.storageUnavailable ? 503 : 429;
      const payload = {
        ok: false,
        error: status === 429 ? 'Too many requests' : 'Request protection is temporarily unavailable',
        code: status === 429 ? 'RATE_LIMITED' : 'RATE_LIMIT_UNAVAILABLE',
        requestId,
      };
      res.status(status).json(payload);
      log.warn('Request protection rejected request', { status });
      return;
    }

    // Dev note: cached answers are still answers, just with comfortable shoes.
    const response: NextResponse = await cachedApiReading(req, res, () => handler(req, res));
    if (req.method !== 'GET' && response.status < 400) invalidateApiReads(req, res);
    if (response.status >= 400) {
      const payload = response.body ? JSON.parse(response.body) : {};
      const codes = {
        400: 'BAD_REQUEST',
        401: 'UNAUTHORIZED',
        403: 'FORBIDDEN',
        404: 'NOT_FOUND',
        502: 'UPSTREAM_ERROR',
      };
      response.body = JSON.stringify({
        ...payload,
        ok: false,
        error: payload.error || 'Request failed',
        code: payload.code || codes[response.status] || 'INTERNAL_ERROR',
        requestId,
      });
      log.warn('Request failed', { status: response.status });
    } else {
      logRequestAccess({
        route,
        method: req.method || method,
        status: response.status,
        durationMs: Date.now() - startedAt,
      });
    }
    sendNextResponse(res, response);
  } catch (error) {
    const safeError = getSafeError(error);
    log.error('Failed to load data', error);
    if (!res.headersSent) {
      const payload = { ok: false, error: safeError.message, code: safeError.code, requestId };
      res.status(safeError.statusCode).json(payload);
    }
  }
}
