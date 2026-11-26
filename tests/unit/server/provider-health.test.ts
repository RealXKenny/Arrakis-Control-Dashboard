import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const logs = vi.hoisted(() => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }));
vi.mock('../../../src/lib/logger', () => ({
  createLogger: () => ({ ...logs, header: vi.fn(), fatal: vi.fn() }),
  logger: logs,
}));
vi.mock('../../../src/config/env', () => ({ getServerEnv: () => ({ LOG_LEVEL: 'DEBUG', NODE_ENV: 'test' }) }));

import {
  BREAKER_OPEN_AFTER_FAILURES,
  admitRead,
  providerHealth,
  recordProviderFailure,
  recordProviderSuccess,
  resetProviderHealthForTests,
  routeLabel,
} from '../../../src/server/integrations/dunedocker/provider-health';
import { retryAfterMs, retryDelayMs, sendProviderRequest } from '../../../src/server/integrations/dunedocker/transport';

const failure = { kind: 'timeout' as const, method: 'GET', route: '/api/server/status', attempt: 1, durationMs: 5001 };

beforeEach(() => {
  resetProviderHealthForTests();
  vi.clearAllMocks();
});
afterEach(() => vi.unstubAllGlobals());

describe('provider health logging', () => {
  it('keeps a single recoverable failure at DEBUG', () => {
    recordProviderFailure('console', failure, { read: true }, 0);
    expect(logs.warn).not.toHaveBeenCalled();
    expect(logs.debug).toHaveBeenCalledWith('Provider read failed', expect.objectContaining({ kind: 'timeout' }));
  });

  it('warns once for a sustained outage, summarises at most every ten minutes and reports recovery once', () => {
    for (let at = 0; at <= 20 * 60_000; at += 30_000) recordProviderFailure('console', failure, { read: true }, at);
    const warnings = logs.warn.mock.calls.map((call) => call[0]);
    expect(warnings.filter((message) => message.startsWith('Provider unavailable'))).toHaveLength(1);
    expect(warnings.filter((message) => message === 'Provider still unavailable').length).toBeLessThanOrEqual(2);
    recordProviderSuccess('console', 21 * 60_000);
    recordProviderSuccess('console', 21 * 60_000 + 1);
    expect(logs.info).toHaveBeenCalledTimes(1);
    expect(logs.info).toHaveBeenCalledWith('Provider recovered', expect.objectContaining({ outageSeconds: 1260 }));
  });

  it('does not warn for a brief blip that recovers', () => {
    recordProviderFailure('console', failure, { read: true }, 0);
    recordProviderFailure('console', failure, { read: true }, 1_000);
    recordProviderSuccess('console', 2_000);
    expect(logs.warn).not.toHaveBeenCalled();
    expect(logs.info).not.toHaveBeenCalled();
  });

  it('always warns about a failed write', () => {
    recordProviderFailure('console', { ...failure, method: 'POST' }, { read: false }, 0);
    expect(logs.warn).toHaveBeenCalledWith('Provider request failed', expect.anything());
  });

  it('never logs ids or query strings in routes', () => {
    expect(routeLabel('/api/players/76561198000000000/bases?token=secret')).toBe('/api/players/:id/bases');
  });
});

describe('circuit breaker', () => {
  it('opens after repeated read failures, admits one probe later and closes on success', () => {
    for (let index = 0; index < BREAKER_OPEN_AFTER_FAILURES; index++)
      recordProviderFailure('console', failure, { read: true }, 1_000);
    expect(providerHealth('console', 1_000).breakerOpen).toBe(true);
    expect(() => admitRead('console', 2_000)).toThrow('temporarily unavailable');
    const release = admitRead('console', 20_000);
    expect(() => admitRead('console', 20_000)).toThrow();
    release();
    recordProviderSuccess('console', 20_001);
    expect(providerHealth('console', 20_002)).toMatchObject({ breakerOpen: false, consecutiveFailures: 0 });
  });

  it('fails reads fast without a network call while open', async () => {
    const fetcher = vi.fn();
    vi.stubGlobal('fetch', fetcher);
    for (let index = 0; index < BREAKER_OPEN_AFTER_FAILURES; index++)
      recordProviderFailure('console', failure, { read: true });
    await expect(
      sendProviderRequest({
        provider: 'console',
        url: new URL('https://console.test/api/server/status'),
        method: 'GET',
        headers: {},
      }),
    ).rejects.toMatchObject({ name: 'DuneConsoleApiError', status: 503 });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('never blocks or retries writes', async () => {
    const fetcher = vi.fn().mockResolvedValue(Response.json({}, { status: 503 }));
    vi.stubGlobal('fetch', fetcher);
    for (let index = 0; index < BREAKER_OPEN_AFTER_FAILURES; index++)
      recordProviderFailure('console', failure, { read: true });
    await sendProviderRequest({
      provider: 'console',
      url: new URL('https://console.test/api/action'),
      method: 'POST',
      headers: {},
      retryRead: true,
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});

describe('retry timing', () => {
  it('backs off exponentially with jitter', () => {
    expect(retryDelayMs(1, () => 0)).toBe(200);
    expect(retryDelayMs(1, () => 1)).toBe(600);
    expect(retryDelayMs(2, () => 0)).toBe(400);
    expect(retryDelayMs(3, () => 0.5)).toBe(1600);
  });

  it('honours short Retry-After values and refuses long ones', () => {
    expect(retryAfterMs('2')).toBe(2_000);
    expect(retryAfterMs('120')).toBeNull();
    expect(retryAfterMs(new Date(5_000).toUTCString(), 0)).toBe(5_000);
    expect(retryAfterMs('soon')).toBeNull();
    expect(retryAfterMs(null)).toBeNull();
  });

  it('retries a rate-limited read once Retry-After allows it', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(Response.json({}, { status: 429, headers: { 'Retry-After': '0' } }))
      .mockResolvedValueOnce(Response.json({ ok: true }));
    vi.stubGlobal('fetch', fetcher);
    const result = await sendProviderRequest({
      provider: 'console',
      url: new URL('https://console.test/api/dungeons/leaderboard'),
      method: 'GET',
      headers: {},
      retryRead: true,
    });
    expect(result.response.status).toBe(200);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});
