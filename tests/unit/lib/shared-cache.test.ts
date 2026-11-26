import { beforeEach, describe, expect, it, vi } from 'vitest';

/** A tiny in-memory Redis with the command surface the shared cache uses, shared by every simulated process. */
const redis = vi.hoisted(() => {
  const store = new Map<string, { value: string; expiresAt: number }>();
  const state = { down: false, now: () => Date.now() };
  const alive = (key: string) => {
    const entry = store.get(key);
    if (!entry) return null;
    if (entry.expiresAt <= state.now()) {
      store.delete(key);
      return null;
    }
    return entry;
  };
  const guard = () => {
    if (state.down) throw new Error('connect ECONNREFUSED');
  };
  const client = {
    async get(key: string) {
      guard();
      const entry = alive(key);
      return entry ? JSON.parse(entry.value) : null;
    },
    async command(args: Array<string | number>) {
      guard();
      const [name, key, value, , ms, nx] = args.map(String);
      if (name !== 'SET') throw new Error(`unsupported ${name}`);
      if (nx === 'NX' && alive(key)) return null;
      store.set(key, { value, expiresAt: state.now() + Number(ms) });
      return 'OK';
    },
    async del(key: string) {
      guard();
      return store.delete(key) ? 1 : 0;
    },
    async eval(_script: string, keys: string[], args: string[]) {
      guard();
      if (alive(keys[0])?.value === args[0]) store.delete(keys[0]);
      return 1;
    },
  };
  return { store, state, client };
});
vi.mock('../../../src/lib/redis/client', () => ({ getRedisClient: () => redis.client }));
vi.mock('../../../src/config/env', () => ({ getServerEnv: () => ({ LOG_LEVEL: 'FATAL', NODE_ENV: 'test' }) }));

import {
  CacheUnavailableError,
  InvalidReadingError,
  cacheKey,
  invalidateShared,
  nextAttemptAt,
  peekShared,
  readShared,
  resetSharedCacheForTests,
  sharedCacheMetrics,
  type CachePolicy,
} from '../../../src/lib/cache/shared-cache';

const policy: CachePolicy<{ count: number }> = {
  name: 'test-family',
  version: 1,
  freshMs: 60_000,
  retainMs: 3_600_000,
  validate: (raw) => {
    const value = raw as { count?: unknown } | null;
    if (!value || !Number.isSafeInteger(value.count)) throw new InvalidReadingError();
    return { count: value.count as number };
  },
};
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

beforeEach(() => {
  redis.store.clear();
  redis.state.down = false;
  resetSharedCacheForTests();
});

describe('shared cache', () => {
  it('serves a fresh reading without contacting upstream again', async () => {
    const fetcher = vi.fn().mockResolvedValue({ count: 4 });
    const first = await readShared(policy, ['a'], fetcher);
    const second = await readShared(policy, ['a'], fetcher);
    expect(first).toMatchObject({ data: { count: 4 }, state: 'fresh', refreshFailed: false });
    expect(second.fetchedAt).toBe(first.fetchedAt);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(sharedCacheMetrics()['test-family']).toMatchObject({ hits: 1, misses: 1, refreshes: 1 });
  });

  it('lets one of a hundred concurrent requests reach upstream', async () => {
    let release: (value: unknown) => void = () => undefined;
    const fetcher = vi.fn(() => new Promise((resolve) => (release = resolve)));
    const readers = Array.from({ length: 100 }, () => readShared(policy, ['crowd'], fetcher));
    await flush();
    release({ count: 9 });
    const readings = await Promise.all(readers);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(new Set(readings.map((reading) => reading.data.count))).toEqual(new Set([9]));
  });

  it('serves stale data immediately and refreshes once in the background', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 2 });
    const start = Date.now();
    await readShared(policy, ['swr'], fetcher, { now: start });
    const stale = await readShared(policy, ['swr'], fetcher, { now: start + 61_000 });
    expect(stale).toMatchObject({ data: { count: 1 }, state: 'stale' });
    await flush();
    await flush();
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect((await peekShared(policy, ['swr']))?.data.count).toBe(2);
  });

  it('keeps the last known good reading and its original time when a refresh fails', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce({ count: 7 }).mockRejectedValueOnce(new Error('timeout'));
    const good = await readShared(policy, ['lkg'], fetcher);
    const forced = await readShared(policy, ['lkg'], fetcher, { force: true });
    expect(forced).toMatchObject({ data: { count: 7 }, refreshFailed: true });
    expect(forced.fetchedAt).toBe(good.fetchedAt);
    expect(forced.attemptedAt).toBeGreaterThanOrEqual(good.attemptedAt);
  });

  it('never stores an invalid payload and reports unavailable without a previous reading', async () => {
    await expect(readShared(policy, ['bad'], async () => ({ count: 'many' }))).rejects.toBeInstanceOf(
      CacheUnavailableError,
    );
    expect(await peekShared(policy, ['bad'])).toBeNull();
    await readShared(policy, ['bad'], async () => ({ count: 0 }));
    const kept = await readShared(policy, ['bad'], async () => ({ nope: true }), { force: true });
    // A legitimate zero is valid; a malformed refresh never replaces it.
    expect(kept.data.count).toBe(0);
  });

  it('backs refreshes off exponentially while upstream keeps failing', () => {
    expect(nextAttemptAt({ attemptedAt: 1_000, failures: 0 }, 60_000)).toBe(0);
    expect(nextAttemptAt({ attemptedAt: 1_000, failures: 1 }, 60_000)).toBe(16_000);
    expect(nextAttemptAt({ attemptedAt: 1_000, failures: 3 }, 60_000)).toBe(61_000);
    expect(nextAttemptAt({ attemptedAt: 0, failures: 30 }, 60_000)).toBe(15 * 60_000);
  });

  it('waits for another process holding the refresh lock instead of calling upstream too', async () => {
    const key = cacheKey(policy, ['locked']);
    await redis.client.command(['SET', `${key}:lock`, 'other-process', 'PX', 5_000, 'NX']);
    const fetcher = vi.fn().mockResolvedValue({ count: 1 });
    const waiting = readShared(policy, ['locked'], fetcher);
    await new Promise((resolve) => setTimeout(resolve, 200));
    // The other process finishes and stores its reading.
    await redis.client.command([
      'SET',
      key,
      JSON.stringify({ v: 1, data: { count: 5 }, fetchedAt: Date.now(), attemptedAt: Date.now(), failures: 0 }),
      'PX',
      60_000,
    ]);
    expect((await waiting).data.count).toBe(5);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('recovers from an abandoned lock once it expires', async () => {
    const key = cacheKey(policy, ['abandoned']);
    await redis.client.command(['SET', `${key}:lock`, 'crashed', 'PX', 50, 'NX']);
    await new Promise((resolve) => setTimeout(resolve, 60));
    expect((await readShared(policy, ['abandoned'], async () => ({ count: 3 }))).data.count).toBe(3);
  });

  it('keeps families and keys isolated and invalidates one key only', async () => {
    await readShared(policy, ['server-a'], async () => ({ count: 1 }));
    await readShared(policy, ['server-b'], async () => ({ count: 2 }));
    await readShared({ ...policy, name: 'other' }, ['server-a'], async () => ({ count: 3 }));
    await invalidateShared(policy, ['server-a']);
    expect(await peekShared(policy, ['server-a'])).toBeNull();
    expect((await peekShared(policy, ['server-b']))?.data.count).toBe(2);
    expect((await peekShared({ ...policy, name: 'other' }, ['server-a']))?.data.count).toBe(3);
    expect(cacheKey(policy, ['../../x'])).toMatch(/^arrakis:cache:v1:test-family:[a-f0-9]{32}$/);
  });

  it('expires readings after the retention period, not the freshness period', async () => {
    const start = Date.now();
    await readShared(policy, ['retain'], async () => ({ count: 1 }), { now: start });
    expect((await peekShared(policy, ['retain'], start + 30 * 60_000))?.state).toBe('stale');
    expect(await peekShared(policy, ['retain'], start + 2 * 3_600_000)).toBeNull();
  });

  it('ignores a stored reading that fails validation (tampering or an older shape)', async () => {
    const key = cacheKey(policy, ['tampered']);
    await redis.client.command([
      'SET',
      key,
      JSON.stringify({ v: 1, data: { count: 'x' }, fetchedAt: Date.now(), attemptedAt: Date.now(), failures: 0 }),
      'PX',
      60_000,
    ]);
    expect(await peekShared(policy, ['tampered'])).toBeNull();
  });

  it('falls back to process memory while Redis is down and survives a restart through Redis', async () => {
    await readShared(policy, ['persist'], async () => ({ count: 6 }));
    // A "restart": process memory is gone, Redis still has the reading.
    resetSharedCacheForTests();
    const fetcher = vi.fn();
    expect((await readShared(policy, ['persist'], fetcher)).data.count).toBe(6);
    expect(fetcher).not.toHaveBeenCalled();
    redis.state.down = true;
    expect((await readShared(policy, ['memory-only'], async () => ({ count: 8 }))).data.count).toBe(8);
    expect((await readShared(policy, ['memory-only'], fetcher)).data.count).toBe(8);
  });
});
