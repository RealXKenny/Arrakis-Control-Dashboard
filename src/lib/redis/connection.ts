import '../assert-server';
import type { ClusterNode, RedisOptions } from 'ioredis';

/**
 * Connection helpers shared by every ioredis consumer (the command client and the snapshot pool).
 * Pure option building and slot maths only: no sockets are opened here.
 */

export function parseRedisUrl(url: string): RedisOptions {
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
      if (attempt > 8) return null; // stop trying; the circuit breaker takes over
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

export function clusterNodesFromEnv(value: string): ClusterNode[] {
  return value
    .split(',')
    .map((node) => node.trim())
    .filter(Boolean)
    .map((node) => {
      // Bracketed IPv6 first ([::1]:7001), then plain host:port, then a bare host.
      const bracketed = /^\[([^\]]+)](?::(\d{1,5}))?$/.exec(node);
      if (bracketed) return { host: bracketed[1], port: bracketed[2] ? Number(bracketed[2]) : 6379 };
      const colon = node.lastIndexOf(':');
      if (colon === -1) return { host: node, port: 6379 };
      return { host: node.slice(0, colon), port: Number(node.slice(colon + 1)) };
    });
}

const CRC16_TABLE = (() => {
  const table = new Uint16Array(256);
  for (let index = 0; index < 256; index++) {
    let crc = index << 8;
    for (let bit = 0; bit < 8; bit++) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    table[index] = crc;
  }
  return table;
})();

/** Redis Cluster hash slot for a key, honouring `{hash tags}` exactly as the server does. */
export function keySlot(key: string): number {
  let tag = key;
  const open = key.indexOf('{');
  if (open !== -1) {
    const close = key.indexOf('}', open + 1);
    if (close > open + 1) tag = key.slice(open + 1, close);
  }
  let crc = 0;
  for (const byte of Buffer.from(tag)) crc = ((crc << 8) & 0xffff) ^ CRC16_TABLE[((crc >> 8) ^ byte) & 0xff];
  return crc % 16384;
}

/**
 * Multi-key Lua scripts only work on a cluster when every key hashes to one slot. Checking
 * client-side turns an obscure server CROSSSLOT error into a clear, early failure.
 */
export function assertSingleSlot(keys: readonly string[]): void {
  if (keys.length < 2) return;
  const slot = keySlot(keys[0]);
  if (keys.some((key) => keySlot(key) !== slot)) {
    throw new Error(
      `Redis Cluster scripts must keep all ${keys.length} keys in one hash slot. Use a shared {hash tag}.`,
    );
  }
}
