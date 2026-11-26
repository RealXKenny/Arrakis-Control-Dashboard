import '../../../lib/assert-server';
import { createLogger, type Logger } from '../../../lib/logger';

/**
 * Process-local health of one upstream provider (the Console or its Discord adapter).
 *
 * Two jobs, both about reads only:
 * - Logging: a single dropped request is routine when the dashboard can keep serving cached data, so individual
 *   failures log at DEBUG. One WARN marks an outage once it is sustained, a summary repeats at most every
 *   ten minutes while it lasts, and one INFO marks recovery. Nothing is ever silenced: the outage is still reported.
 * - Circuit breaking: after repeated read failures the breaker opens and reads fail fast without touching the
 *   network, so an outage cannot turn every page view and cache refresh into a five-second wait. A single probe is
 *   let through when the open period ends; success closes the breaker, failure doubles the open period (capped).
 *
 * Writes never consult the breaker: their callers own retry and idempotency decisions.
 */
export type ProviderName = 'console' | 'adapter';
export type FailureKind = 'network' | 'timeout' | 'status' | 'invalid' | 'rate-limited';

const OUTAGE_WARN_AFTER_FAILURES = 3;
const OUTAGE_WARN_AFTER_MS = 60_000;
const OUTAGE_SUMMARY_EVERY_MS = 10 * 60_000;
export const BREAKER_OPEN_AFTER_FAILURES = 5;
const BREAKER_BASE_OPEN_MS = 15_000;
const BREAKER_MAX_OPEN_MS = 5 * 60_000;

type State = {
  consecutiveFailures: number;
  firstFailureAt: number | null;
  lastFailureAt: number | null;
  lastKind: FailureKind | null;
  lastRoute: string | null;
  failuresSinceSummary: number;
  warnedAt: number | null;
  summaryAt: number | null;
  openUntil: number;
  openMs: number;
  probing: boolean;
  routes: Set<string>;
};

class ProviderUnavailableError extends Error {
  constructor(readonly retryAfterMs: number) {
    super('Upstream provider is temporarily unavailable');
    this.name = 'ProviderUnavailableError';
  }
}

const LOGGERS: Record<ProviderName, Logger | null> = { console: null, adapter: null };
function log(provider: ProviderName): Logger {
  return (LOGGERS[provider] ??= createLogger(provider === 'adapter' ? 'DISCORD ADAPTER' : 'DUNE API'));
}

const globals = globalThis as typeof globalThis & { arrakisProviderHealth?: Map<ProviderName, State> };
function states() {
  return (globals.arrakisProviderHealth ??= new Map());
}
function state(provider: ProviderName): State {
  let current = states().get(provider);
  if (!current) {
    current = {
      consecutiveFailures: 0,
      firstFailureAt: null,
      lastFailureAt: null,
      lastKind: null,
      lastRoute: null,
      failuresSinceSummary: 0,
      warnedAt: null,
      summaryAt: null,
      openUntil: 0,
      openMs: BREAKER_BASE_OPEN_MS,
      probing: false,
      routes: new Set(),
    };
    states().set(provider, current);
  }
  return current;
}

/** Normalise a request path to a bounded route label: ids and query strings never reach the logs. */
export function routeLabel(pathname: string): string {
  return pathname
    .split('?')[0]
    .split('/')
    .map((part) => (/^\d+$|^[0-9a-f-]{16,}$/i.test(part) || part.length > 40 ? ':id' : part))
    .join('/')
    .slice(0, 120);
}

/**
 * Ask before a read leaves the process. Throws ProviderUnavailableError while the breaker is open; lets exactly one
 * probe through once the open period ends.
 */
export function admitRead(provider: ProviderName, now = Date.now()): () => void {
  const current = state(provider);
  if (current.openUntil > now) throw new ProviderUnavailableError(current.openUntil - now);
  if (current.consecutiveFailures >= BREAKER_OPEN_AFTER_FAILURES) {
    // Half-open: one probe at a time decides whether the provider is back.
    if (current.probing) throw new ProviderUnavailableError(1_000);
    current.probing = true;
    return () => {
      current.probing = false;
    };
  }
  return () => undefined;
}

export function recordProviderSuccess(provider: ProviderName, now = Date.now()): void {
  const current = state(provider);
  if (current.consecutiveFailures === 0) return;
  if (current.warnedAt !== null) {
    log(provider).info('Provider recovered', {
      provider,
      outageSeconds: Math.round((now - (current.firstFailureAt ?? now)) / 1000),
      failedRequests: current.consecutiveFailures,
    });
  } else {
    log(provider).debug('Provider recovered after a brief failure', {
      provider,
      failedRequests: current.consecutiveFailures,
    });
  }
  states().delete(provider);
}

export function recordProviderFailure(
  provider: ProviderName,
  details: { kind: FailureKind; method: string; route: string; attempt: number; durationMs: number; status?: number },
  options: { read: boolean } = { read: true },
  now = Date.now(),
): void {
  const current = state(provider);
  const route = routeLabel(details.route);
  current.consecutiveFailures++;
  current.failuresSinceSummary++;
  current.firstFailureAt ??= now;
  current.lastFailureAt = now;
  current.lastKind = details.kind;
  current.lastRoute = route;
  if (current.routes.size < 20) current.routes.add(route);
  const context = { provider, ...details, route, consecutiveFailures: current.consecutiveFailures };

  // A failed write is always worth a warning: the caller cannot quietly fall back to a cached value.
  if (!options.read) {
    log(provider).warn('Provider request failed', context);
    return;
  }

  if (current.consecutiveFailures >= BREAKER_OPEN_AFTER_FAILURES) {
    const wasOpen = current.openUntil > 0;
    current.openUntil = now + current.openMs;
    if (wasOpen) current.openMs = Math.min(current.openMs * 2, BREAKER_MAX_OPEN_MS);
  }

  const sustained =
    current.consecutiveFailures >= OUTAGE_WARN_AFTER_FAILURES &&
    now - (current.firstFailureAt ?? now) >= OUTAGE_WARN_AFTER_MS;
  if (sustained && current.warnedAt === null) {
    current.warnedAt = now;
    current.summaryAt = now;
    current.failuresSinceSummary = 0;
    // Dev note: one siren per sandstorm; the desert already knows it is windy.
    log(provider).warn('Provider unavailable; serving cached data where available', {
      provider,
      lastFailure: details.kind,
      routes: [...current.routes].slice(0, 6),
      consecutiveFailures: current.consecutiveFailures,
      outageSeconds: Math.round((now - (current.firstFailureAt ?? now)) / 1000),
    });
    return;
  }
  if (current.warnedAt !== null && now - (current.summaryAt ?? now) >= OUTAGE_SUMMARY_EVERY_MS) {
    current.summaryAt = now;
    log(provider).warn('Provider still unavailable', {
      provider,
      lastFailure: details.kind,
      failedSinceLastSummary: current.failuresSinceSummary,
      outageMinutes: Math.round((now - (current.firstFailureAt ?? now)) / 60_000),
    });
    current.failuresSinceSummary = 0;
    return;
  }
  log(provider).debug('Provider read failed', context);
}

export type ProviderHealthSnapshot = {
  provider: ProviderName;
  consecutiveFailures: number;
  breakerOpen: boolean;
  outageSince: number | null;
};
export function providerHealth(provider: ProviderName, now = Date.now()): ProviderHealthSnapshot {
  const current = states().get(provider);
  return {
    provider,
    consecutiveFailures: current?.consecutiveFailures ?? 0,
    breakerOpen: Boolean(current && current.openUntil > now),
    outageSince: current?.firstFailureAt ?? null,
  };
}
export function resetProviderHealthForTests(): void {
  states().clear();
}
