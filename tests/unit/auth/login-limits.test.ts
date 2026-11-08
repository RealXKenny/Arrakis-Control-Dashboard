import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../src/lib/assert-server', () => ({}));
vi.mock('../../../src/lib/redis/client', () => ({ getRedisClient: () => null }));
vi.mock('../../../src/config/env', () => ({ getServerEnv: () => ({ NODE_ENV: 'test', TRUSTED_PROXY_COUNT: 0 }) }));

beforeEach(() => {
  vi.resetModules();
});

describe('password sign-in budgets', () => {
  it('does not let anonymous callers share one budget when no client address is known', async () => {
    const { checkPasswordLoginLimits } = await import('../../../src/features/auth/server/login-limits');
    // 60 different guessers against 60 different accounts must not lock each other out.
    for (let index = 0; index < 60; index += 1) {
      expect(await checkPasswordLoginLimits('unknown', `member${index}@dune.test`)).toBe(true);
    }
  });

  it('still limits repeated guesses against one account from an unknown address', async () => {
    const { checkPasswordLoginLimits } = await import('../../../src/features/auth/server/login-limits');
    const results: boolean[] = [];
    for (let index = 0; index < 12; index += 1) {
      results.push(await checkPasswordLoginLimits('unknown', 'target@dune.test'));
    }
    expect(results.slice(0, 8).every(Boolean)).toBe(true);
    expect(results.slice(8).some((allowed) => !allowed)).toBe(true);
  });

  it('keeps the per-address budget for a known address', async () => {
    const { checkPasswordLoginLimits } = await import('../../../src/features/auth/server/login-limits');
    let refused = 0;
    for (let index = 0; index < 50; index += 1) {
      if (!(await checkPasswordLoginLimits('203.0.113.9', `member${index}@dune.test`))) refused += 1;
    }
    expect(refused).toBe(10);
  });
});
