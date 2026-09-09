import '../../../lib/assert-server';
import { record } from '../utils/inventory';
import { createHash } from 'node:crypto';
import { getServerEnv } from '../../../config/env';
import { getStateStore } from '../../../infrastructure/storage';
import { getDuneClient } from '../../../infrastructure/dune';
import { logger } from '../../../lib/logger';
import { DAY_MS, summarizePopulation } from '../utils/population';

function historyKey() {
  const origin = getServerEnv().CONSOLE_URL ?? 'unconfigured';
  return createHash('sha256').update(origin).digest('hex').slice(0, 16);
}

export async function recordPopulation(now = Date.now()): Promise<void> {
  if (getServerEnv().SITE_FEATURE_POPULATION === 'false') return;
  const store = getStateStore();
  if (!store) return;
  const key = historyKey();
  // A per-minute lease prevents duplicate provider calls across Next workers/replicas.
  const lease = await store.acquireLease(`${key}:sample:${Math.floor(now / 60000)}`, now + 120000);
  if (!lease) return;
  const response = await getDuneClient().request('GET', '/api/players/online?page=0&pageSize=1');
  const count = record(response).totalCount;
  if (count == null || count === '' || typeof count === 'boolean') return;
  const online = Number(count);
  if (!Number.isSafeInteger(online) || online < 0) return;
  const at = Date.now();
  await store.addPopulationSample(key, at, online, getServerEnv().POPULATION_RETENTION_SECONDS);
}

export async function readPopulationHistory() {
  if (getServerEnv().POPULATION_HISTORY_ENABLED === 'false' || getServerEnv().SITE_FEATURE_POPULATION === 'false')
    return null;
  try {
    const store = getStateStore();
    if (!store) return null;
    const now = Date.now();
    const values = await store.readPopulationSamples(historyKey(), now - DAY_MS);
    return summarizePopulation(values, now);
  } catch {
    logger.warn('Population history unavailable');
    return null;
  }
}

const globals = globalThis as typeof globalThis & { arrakisPopulationTimer?: ReturnType<typeof setInterval> };

/** Persistent Node hosting: collect even when there are no browser requests. */
export function startPopulationRecorder() {
  if (
    getServerEnv().POPULATION_HISTORY_ENABLED === 'false' ||
    getServerEnv().SITE_FEATURE_POPULATION === 'false' ||
    globals.arrakisPopulationTimer
  )
    return;
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
  globals.arrakisPopulationTimer = setInterval(tick, getServerEnv().SITE_POLL_INTERVAL_MS);
  globals.arrakisPopulationTimer.unref();
  void tick();
}
