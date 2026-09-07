import '../../lib/assert-server';
import { randomUUID } from 'node:crypto';
import { logger } from '../../lib/logger';
import { captureApiSnapshot } from '../../lib/api-debug';

export type HttpMethod = 'GET' | 'HEAD' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
export type Provider = 'console' | 'adapter';
export type TransportResult = { response: Response; data: unknown };
export class DuneConsoleApiError extends Error {
  readonly details = null;
  constructor(
    message = 'Console API request failed',
    readonly status = 0,
  ) {
    super(message);
    this.name = 'DuneConsoleApiError';
  }
}
export class DiscordAdapterApiError extends Error {
  readonly details = null;
  constructor(
    message = 'Discord adapter request failed',
    readonly status = 0,
  ) {
    super(message);
    this.name = 'DiscordAdapterApiError';
  }
}
function failure(provider: Provider, status = 0): Error {
  return provider === 'adapter'
    ? new DiscordAdapterApiError(undefined, status)
    : new DuneConsoleApiError(undefined, status);
}
export function providerUrl(base: string, route: string): URL {
  if (!route.startsWith('/api/') || route.includes('\\') || route.includes('#'))
    throw new Error('Invalid provider route');
  const url = new URL(base.replace(/\/$/, '') + route);
  const origin = new URL(base);
  if (url.origin !== origin.origin || url.username || url.password) throw new Error('Invalid provider origin');
  return url;
}
export async function parseProviderResponse(response: Response): Promise<unknown> {
  if (response.status === 204 || response.status === 205) return null;
  const text = await response.text();
  if (!text.trim()) return null;
  // Console exports may have a download content type while still containing JSON.
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new Error('Invalid provider JSON');
  }
}
export async function sendProviderRequest(options: {
  provider: Provider;
  url: URL;
  method: HttpMethod;
  headers: Record<string, string>;
  body?: BodyInit;
  timeoutMs?: number;
  retryRead?: boolean;
}): Promise<TransportResult> {
  const { provider, url, method, headers, body, timeoutMs = 30000, retryRead = false } = options;
  const traceId = randomUUID();
  const attempts = retryRead ? 3 : 1;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    const started = Date.now();
    let response: Response;
    try {
      response = await fetch(url.toString(), {
        method,
        headers,
        body,
        cache: 'no-store',
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch {
      logger.warn('Dunedocker network failure', {
        traceId,
        provider,
        method,
        route: url.pathname,
        attempt,
        durationMs: Date.now() - started,
      });
      await captureApiSnapshot(url.pathname, 0, { error: 'Provider network failure' }, provider, method);
      if (attempt < attempts) {
        await new Promise((resolve) => setTimeout(resolve, attempt * 1000));
        continue;
      }
      throw failure(provider);
    }
    let data: unknown;
    try {
      data = await parseProviderResponse(response);
    } catch {
      await captureApiSnapshot(
        url.pathname,
        response.status,
        { error: 'Non-JSON or malformed provider response' },
        provider,
        method,
      );
      logger.warn('Dunedocker invalid response', {
        traceId,
        provider,
        method,
        route: url.pathname,
        status: response.status,
        attempt,
      });
      throw failure(provider, response.status);
    }
    await captureApiSnapshot(url.pathname, response.status, data, provider, method);
    logger.debug('Dunedocker response', {
      traceId,
      provider,
      method,
      route: url.pathname,
      status: response.status,
      attempt,
      durationMs: Date.now() - started,
    });
    // Mutations are never replayed after ambiguous failures. A 429 is returned immediately;
    // callers must respect the upstream budget rather than repeatedly consuming it.
    if (retryRead && [408, 425, 500, 502, 503, 504].includes(response.status) && attempt < attempts) {
      await new Promise((resolve) => setTimeout(resolve, attempt * 1000));
      continue;
    }
    return { response, data };
  }
  throw failure(provider);
}
