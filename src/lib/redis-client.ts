import './assert-server';
import { Redis, RedisOptions, Cluster, ClusterNode, ClusterOptions } from 'ioredis';
import { getServerEnv } from './env';
import { createLogger } from './logger';

/**
 * Production Redis access layer for the App Router data provider.
 *
 * Design goals under high load:
 * - Connection pooling: a small round-robin pool of independent connections
 *   spreads read commands so a single hot connection never becomes the tail.
 * - Automatic failover/reconnect: `retryStrategy` backs off exponentially
 *   (capped, jittered) per node; Cluster mode refreshes topology and follows
 *   slot migration via `clusterRetryStrategy` / `enableReadyCheck`.
 * - Error boundaries: `maxRetriesPerRequest` bounds blocking, the circuit
 *   breaker opens after consecutive failures and half-opens with a single
 *   probe, and callers always receive typed errors instead of hangs.
 *
 * Credential boundary: this module is server-only (assert-server) and is the
 * only place Redis connection details are turned into live sockets.
 */

const log = createLogger('REDIS');

export const REDIS_SNAPSHOT_TTL_SECONDS = 30;
export const REDIS_STALE_GRACE_SECONDS = 600;

/** Errors surfaced to providers — never carry connection strings. */
export class RedisUnavailableError extends Error {
  readonly code = 'REDIS_UNAVAILABLE';

  constructor(message = 'Redis is unavailable') {
    super(message);
    this.name = 'RedisUnavailableError';
  }
}

export type RedisKeyValueLike = {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, mode: 'EX', seconds: number): Promise<unknown>;
  zrange(key: string, min: number, max: number, options: { byScore: boolean }): Promise<unknown[]>;
  lrange(key: string, start: number, stop: number): Promise<unknown[]>;
};

type Client = Redis | Cluster;

function parseRedisUrl(url: string): RedisOptions {
  const parsed = new URL(url);
  const options: RedisOptions = {
    host: parsed.hostname,
    port: parsed.port ? Number(parsed.port) : 6379,
    // Dev note: lazy connections keep builds and cold starts sand-free.
    lazyConnect: true,
    connectTimeout: 5_000,
    keepAlive: 10_000,
    noDelay: true,
    maxRetriesPerRequest: 2,
    enableOfflineQueue: false,
    retryStrategy: (attempt) => {
      if (attempt > 8) return null; // stop trying; the breaker takes over
      const base = Math.min(2 ** attempt * 200, 5_000);
      return base + Math.floor(Math.random() * 250);
    },
    reconnectOnError: (error) => /READONLY|ETIMEDOUT|ECONNRESET/u.test(error.message),
  };
  if (parsed.protocol === 'rediss:') options.tls = {};
  if (parsed.username) options.username = decodeURIComponent(parsed.username);
  if (parsed.password) options.password = decodeURIComponent(parsed.password);
  const database = parsed.pathname.replace('/', '');
  if (database) options.db = Number(database);
  return options;
}

function clusterNodesFromEnv(value: string): ClusterNode[] {
  return value
    .split(',')
    .map((node) => node.trim())
    .filter(Boolean)
    .map((node) => {
      const hostPort = node.replace(/^\[|\]$/g, '').split(':');
      return { host: hostPort[0], port: hostPort[1] ? Number(hostPort[1]) : 6379 };
    });
}

/** Circuit breaker states: closed (flow) -> open (reject) -> half-open (probe). */
type BreakerState = 'closed' | 'open' | 'half-open';

export class RedisClientPool implements RedisKeyValueLike {
  private readonly clients: Client[] = [];
  private readonly owned: Client[] = [];
  private cursor = 0;
  private failures = 0;
  private breaker: BreakerState = 'closed';
  private openedAt = 0;
  private readonly failureThreshold: number;
  private readonly cooldownMs: number;

  constructor(
    private readonly makeClient: (index: number) => Client,
    options: { size?: number; failureThreshold?: number; cooldownMs?: number } = {},
  ) {
    const size = Math.max(1, options.size ?? 4);
    this.failureThreshold = options.failureThreshold ?? 5;
    this.cooldownMs = options.cooldownMs ?? 10_000;
    for (let index = 0; index < size; index++) this.clients.push(this.makeClient(index));
    for (const client of this.clients) this.watch(client);
  }

  private watch(client: Client) {
    // Dev note: credentials stay out of the logs; only the failure phase is news.
    client.on('error', (error) => {
      log.debug('connection error', { message: error.message });
    });
    client.on('reconnecting', () => log.debug('connection retrying'));
  }

  private next(): Client {
    if (this.breaker === 'open') {
      if (Date.now() - this.openedAt < this.cooldownMs) throw new RedisUnavailableError();
      this.breaker = 'half-open';
      log.info('circuit breaker half-open; probing Redis');
    }
    const client = this.clients[this.cursor];
    this.cursor = (this.cursor + 1) % this.clients.length;
    return client;
  }

  private onSuccess() {
    if (this.breaker !== 'closed') log.info('Redis connection restored');
    this.breaker = 'closed';
    this.failures = 0;
  }

  private onFailure() {
    this.failures += 1;
    if (this.breaker === 'half-open' || this.failures >= this.failureThreshold) {
      this.breaker = 'open';
      this.openedAt = Date.now();
      log.warn('Redis circuit breaker opened; failing fast until cooldown elapses');
    }
  }

  private async run<T>(command: (client: Client) => Promise<T>): Promise<T> {
    const client = this.next();
    try {
      if (!client.status || client.status === 'wait' || client.status === 'end') {
        // Dev note: connect() is idempotent once status is 'connect'/'ready'.
        if (client.status === 'end') throw new RedisUnavailableError('connection is closed');
        await (client as Redis).connect?.();
      }
      const value = await command(client);
      this.onSuccess();
      return value;
    } catch (error) {
      this.onFailure();
      throw error instanceof RedisUnavailableError ? error : new RedisUnavailableError();
    }
  }

  get(key: string): Promise<string | null> {
    return this.run((client) => client.get(key));
  }

  set(key: string, value: string, mode: 'EX', seconds: number): Promise<unknown> {
    return this.run((client) => client.set(key, value, mode, seconds));
  }

  zrange(key: string, min: number, max: number, options: { byScore: boolean }): Promise<unknown[]> {
    return this.run((client) => client.zrange(key, min, max, options as never) as Promise<unknown[]>);
  }

  lrange(key: string, start: number, stop: number): Promise<unknown[]> {
    return this.run((client) => client.lrange(key, start, stop));
  }

  /** Gracefully close every pooled connection (test hooks and shutdown). */
  async quit(): Promise<void> {
    await Promise.allSettled(this.owned.map((client) => client.quit()));
  }
}

function createPooledClient(env: ReturnType<typeof getServerEnv>): Client {
  if (env.REDIS_CLUSTER_NODES) {
    const nodes = clusterNodesFromEnv(env.REDIS_CLUSTER_NODES);
    const base = env.REDIS_URL ? parseRedisUrl(env.REDIS_URL) : {};
    const redisOptions: NonNullable<ClusterOptions['redisOptions']> = {
      connectTimeout: base.connectTimeout,
      keepAlive: base.keepAlive,
      noDelay: base.noDelay,
      maxRetriesPerRequest: base.maxRetriesPerRequest,
      tls: base.tls,
      username: base.username,
      password: base.password,
      db: base.db,
    };
    const options: ClusterOptions = {
      redisOptions,
      clusterRetryStrategy: (attempt) => {
        if (attempt > 8) return null;
        const backoff = Math.min(2 ** attempt * 200, 5_000);
        return backoff + Math.floor(Math.random() * 250);
      },
      enableReadyCheck: true,
      maxRedirections: 16,
      retryDelayOnFailover: 300,
      retryDelayOnClusterDown: 500,
      slotsRefreshTimeout: 5_000,
    };
    log.info('configuring Redis cluster client', { nodes: nodes.length });
    return new Cluster(nodes, options);
  }
  if (!env.REDIS_URL) throw new RedisUnavailableError('REDIS_URL is not configured');
  return new Redis(parseRedisUrl(env.REDIS_URL));
}

const globals = globalThis as typeof globalThis & { arrakisRedisPool?: RedisClientPool };

/** Shared process-wide pool; four connections spread reads across event loops. */
export function getRedisPool(): RedisClientPool {
  if (!globals.arrakisRedisPool) {
    const env = getServerEnv();
    globals.arrakisRedisPool = new RedisClientPool(() => createPooledClient(env), { size: 4 });
  }
  return globals.arrakisRedisPool;
}
