import '../../../lib/assert-server';
import { createHash } from 'node:crypto';
import { getServerEnv } from '../../../config/env';
import { getRedisClient } from '../../../lib/redis/client';
import { getDuneClient } from '../../../server/integrations/dune';
import {
  buildObservationTimeline,
  healthObservationSchema,
  projectServerStatus,
  type HealthObservation,
  type IncidentTimelineData,
} from '../incidents';
import { readRestartHistory } from './restart-history';

const RETENTION_MS = 7 * 86_400_000;
const MAX_OBSERVATIONS = 10_081;

function historyKey() {
  const origin = getServerEnv().DUNE_API_URL ?? 'unconfigured';
  return `arrakis:monitoring:health:${createHash('sha256').update(origin).digest('hex').slice(0, 16)}`;
}

export async function recordHealthObservation(value: HealthObservation, now = Date.now()): Promise<void> {
  const observation = healthObservationSchema.parse(value);
  const redis = getRedisClient();
  if (!redis) throw new Error('Health observation storage is unavailable');
  const key = historyKey();
  await redis.zadd(key, { score: observation.at, member: observation });
  await redis.zremrangebyscore(key, 0, now - RETENTION_MS);
  await redis.command(['ZREMRANGEBYRANK', key, 0, -MAX_OBSERVATIONS - 1]);
  await redis.expire(key, 8 * 86_400);
}

export async function readHealthObservations(now = Date.now()): Promise<HealthObservation[]> {
  const redis = getRedisClient();
  if (!redis) throw new Error('Health observation storage is unavailable');
  const values = await redis.zrange<unknown[]>(historyKey(), now - RETENTION_MS, now + 300_000, {
    byScore: true,
    reverse: true,
    limit: MAX_OBSERVATIONS,
  });
  return values.flatMap((value) => {
    const parsed = healthObservationSchema.safeParse(value);
    return parsed.success && parsed.data.at >= now - RETENTION_MS && parsed.data.at <= now + 300_000
      ? [parsed.data]
      : [];
  });
}

/** One leased worker tick records even an unavailable reading; only persistence failure fails the worker. */
export async function observeServerHealth(now = Date.now()): Promise<{ observations: number; state: string }> {
  let observation: HealthObservation = { at: now, state: 'unavailable', services: [] };
  try {
    // The Console answers from its own cached snapshot; ten seconds covers a cold host check without letting one
    // slow probe stall the worker (which has a fifteen-second budget). A timeout is recorded as "unavailable",
    // never as the game server being offline.
    const response = await getDuneClient().request('GET', '/api/server/status?raw=0', {
      timeoutMs: Math.min(getServerEnv().DUNE_API_TIMEOUT_MS ?? 10_000, 10_000),
      retryRead: false,
    });
    observation = projectServerStatus(response, now) ?? observation;
  } catch {
    // An unavailable observation is evidence about this probe, never proof of a game-server outage.
  }
  await recordHealthObservation(observation, now);
  return { observations: 1, state: observation.state };
}

export async function readIncidentTimeline(now = Date.now()): Promise<IncidentTimelineData> {
  const [health, restarts] = await Promise.allSettled([readHealthObservations(now), readRestartHistory()]);
  const observations = health.status === 'fulfilled' ? buildObservationTimeline(health.value, now) : [];
  const restartEntries =
    restarts.status === 'fulfilled'
      ? restarts.value.map((row) => ({
          kind: 'restart' as const,
          id: row.id,
          result: row.result,
          target: row.scope === 'battlegroup' ? 'All servers' : row.map || row.scope,
          startedAt: row.startedAt,
          finishedAt: row.finishedAt,
          durationSeconds: row.durationSeconds,
        }))
      : [];
  return {
    entries: [...observations, ...restartEntries]
      .sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt))
      .slice(0, 200),
    healthAvailable: health.status === 'fulfilled',
    restartsAvailable: restarts.status === 'fulfilled',
    checkedAt: new Date(now).toISOString(),
  };
}
