import '../../../lib/assert-server';
import { record } from '../../player/inventory';
import { createHash } from 'node:crypto';
import { getServerEnv } from '../../../config/env';
import { getRedisClient } from '../../../lib/redis/client';
import { getDuneClient } from '../../../server/integrations/dune';
import { logger } from '../../../lib/logger';
import { describeOperationalError } from '../../../lib/errors';
import { ACTIVITY_RETENTION_MS, summarizePopulation, type PopulationPoint } from '../population';
import { CacheUnavailableError, readShared, type CachePolicy } from '../../../lib/cache/shared-cache';

/** Online count, shared by the population recorder and the public server telemetry route. */
const onlineCountPolicy: CachePolicy<number> = {
  name: 'online-count',
  version: 1,
  freshMs: 55_000,
  retainMs: 86_400_000,
  validate: (raw) => {
    if (typeof raw === 'number') return Number.isSafeInteger(raw) && raw >= 0 ? raw : undefined;
    const count = record(raw).totalCount;
    if (count == null || count === '' || typeof count === 'boolean') return undefined;
    const online = Number(count);
    return Number.isSafeInteger(online) && online >= 0 ? online : undefined;
  },
};

export function readOnlineCount(options: { force?: boolean } = {}) {
  return readShared(
    onlineCountPolicy,
    [getServerEnv().DUNE_API_URL ?? 'unconfigured'],
    () => getDuneClient().request('GET', '/api/players/online?page=0&pageSize=1'),
    options,
  );
}

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
  let reading;
  try {
    reading = await readOnlineCount();
  } catch (error) {
    // A malformed count is skipped, never recorded as zero; upstream failures still surface to the caller.
    if (error instanceof CacheUnavailableError && error.reason === 'invalid') return;
    throw error;
  }
  // Reuse a count another request fetched moments ago; otherwise take one new reading for this minute.
  if (Date.now() - reading.fetchedAt > 30_000) reading = await readOnlineCount({ force: true });
  // A sample is a fact about one minute. A failed refresh never re-records an older count as new.
  if (Date.now() - reading.fetchedAt > 90_000) return;
  const online = reading.data;
  const at = reading.fetchedAt;
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
      // The Console being unreachable is reported once by the provider health tracker; a missed sample is DEBUG.
      logger.debug('Population sample unavailable', { reason: describeOperationalError(error) });
    } finally {
      pending = false;
    }
  };
  globals.arrakisPopulationTimer = setInterval(() => void tick(), 60000);
  globals.arrakisPopulationTimer.unref();
  void tick();
}
