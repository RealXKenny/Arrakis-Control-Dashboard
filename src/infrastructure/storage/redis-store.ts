import '../../lib/assert-server';
import { getRedisClient } from '../../lib/redis';
import type { StateStore } from './types';

function client() {
  const redis = getRedisClient();
  if (!redis) throw new Error('Shared storage is unavailable');
  return redis;
}

export const redisStateStore: StateStore = {
  getSession(hash) {
    return client().get(`arrakis:session:${hash}`);
  },
  async saveSession(hash, value, expiresAt) {
    await client().set(`arrakis:session:${hash}`, value, {
      ex: Math.max(1, Math.ceil((expiresAt - Date.now()) / 1000)),
    });
  },
  async deleteSession(hash) {
    await client().del(`arrakis:session:${hash}`);
  },
  async incrementRateLimit(key, windowMs) {
    const result = await client().eval(
      `local count = redis.call('INCR', KEYS[1]); local ttl = redis.call('PTTL', KEYS[1]); if ttl < 0 then redis.call('PEXPIRE', KEYS[1], ARGV[1]); ttl = tonumber(ARGV[1]); end; return {count, ttl}`,
      [key],
      [windowMs],
    );
    if (!Array.isArray(result)) throw new Error('Invalid rate limit response');
    return { count: Number(result[0]), resetAt: Date.now() + Number(result[1]) };
  },
  async reserveImport(owner, day, operationId, value, limit) {
    const result = await client().eval(
      `local existing = redis.call('GET', KEYS[2]); if existing then return existing end; if redis.call('HLEN', KEYS[1]) >= tonumber(ARGV[3]) then return 'LIMIT' end; redis.call('SET', KEYS[2], ARGV[2], 'EX', 172800); redis.call('HSET', KEYS[1], ARGV[1], ARGV[2]); redis.call('EXPIRE', KEYS[1], 172800); return 'NEW'`,
      [`arrakis:solido:${owner}:${day}`, `arrakis:solido:operation:${owner}:${operationId}`],
      [operationId, JSON.stringify(value), limit],
    );
    if (result === 'NEW' || result === 'LIMIT') return result;
    return typeof result === 'string' ? JSON.parse(result) : result;
  },
  async finishImport(owner, day, operationId, value) {
    await client().eval(
      `redis.call('SET', KEYS[2], ARGV[2], 'EX', 172800); redis.call('HSET', KEYS[1], ARGV[1], ARGV[2]); redis.call('EXPIRE', KEYS[1], 172800); return 1`,
      [`arrakis:solido:${owner}:${day}`, `arrakis:solido:operation:${owner}:${operationId}`],
      [operationId, JSON.stringify(value)],
    );
  },
  async acquireLease(key, expiresAt) {
    return Boolean(
      await client().set(`arrakis:lease:${key}`, '1', {
        nx: true,
        ex: Math.max(1, Math.ceil((expiresAt - Date.now()) / 1000)),
      }),
    );
  },
  async addPopulationSample(source, at, online, retentionSeconds) {
    const redis = client();
    const key = `arrakis:population:${source}`;
    await redis.zadd(key, { score: at, member: { at, online } });
    await redis.zremrangebyscore(key, 0, at - retentionSeconds * 1000);
    await redis.expire(key, retentionSeconds);
  },
  readPopulationSamples(source, since) {
    return client().zrange<unknown[]>(`arrakis:population:${source}`, since, Date.now(), { byScore: true });
  },
  getGuildLogo(guildId) {
    return client().get<string>(`arrakis:guild-logo:${guildId}`);
  },
  async setGuildLogo(guildId, value) {
    await client().set(`arrakis:guild-logo:${guildId}`, value);
  },
};
