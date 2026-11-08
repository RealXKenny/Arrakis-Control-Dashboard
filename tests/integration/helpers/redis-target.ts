import { Cluster, Redis } from 'ioredis';

/**
 * Where the integration tests run. Exactly one disposable Redis is named, always on loopback:
 *
 *   TEST_REDIS_URL=redis://127.0.0.1:6391/15                       standalone Redis (database 15 is flushed)
 *   TEST_REDIS_CLUSTER_NODES=127.0.0.1:7001,127.0.0.1:7002,...     a real Redis Cluster (every master is flushed)
 *
 * Never point either at a shared or production instance.
 */
const LOOPBACK_URL = /^redis:\/\/(127\.0\.0\.1|localhost|\[::1\])(:\d+)?\/\d+$/;
const LOOPBACK_NODE = /^(127\.0\.0\.1|localhost|\[::1\]):\d+$/;

export type IntegrationTarget =
  { mode: 'standalone'; url: string } | { mode: 'cluster'; nodes: string[]; url?: undefined };

export function integrationTarget(): IntegrationTarget {
  const nodes = process.env.TEST_REDIS_CLUSTER_NODES?.split(',')
    .map((node) => node.trim())
    .filter(Boolean);
  if (nodes?.length) {
    if (!nodes.every((node) => LOOPBACK_NODE.test(node)))
      throw new Error('TEST_REDIS_CLUSTER_NODES must list loopback host:port entries only.');
    return { mode: 'cluster', nodes };
  }
  const url = process.env.TEST_REDIS_URL;
  if (!url) throw new Error('Set TEST_REDIS_URL or TEST_REDIS_CLUSTER_NODES (a disposable Redis) to run these tests.');
  if (!LOOPBACK_URL.test(url))
    throw new Error(
      'TEST_REDIS_URL must name a loopback Redis and an explicit database, e.g. redis://127.0.0.1:6391/15',
    );
  return { mode: 'standalone', url };
}

/** Point the application's own configuration at the target, exactly as a deployment would. */
export function configureApplication(target: IntegrationTarget): void {
  if (target.mode === 'cluster') {
    process.env.REDIS_CLUSTER_NODES = target.nodes.join(',');
    process.env.REDIS_URL = `redis://${target.nodes[0]}`;
  } else {
    delete process.env.REDIS_CLUSTER_NODES;
    process.env.REDIS_URL = target.url;
  }
}

/**
 * A raw client for assertions and setup, independent of the application's client. On a Cluster, `keys`
 * and `flushdb` run on every master (they are not routable by key); everything else follows the slot.
 */
export function connectDirect(target: IntegrationTarget): Redis {
  if (target.mode === 'standalone') return new Redis(target.url, { maxRetriesPerRequest: 2 });
  const cluster = new Cluster(
    target.nodes.map((node) => {
      const colon = node.lastIndexOf(':');
      return { host: node.slice(0, colon), port: Number(node.slice(colon + 1)) };
    }),
    { redisOptions: { maxRetriesPerRequest: 2 } },
  );
  // Roles change on failover, so ask each node who it is right now instead of trusting the client's cached view.
  const masters = async () => {
    const nodes = cluster.nodes('all');
    const roles = await Promise.all(
      nodes.map((node) =>
        node
          .role()
          .then((reply) => reply[0])
          .catch(() => 'unknown'),
      ),
    );
    return nodes.filter((_, index) => roles[index] === 'master');
  };
  const overrides: Record<string, unknown> = {
    keys: async (pattern: string) => (await Promise.all((await masters()).map((node) => node.keys(pattern)))).flat(),
    // Right after a failover a demoting node can briefly still answer as a master, so repeat until the data is gone.
    flushdb: async () => {
      for (let attempt = 0; attempt < 15; attempt += 1) {
        const nodes = await masters();
        await Promise.all(nodes.map((node) => node.flushdb().catch(() => undefined)));
        const left = await Promise.all((await masters()).map((node) => node.dbsize().catch(() => 1)));
        if (left.every((count) => count === 0)) return 'OK';
        await new Promise((resolve) => setTimeout(resolve, 300));
      }
      throw new Error('The test cluster could not be emptied; check its topology.');
    },
  };
  return new Proxy(cluster, {
    get(base, property, receiver) {
      if (typeof property === 'string' && property in overrides) return overrides[property];
      const value = Reflect.get(base, property, receiver);
      return typeof value === 'function' ? value.bind(base) : value;
    },
  }) as unknown as Redis;
}
