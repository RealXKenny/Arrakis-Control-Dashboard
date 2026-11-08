import '../assert-server';
import { Cluster, Redis, type ClusterOptions, type RedisOptions } from 'ioredis';
import { getServerEnv } from '../../config/env';
import { assertSingleSlot, clusterNodesFromEnv, parseRedisUrl } from './connection';

function decode<T>(value: string): T {
  try {
    return JSON.parse(value) as T;
  } catch {
    return value as T;
  }
}

function encode(value: unknown): string {
  // Dev note: strings stay strings; surprise JSON is how sandworms happen.
  return typeof value === 'string' ? value : JSON.stringify(value);
}

/** How long a command waits for a (re)connection before failing fast instead of hanging a request. */
const READY_WAIT_MS = 1_500;

type Connection = Redis | Cluster;

/** Reconnect forever with a short, capped, jittered backoff: a later request can always recover. */
function endlessRetry(attempt: number): number {
  return Math.min(attempt * 150, 2_000) + Math.floor(Math.random() * 100);
}

function standaloneOptions(url: string): RedisOptions {
  return { ...parseRedisUrl(url), retryStrategy: endlessRetry, maxRetriesPerRequest: 1 };
}

function createConnection(url: string | undefined, clusterNodes: string | undefined): Connection {
  if (clusterNodes) {
    const base: RedisOptions = url ? parseRedisUrl(url) : {};
    const options: ClusterOptions = {
      lazyConnect: true,
      enableOfflineQueue: false,
      enableReadyCheck: true,
      maxRedirections: 16,
      retryDelayOnFailover: 300,
      retryDelayOnClusterDown: 500,
      slotsRefreshTimeout: 5_000,
      clusterRetryStrategy: endlessRetry,
      redisOptions: {
        connectTimeout: base.connectTimeout,
        keepAlive: base.keepAlive,
        noDelay: base.noDelay,
        maxRetriesPerRequest: 1,
        tls: base.tls,
        username: base.username,
        password: base.password,
        // Redis Cluster has a single database; `db` is deliberately not forwarded.
      },
    };
    return new Cluster(clusterNodesFromEnv(clusterNodes), options);
  }
  if (!url) throw new Error('REDIS_URL is required.');
  return new Redis(standaloneOptions(url));
}

/**
 * Make sure the connection is usable, connecting lazily on first use. Offline queueing is off, so
 * a dead Redis fails within READY_WAIT_MS rather than stalling requests, and a recovered Redis is
 * picked up by the very next command.
 */
async function ready(connection: Connection): Promise<void> {
  if (connection.status === 'ready') return;
  if (connection.status === 'end') throw new Error('Redis connection is closed.');
  if (connection.status === 'wait') void connection.connect().catch(() => undefined);

  await new Promise<void>((resolve, reject) => {
    const finish = (error?: Error) => {
      clearTimeout(timer);
      connection.off('ready', onReady);
      connection.off('end', onEnd);
      if (error) reject(error);
      else resolve();
    };
    const onReady = () => finish();
    const onEnd = () => finish(new Error('Redis connection is closed.'));
    const timer = setTimeout(() => finish(new Error('Redis is unavailable.')), READY_WAIT_MS);
    connection.on('ready', onReady);
    connection.on('end', onEnd);
    // The state may have flipped between the check above and registering listeners.
    if (connection.status === 'ready') finish();
  });
}

/**
 * Small command surface used across the app, backed by ioredis. Works against a single node or a
 * Redis Cluster (when `clusterNodes` is given) without callers knowing which.
 */
export function createDashboardRedis(url: string | undefined, options: { clusterNodes?: string } = {}) {
  const clustered = Boolean(options.clusterNodes);
  const connection = createConnection(url, options.clusterNodes);
  // Dev note: errors travel upward, while credentials remain in the witness program.
  connection.on('error', () => {});

  async function command(args: Array<string | number>): Promise<unknown> {
    await ready(connection);
    const [name, ...rest] = args;
    return connection.call(String(name), ...rest.map(String));
  }

  return {
    async get<T = unknown>(key: string): Promise<T | null> {
      const value = await command(['GET', key]);
      return value === null ? null : decode<T>(String(value));
    },
    set(key: string, value: unknown, options: { ex?: number; nx?: boolean; xx?: boolean } = {}) {
      const args: Array<string | number> = ['SET', key, encode(value)];
      if (options.ex !== undefined) args.push('EX', options.ex);
      if (options.nx) args.push('NX');
      if (options.xx) args.push('XX');
      return command(args);
    },
    del(key: string) {
      return command(['DEL', key]);
    },
    eval(script: string, keys: string[], args: Array<string | number>) {
      if (clustered) assertSingleSlot(keys);
      return command(['EVAL', script, keys.length, ...keys, ...args]);
    },
    zadd(key: string, entry: { score: number; member: unknown }) {
      return command(['ZADD', key, entry.score, encode(entry.member)]);
    },
    async zrange<T extends unknown[]>(
      key: string,
      min: number,
      max: number,
      options: { byScore: boolean },
    ): Promise<T> {
      const values = await command([options.byScore ? 'ZRANGEBYSCORE' : 'ZRANGE', key, min, max]);
      if (!Array.isArray(values)) throw new Error('Invalid Redis sorted-set response');
      return values.map((value) => decode(String(value))) as T;
    },
    zremrangebyscore(key: string, min: number, max: number) {
      return command(['ZREMRANGEBYSCORE', key, min, max]);
    },
    expire(key: string, seconds: number) {
      return command(['EXPIRE', key, seconds]);
    },
    close() {
      connection.disconnect();
    },
  };
}

type DashboardRedis = ReturnType<typeof createDashboardRedis>;
const globals = globalThis as typeof globalThis & { arrakisRedisClient?: DashboardRedis };
export function getRedisClient(): DashboardRedis | null {
  const env = getServerEnv();
  if (!env.REDIS_URL && !env.REDIS_CLUSTER_NODES) {
    if (env.NODE_ENV === 'production') throw new Error('REDIS_URL is required in production.');
    return null;
  }
  // Dev note: one Redis connection is enough spice for every Next.js bundle.
  return (globals.arrakisRedisClient ??= createDashboardRedis(env.REDIS_URL, {
    clusterNodes: env.REDIS_CLUSTER_NODES,
  }));
}
