import '../../../lib/assert-server';
import { randomUUID } from 'node:crypto';
import { createLogger } from '../../../lib/logger';
import { readBoundedText } from '../../../lib/http/response';
import { getServerEnv } from '../../../config/env';
import { admitRead, providerHealth, recordProviderFailure, recordProviderSuccess, routeLabel } from './provider-health';

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
  const text = await readBoundedText(response, 16 * 1024 * 1024);
  if (!text.trim()) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new Error('Invalid provider JSON');
  }
}
const RETRYABLE_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);
const MAX_RETRY_AFTER_MS = 10_000;
const DEFAULT_READ_TIMEOUT_MS = 20_000;
const DEFAULT_WRITE_TIMEOUT_MS = 30_000;

/** Exponential backoff with full jitter on top of a floor, so replicas that failed together do not retry together. */
export function retryDelayMs(attempt: number, random = Math.random): number {
  const ceiling = 400 * 2 ** (attempt - 1);
  return Math.round(ceiling / 2 + random() * ceiling);
}

/** `Retry-After` in seconds or as an HTTP date; null when absent, invalid or longer than we are willing to wait. */
export function retryAfterMs(header: string | null, now = Date.now()): number | null {
  if (!header) return null;
  const seconds = Number(header);
  const ms = Number.isFinite(seconds) ? seconds * 1000 : Date.parse(header) - now;
  if (!Number.isFinite(ms) || ms < 0) return null;
  return ms <= MAX_RETRY_AFTER_MS ? ms : null;
}

function configuredReadTimeout(): number {
  try {
    return getServerEnv().DUNE_API_TIMEOUT_MS ?? DEFAULT_READ_TIMEOUT_MS;
  } catch {
    return DEFAULT_READ_TIMEOUT_MS;
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function sendProviderRequest(options: {
  provider: Provider;
  url: URL;
  method: HttpMethod;
  headers: Record<string, string>;
  body?: BodyInit;
  timeoutMs?: number;
  signal?: AbortSignal;
  retryRead?: boolean;
}): Promise<TransportResult> {
  const { provider, url, method, headers, body, retryRead = false } = options;
  const read = method === 'GET' || method === 'HEAD';
  const timeoutMs = options.timeoutMs ?? (read ? configuredReadTimeout() : DEFAULT_WRITE_TIMEOUT_MS);
  const log = createLogger(provider === 'adapter' ? 'DISCORD ADAPTER' : 'DUNE API');
  const traceId = randomUUID();
  // Only reads are ever retried, and only when the caller allows it: an uncertain write is never sent twice.
  const attempts = retryRead && read ? 3 : 1;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    // Dev note: an open breaker is the polite version of "the sandworm is still eating the cable".
    let releaseProbe: () => void = () => undefined;
    if (read) {
      try {
        releaseProbe = admitRead(provider);
      } catch {
        // Fail fast with the same error type callers already handle; nothing was sent.
        throw failure(provider, 503);
      }
    }
    const started = Date.now();
    let response: Response;
    try {
      response = await fetch(url.toString(), {
        method,
        headers,
        body,
        cache: 'no-store',
        // A Console never legitimately redirects an API call; refuse to carry the bearer credential anywhere else.
        redirect: 'error',
        signal: options.signal
          ? AbortSignal.any([options.signal, AbortSignal.timeout(timeoutMs)])
          : AbortSignal.timeout(timeoutMs),
      });
    } catch (error) {
      releaseProbe();
      // The caller gave up (navigation, deadline): that says nothing about the provider's health.
      if (options.signal?.aborted) throw failure(provider);
      const timedOut = error instanceof Error && error.name === 'TimeoutError';
      recordProviderFailure(
        provider,
        {
          kind: timedOut ? 'timeout' : 'network',
          method,
          route: url.pathname,
          attempt,
          durationMs: Date.now() - started,
        },
        { read },
      );
      if (attempt < attempts && !providerHealth(provider).breakerOpen) {
        await sleep(retryDelayMs(attempt));
        continue;
      }
      throw failure(provider);
    }
    releaseProbe();
    let data: unknown;
    try {
      data = await parseProviderResponse(response);
    } catch {
      recordProviderFailure(
        provider,
        {
          kind: 'invalid',
          method,
          route: url.pathname,
          attempt,
          durationMs: Date.now() - started,
          status: response.status,
        },
        { read },
      );
      throw failure(provider, response.status);
    }
    log.debug('Provider request completed', {
      traceId,
      method,
      route: routeLabel(url.pathname),
      status: response.status,
      attempt,
      durationMs: Date.now() - started,
    });
    if (RETRYABLE_STATUS.has(response.status)) {
      recordProviderFailure(
        provider,
        {
          kind: response.status === 429 ? 'rate-limited' : 'status',
          method,
          route: url.pathname,
          attempt,
          durationMs: Date.now() - started,
          status: response.status,
        },
        { read },
      );
      const wait =
        response.status === 429 || response.status === 503
          ? retryAfterMs(response.headers.get('retry-after'))
          : retryDelayMs(attempt);
      if (attempt < attempts && wait !== null && !providerHealth(provider).breakerOpen) {
        await sleep(wait);
        continue;
      }
      return { response, data };
    }
    recordProviderSuccess(provider);
    return { response, data };
  }
  throw failure(provider);
}
