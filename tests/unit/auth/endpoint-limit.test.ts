import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../src/lib/assert-server', () => ({}));
vi.mock('../../../src/lib/redis/client', () => ({ getRedisClient: () => null }));
vi.mock('../../../src/config/env', () => ({ getServerEnv: () => ({ NODE_ENV: 'test', TRUSTED_PROXY_COUNT: 1 }) }));

beforeEach(() => vi.resetModules());

const request = (forwarded?: string) =>
  new Request('http://dashboard.test/api/auth/signin', {
    headers: forwarded ? { 'x-forwarded-for': forwarded } : {},
  });

describe('Auth.js endpoint limit', () => {
  it('refuses a client that exceeds its per-address budget, without affecting another address', async () => {
    const { limitAuthRequests } = await import('../../../src/features/auth/server/endpoint-limit');
    const handler = vi.fn(async () => new Response('ok'));
    const limited = limitAuthRequests(handler);
    const statuses: number[] = [];
    for (let index = 0; index < 125; index += 1) statuses.push((await limited(request('203.0.113.9'))).status);
    expect(statuses.slice(0, 120).every((status) => status === 200)).toBe(true);
    expect(statuses.slice(120)).toEqual([429, 429, 429, 429, 429]);
    expect((await limited(request('203.0.113.10'))).status).toBe(200);
  });

  it('never throttles callers it cannot tell apart', async () => {
    const { limitAuthRequests } = await import('../../../src/features/auth/server/endpoint-limit');
    const limited = limitAuthRequests(async () => new Response('ok'));
    for (let index = 0; index < 150; index += 1) expect((await limited(request())).status).toBe(200);
  });
});
