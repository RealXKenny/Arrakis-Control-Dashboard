import './assert-server';
import { createClient } from 'redis';
import { getServerEnv } from '../config/env';

function decode<T>(value: string): T {
  try {
    return JSON.parse(value) as T;
  } catch {
    return value as T;
  }
}

// Preserve existing storage encoding: strings stay raw, objects are JSON.
function encode(value: unknown): string {
  return typeof value === 'string' ? value : JSON.stringify(value);
}

export function createDashboardRedis(url: string) {
  const client = createClient({
    url,
    socket: { connectTimeout: 5000, socketTimeout: 5000, reconnectStrategy: false },
    disableOfflineQueue: true,
    commandsQueueMaxLength: 1000,
  });
  // Command promises report failures to callers; never log URLs or credentials.
  client.on('error', () => {});
  let connecting: Promise<unknown> | undefined;
  async function command(args: string[]): Promise<unknown> {
    if (!client.isReady) {
      connecting ??= client.connect().finally(() => {
        connecting = undefined;
      });
      await connecting;
    }
    return client.sendCommand(args);
  }
  return {
    async get<T = unknown>(key: string): Promise<T | null> {
      const value = await command(['GET', key]);
      return value === null ? null : decode<T>(String(value));
    },
    set(key: string, value: unknown, options: { ex?: number; nx?: boolean } = {}) {
      const args = ['SET', key, encode(value)];
      if (options.ex !== undefined) args.push('EX', String(options.ex));
      if (options.nx) args.push('NX');
      return command(args);
    },
    del(key: string) {
      return command(['DEL', key]);
    },
    eval(script: string, keys: string[], args: Array<string | number>) {
      return command(['EVAL', script, String(keys.length), ...keys, ...args.map(String)]);
    },
    zadd(key: string, entry: { score: number; member: unknown }) {
      return command(['ZADD', key, String(entry.score), encode(entry.member)]);
    },
    async zrange<T extends unknown[]>(key: string, min: number, max: number, options: { byScore: true }): Promise<T> {
      const values = await command([options.byScore ? 'ZRANGEBYSCORE' : 'ZRANGE', key, String(min), String(max)]);
      if (!Array.isArray(values)) throw new Error('Invalid Redis sorted-set response');
      return values.map((value) => decode(String(value))) as T;
    },
    zremrangebyscore(key: string, min: number, max: number) {
      return command(['ZREMRANGEBYSCORE', key, String(min), String(max)]);
    },
    expire(key: string, seconds: number) {
      return command(['EXPIRE', key, String(seconds)]);
    },
    close() {
      if (client.isOpen) client.destroy();
    },
  };
}

type DashboardRedis = ReturnType<typeof createDashboardRedis>;
const globals = globalThis as typeof globalThis & { arrakisRedisClient?: DashboardRedis };
export function getRedisClient(): DashboardRedis | null {
  const env = getServerEnv();
  if (!env.REDIS_URL) {
    if (env.NODE_ENV === 'production') throw new Error('REDIS_URL is required in production.');
    return null;
  }
  // Share one connection across Next.js API bundles and development reloads.
  return (globals.arrakisRedisClient ??= createDashboardRedis(env.REDIS_URL));
}
