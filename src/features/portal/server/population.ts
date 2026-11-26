import '../../../lib/assert-server';
import { record } from '../../player/inventory';
import { createHash } from 'node:crypto';
import { getServerEnv } from '../../../config/env';
import { getRedisClient } from '../../../lib/redis/client';
import { getDuneClient } from '../../../server/integrations/dune';
import { logger } from '../../../lib/logger';
import { describeOperationalError } from '../../../lib/errors';
import { ACTIVITY_RETENTION_MS, summarizePopulation, type PopulationPoint } from '../population';

function historyKey() {
  const origin = getServerEnv().DUNE_API_URL ?? 'unconfigured';
  return `arrakis:population:${createHash('sha256').update(origin).digest('hex').slice(0, 16)}`;
}

export async function recordPopulation(now = Date.now()): Promise<void> {
  const redis = getRedisClient();
  if (!redis) return;
  const key = historyKey();
  // Dev note: one recorder gets the minute; the other workers can enjoy a tiny vacation.
  const lease = await redis.set(`${key}:sample:${Math.floor(now / 60000)}`, '1', { nx: true, ex: 120 });
  if (!lease) return;
  const response = await getDuneClient().request('GET', '/api/players/online?page=0&pageSize=1');
  const count = record(response).totalCount;
  if (count == null || count === '' || typeof count === 'boolean') return;
  const online = Number(count);
  if (!Number.isSafeInteger(online) || online < 0) return;
  const at = Date.now();
  await redis.zadd(key, { score: at, member: { at, online } });
  await redis.zremrangebyscore(key, 0, at - ACTIVITY_RETENTION_MS);
  await redis.expire(key, 8 * 86400);
}

export async function readPopulationHistory() {
  try {
    const redis = getRedisClient();
    if (!redis) return null;
    const now = Date.now();
    const values = await redis.zrange<unknown[]>(historyKey(), now - ACTIVITY_RETENTION_MS, now, {
      byScore: true,
      reverse: true,
      limit: 10081,
    });
    const activity = values.flatMap((value): PopulationPoint[] => {
      if (!value || typeof value !== 'object') return [];
      const point = value as PopulationPoint;
      return Number.isFinite(point.at) &&
        point.at >= now - ACTIVITY_RETENTION_MS &&
        point.at <= now &&
        Number.isSafeInteger(point.online) &&
        point.online >= 0
        ? [{ at: point.at, online: point.online }]
        : [];
    });
    return { ...summarizePopulation(activity, now), activity };
  } catch (error) {
    logger.warn('Population history unavailable', { reason: describeOperationalError(error) });
    return null;
  }
}

const globals = globalThis as typeof globalThis & { arrakisPopulationTimer?: ReturnType<typeof setInterval> };

export function startPopulationRecorder() {
  if (globals.arrakisPopulationTimer) return;
  // Dev note: the census continues even when every browser has gone to bed.
  let pending = false;
  const tick = async () => {
    if (pending) return;
    pending = true;
    try {
      await recordPopulation();
    } catch (error) {
      logger.warn('Population sample unavailable', { reason: describeOperationalError(error) });
    } finally {
      pending = false;
    }
  };
  globals.arrakisPopulationTimer = setInterval(tick, 60000);
  globals.arrakisPopulationTimer.unref();
  void tick();
}
