import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const storage = vi.hoisted(() => ({ enabled: false, set: vi.fn(), get: vi.fn(), del: vi.fn() }));
vi.mock('../../src/lib/redis/client', () => ({ getRedisClient: () => (storage.enabled ? storage : null) }));

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-09-07T12:00:00Z'));
  storage.enabled = false;
  vi.clearAllMocks();
});
afterEach(() => {
  vi.useRealTimers();
  vi.resetModules();
});

// Lifetime is under test here; the Discord re-check has its own tests (tests/unit/lib/session-reverify.test.ts).
vi.mock('../../src/server/auth/reverify', () => ({ reverifySession: async (_id: string, record: unknown) => record }));

const session = () => ({
  user: { id: 'tester' },
  guildId: 'guild',
  roleIds: [],
  expiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000,
});

it('keeps a login across module reloads and expires it at thirty days', async () => {
  const first = await import('../../src/lib/security/session-store');
  expect(first.sessionTtlSeconds()).toBe(2592000);
  await first.saveSession('reload-test', session());
  vi.advanceTimersByTime(2 * 60 * 1000);
  vi.resetModules();
  const reloaded = await import('../../src/lib/security/session-store');
  expect(await reloaded.getSession('reload-test')).not.toBeNull();
  vi.advanceTimersByTime((30 * 24 * 60 * 60 - 121) * 1000);
  expect(await reloaded.getSession('reload-test')).not.toBeNull();
  vi.advanceTimersByTime(1000);
  expect(await reloaded.getSession('reload-test')).toBeNull();
});

it('writes the thirty-day lifetime to Redis and preserves logout revocation', async () => {
  storage.enabled = true;
  const store = await import('../../src/lib/security/session-store');
  const value = session();
  await store.saveSession('redis-test', value);
  expect(storage.set).toHaveBeenCalledWith(expect.stringMatching(/^arrakis:session:/), value, { ex: 2592000 });
  await store.deleteSession('redis-test');
  expect(storage.del).toHaveBeenCalledWith(storage.set.mock.calls[0][0]);
});

it('uses remaining lifetime when saving an already-running session', async () => {
  storage.enabled = true;
  const store = await import('../../src/lib/security/session-store');
  const value = session();
  vi.advanceTimersByTime(6 * 60 * 60 * 1000);
  await store.saveSession('remaining-test', value);
  expect(storage.set).toHaveBeenCalledWith(expect.any(String), value, { ex: 2592000 - 21600 });
});

it('does not treat a Redis outage as an expired login or use a local fallback', async () => {
  storage.enabled = true;
  storage.get.mockRejectedValueOnce(new Error('storage unavailable'));
  const store = await import('../../src/lib/security/session-store');
  await expect(store.getSession('outage-test')).rejects.toThrow('storage unavailable');
});
