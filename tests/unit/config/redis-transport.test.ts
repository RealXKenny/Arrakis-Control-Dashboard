import { describe, expect, it, vi } from 'vitest';

vi.mock('../../../src/lib/assert-server', () => ({}));

describe('redisTransportWarnings', () => {
  it('stays quiet outside production and for private or loopback plain-text Redis with a password', async () => {
    const { redisTransportWarnings } = await import('../../../src/config/env');
    const base = { REDIS_CLUSTER_NODES: undefined } as const;
    expect(
      redisTransportWarnings({ ...base, NODE_ENV: 'development', REDIS_URL: 'redis://redis.example.com' }),
    ).toEqual([]);
    for (const host of ['127.0.0.1', 'localhost', '10.0.0.4', '172.20.1.2', '192.168.1.5', 'redis']) {
      expect(
        redisTransportWarnings({ ...base, NODE_ENV: 'production', REDIS_URL: `redis://:pw@${host}:6379` }),
      ).toEqual([]);
    }
  });

  it('keeps the missing-password warning without repeating transport advisories', async () => {
    const { redisTransportWarnings } = await import('../../../src/config/env');
    const warnings = redisTransportWarnings({
      NODE_ENV: 'production',
      REDIS_URL: 'redis://redis.example.com:6379',
      REDIS_CLUSTER_NODES: 'a:1,b:2',
    });
    expect(warnings).toEqual([
      'REDIS_URL carries no password; make sure Redis is not reachable from untrusted networks.',
    ]);
    expect(warnings.join(' ')).not.toMatch(/pw|:\/\/.*@/);
    expect(
      redisTransportWarnings({
        NODE_ENV: 'production',
        REDIS_URL: 'rediss://:pw@redis.example.com',
        REDIS_CLUSTER_NODES: undefined,
      }),
    ).toEqual([]);
    expect(
      redisTransportWarnings({
        NODE_ENV: 'production',
        REDIS_URL: 'redis://:pw@redis.example.com:6379',
        REDIS_CLUSTER_NODES: 'a:1,b:2',
      }),
    ).toEqual([]);
  });
});
