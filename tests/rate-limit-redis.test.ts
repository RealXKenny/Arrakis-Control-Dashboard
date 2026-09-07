import { beforeEach, expect, it, vi } from 'vitest';
import { checkRateLimit, getClientAddress } from '../src/lib/rate-limit';
const { evaluate } = vi.hoisted(() => ({ evaluate: vi.fn() }));
vi.mock('../src/lib/redis', () => ({ getRedisClient: () => ({ eval: evaluate }) }));
vi.mock('../src/config/env', () => ({ getServerEnv: () => ({ NODE_ENV: 'production' }) }));
beforeEach(() => {
  evaluate.mockReset();
});
it('uses one atomic operation and returns the remaining window', async () => {
  evaluate.mockResolvedValue([121, 2500]);
  expect(await checkRateLimit('client', { limit: 120, windowMs: 60000 })).toEqual({
    allowed: false,
    remaining: 0,
    retryAfter: 3,
  });
  expect(evaluate).toHaveBeenCalledTimes(1);
  expect(evaluate.mock.calls[0][0]).toContain("redis.call('PEXPIRE'");
  expect(evaluate.mock.calls[0][2]).toEqual([60000]);
});
it('fails closed when Redis returns invalid data or fails', async () => {
  evaluate.mockResolvedValue('invalid');
  expect((await checkRateLimit('client', { limit: 120, windowMs: 60000 })).storageUnavailable).toBe(true);
  evaluate.mockImplementation(() => {
    throw new Error('offline');
  });
  expect((await checkRateLimit('client', { limit: 120, windowMs: 60000 })).allowed).toBe(false);
});
it('uses the connection address when no proxy address is present', () => {
  expect(getClientAddress({ headers: {}, socket: { remoteAddress: '127.0.0.1' } })).toBe('127.0.0.1');
});
