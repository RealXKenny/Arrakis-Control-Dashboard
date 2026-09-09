import { beforeEach, expect, it, vi } from 'vitest';
import { checkRateLimit, getClientAddress } from '../../src/lib/rate-limit';
const { increment } = vi.hoisted(() => ({ increment: vi.fn() }));
vi.mock('../../src/infrastructure/storage', () => ({ getStateStore: () => ({ incrementRateLimit: increment }) }));
vi.mock('../../src/config/env', () => ({ getServerEnv: () => ({ NODE_ENV: 'production', STORAGE_BACKEND: 'redis' }) }));
beforeEach(() => {
  increment.mockReset();
});
it('uses one atomic operation and returns the remaining window', async () => {
  increment.mockResolvedValue({ count: 121, resetAt: Date.now() + 2500 });
  expect(await checkRateLimit('client', { limit: 120, windowMs: 60000 })).toEqual({
    allowed: false,
    remaining: 0,
    retryAfter: 3,
  });
  expect(increment).toHaveBeenCalledTimes(1);
  expect(increment.mock.calls[0][1]).toBe(60000);
});
it('fails closed when Redis returns invalid data or fails', async () => {
  increment.mockResolvedValue({ count: Number.NaN, resetAt: Number.NaN });
  expect((await checkRateLimit('client', { limit: 120, windowMs: 60000 })).storageUnavailable).toBe(true);
  increment.mockImplementation(() => {
    throw new Error('offline');
  });
  expect((await checkRateLimit('client', { limit: 120, windowMs: 60000 })).allowed).toBe(false);
});
it('uses the connection address when no proxy address is present', () => {
  expect(getClientAddress({ headers: {}, socket: { remoteAddress: '127.0.0.1' } })).toBe('127.0.0.1');
});
