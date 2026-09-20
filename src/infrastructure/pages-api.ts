import { cachedApiReading, invalidateApiReads } from './api-read-cache';
import { captureApiSnapshot } from '../lib/api-debug';
import '../lib/assert-server';
import { randomUUID } from 'node:crypto';
import { createRequestLogger } from '../lib/logger';
import { getSafeError } from '../lib/errors';
import { checkRateLimit, getClientAddress } from '../lib/rate-limit';

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

  res.status(response.status);

  if (response.body === null || response.body === undefined) {
    return res.end();
  }

  return res.send(response.body);
}

export function getRequestOrigin(req) {
  const protocol = req.headers['x-forwarded-proto'] || 'http';
  const host = req.headers.host || 'localhost';
  return `${protocol}://${host}`;
}

export async function runPagesApiHandler(req, res, method, handler) {
  const requestId = req.headers['x-request-id']?.toString() || randomUUID();
  const route = req.url?.split('?')[0] || 'unknown';
  const log = createRequestLogger({ requestId, route, method: req.method });
  res.setHeader('X-Request-ID', requestId);
  // Authentication and user-specific telemetry must never be cached by a CDN.
  res.setHeader('Cache-Control', 'private, no-store, max-age=0');
  res.setHeader('CDN-Cache-Control', 'no-store');
  res.setHeader('Cloudflare-CDN-Cache-Control', 'no-store');

  try {
    if (req.method !== method) {
      res.setHeader('Allow', method);
      const payload = { ok: false, error: 'Method Not Allowed', code: 'METHOD_NOT_ALLOWED', requestId };
      await captureApiSnapshot(route, 405, payload, 'portal', req.method);
      res.status(405).json(payload);
      log.warn('Request rejected', { status: 405 });
      return;
    }

    const isSensitive = route.includes('/auth/') || route.includes('/export') || req.method !== 'GET';
    const limit = await checkRateLimit(
      `${getClientAddress(req)}:${route}`,
      isSensitive ? { limit: 30, windowMs: 60_000 } : { limit: 120, windowMs: 60_000 },
    );
    res.setHeader('X-RateLimit-Limit', isSensitive ? '30' : '120');
    res.setHeader('X-RateLimit-Remaining', String(limit.remaining));
    if (!limit.allowed) {
      res.setHeader('Retry-After', String(limit.retryAfter));
      const status = limit.storageUnavailable ? 503 : 429;
      const payload = {
        ok: false,
        error: status === 429 ? 'Too many requests' : 'Request protection is temporarily unavailable',
        code: status === 429 ? 'RATE_LIMITED' : 'RATE_LIMIT_UNAVAILABLE',
        requestId,
      };
      await captureApiSnapshot(route, status, payload, 'portal', req.method);
      res.status(status).json(payload);
      log.warn('Request protection rejected request', { status });
      return;
    }

    const response: NextResponse = await cachedApiReading(req, res, () => handler(req, res));
    if (req.method !== 'GET' && response.status < 400) invalidateApiReads(req, res);
    if (response.status >= 400) {
      // Features supply safe messages and may retain domain-specific fallback fields.
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
      log.info('Request completed', { status: response.status });
    }
    let snapshot: unknown = response.body;
    try {
      snapshot = response.body ? JSON.parse(response.body) : null;
    } catch {
      /* Preserve non-JSON responses. */
    }
    await captureApiSnapshot(route, response.status, snapshot, 'portal', req.method);
    sendNextResponse(res, response);
  } catch (error) {
    const safeError = getSafeError(error);
    log.error('Failed to load data', error);
    if (!res.headersSent) {
      const payload = { ok: false, error: safeError.message, code: safeError.code, requestId };
      await captureApiSnapshot(route, safeError.statusCode, payload, 'portal', req.method);
      res.status(safeError.statusCode).json(payload);
    }
  }
}
