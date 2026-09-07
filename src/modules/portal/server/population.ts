import { createHash } from 'node:crypto';
import { getServerEnv } from '../../../config/env';
import { getRedisClient } from '../../../lib/redis';
import { getDuneClient } from '../../../infrastructure/dune';
import { logger } from '../../../lib/logger';
import { DAY_MS, summarizePopulation } from '../utils/population';

function historyKey() {
  const origin = getServerEnv().CONSOLE_URL ?? 'unconfigured';
  return `arrakis:population:${createHash('sha256').update(origin).digest('hex').slice(0, 16)}`;
}

export async function recordPopulation(now = Date.now()): Promise<void> {
  const redis = getRedisClient();
  if (!redis) return;
  const key = historyKey();
  // A per-minute lease prevents duplicate provider calls across Next workers/replicas.
  const lease = await redis.set(`${key}:sample:${Math.floor(now / 60000)}`, '1', { nx: true, ex: 120 });
  if (!lease) return;
  const response = await getDuneClient().request('GET', '/api/players/online?page=0&pageSize=1');
  const count = response?.totalCount;
  if (count == null || count === '' || typeof count === 'boolean') return;
  const online = Number(count);
  if (!Number.isSafeInteger(online) || online < 0) return;
  const at = Date.now();
  await redis.zadd(key, { score: at, member: { at, online } });
  await redis.zremrangebyscore(key, 0, at - DAY_MS);
  await redis.expire(key, 172800);
}

export async function readPopulationHistory() {
  if (getServerEnv().POPULATION_HISTORY_ENABLED === 'false') return null;
  try {
    const redis = getRedisClient();
    if (!redis) return null;
    const now = Date.now();
    const values = await redis.zrange<unknown[]>(historyKey(), now - DAY_MS, now, { byScore: true });
    return summarizePopulation(values, now);
  } catch {
    logger.warn('Population history unavailable');
    return null;
  }
}

const globals = globalThis as typeof globalThis & { arrakisPopulationTimer?: ReturnType<typeof setInterval> };

/** Persistent Node hosting: collect even when there are no browser requests. */
export function startPopulationRecorder() {
  if (getServerEnv().POPULATION_HISTORY_ENABLED === 'false' || globals.arrakisPopulationTimer) return;
  let pending = false;
  const tick = async () => {
    if (pending) return;
    pending = true;
    try {
      await recordPopulation();
    } catch {
      logger.warn('Population sample unavailable');
    } finally {
      pending = false;
    }
  };
  globals.arrakisPopulationTimer = setInterval(tick, 60000);
  globals.arrakisPopulationTimer.unref();
  void tick();
}
