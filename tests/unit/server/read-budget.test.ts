import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  forwarded: undefined as string | undefined,
  sessionId: null as string | null,
  proxies: 0,
}));

vi.mock('../../../src/lib/assert-server', () => ({}));
vi.mock('../../../src/lib/redis/client', () => ({ getRedisClient: () => null }));
vi.mock('../../../src/config/env', () => ({
  getServerEnv: () => ({ NODE_ENV: 'test', TRUSTED_PROXY_COUNT: state.proxies, API_GLOBAL_READ_LIMIT: 100_000 }),
}));
vi.mock('next/headers', () => ({
  headers: async () => new Headers(state.forwarded ? { 'x-forwarded-for': state.forwarded } : {}),
}));
vi.mock('../../../src/features/auth/server/session', () => ({ currentSessionId: async () => state.sessionId }));

beforeEach(() => {
  vi.resetModules();
  state.forwarded = undefined;
  state.sessionId = null;
  state.proxies = 0;
});

describe('read budget without a client address', () => {
  it('gives each session its own per-client budget instead of one shared "unknown" bucket', async () => {
    const { spendReadBudget, READ_LIMITS } = await import('../../../src/server/read-budget');
    state.sessionId = 'session-noisy';
    for (let index = 0; index < READ_LIMITS.perIp.limit; index += 1) {
      expect((await spendReadBudget()).allowed).toBe(true);
    }
    expect((await spendReadBudget()).allowed).toBe(false);

    // Another member is not penalised for the noisy one.
    state.sessionId = 'session-quiet';
    expect((await spendReadBudget()).allowed).toBe(true);
  });

  it('still keys by address when one is known', async () => {
    const { spendReadBudget, READ_LIMITS } = await import('../../../src/server/read-budget');
    state.proxies = 1;
    state.forwarded = '203.0.113.9';
    for (let index = 0; index < READ_LIMITS.perIp.limit; index += 1) await spendReadBudget();
    // A different session from the same address shares the address budget.
    state.sessionId = 'another-session';
    expect((await spendReadBudget()).allowed).toBe(false);
  });
});
