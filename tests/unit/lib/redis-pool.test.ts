import { afterEach, describe, expect, it, vi } from 'vitest';

const clusterOptions = vi.hoisted(() => vi.fn());

vi.mock('../../../src/lib/assert-server', () => ({}));
vi.mock('ioredis', () => ({
  Cluster: class {
    constructor(_nodes: unknown, options: unknown) {
      clusterOptions(options);
    }
    on() {}
  },
  Redis: class {},
}));

describe('Redis Cluster pool options', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    delete (globalThis as { arrakisRedisPool?: unknown }).arrakisRedisPool;
  });

  it('never forwards a standalone database selection to Cluster connections', async () => {
    vi.stubEnv('REDIS_URL', 'redis://127.0.0.1:6379/15');
    vi.stubEnv('REDIS_CLUSTER_NODES', '127.0.0.1:7001,127.0.0.1:7002');
    const { getRedisPool } = await import('../../../src/lib/redis/pool');
    getRedisPool();
    expect(clusterOptions).toHaveBeenCalled();
    const options = clusterOptions.mock.calls[0]![0] as { redisOptions: Record<string, unknown> };
    expect(options.redisOptions).not.toHaveProperty('db');
  });

  it('closes every pooled connection on shutdown', async () => {
    const { RedisClientPool } = await import('../../../src/lib/redis/pool');
    const clients = Array.from({ length: 2 }, () => ({ on: vi.fn(), quit: vi.fn().mockResolvedValue('OK') }));
    let index = 0;
    const pool = new RedisClientPool(() => clients[index++]! as never, { size: 2 });
    await pool.quit();
    for (const client of clients) expect(client.quit).toHaveBeenCalledOnce();
  });
});
