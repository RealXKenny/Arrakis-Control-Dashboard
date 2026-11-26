import '../../../lib/assert-server';
import { getDuneClient } from '../../../server/integrations/dune';
import { ReadCache } from '../../../lib/cache/read-cache';
import { spendReadBudget } from '../../../server/read-budget';
import { normalizeCoriolisCycleAt } from '../../map/utils/coriolis';
import type { DeepDesertStatus } from '../departure';

/** Shared world state, not member data, so one short-lived cache entry serves everyone. */
const cache = new ReadCache<DeepDesertStatus>(
  () => 256,
  () => true,
  { ttlMs: 60_000, maxEntries: 1 },
);

function readStatus(value: unknown, checkedAt: string): DeepDesertStatus {
  const source = value !== null && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  const coriolis =
    source.coriolis && typeof source.coriolis === 'object' ? (source.coriolis as Record<string, unknown>) : {};
  const layout = Number(source.coriolisLayout);
  const stale = normalizeCoriolisCycleAt(source.coriolisSeedStaleSince);
  return {
    available: true,
    nextCycleAt: normalizeCoriolisCycleAt(
      source.coriolisNextCycleAt ?? source.nextCoriolisCycleAt ?? coriolis.nextCycleAt,
    ),
    layout: Number.isInteger(layout) && layout >= 0 && layout <= 11 ? layout : null,
    staleSince: stale,
    checkedAt,
  };
}

/** Reads only the Coriolis cycle fields from the lightweight (no static rows) Deep Desert marker response. */
export async function readDeepDesertStatus(): Promise<DeepDesertStatus> {
  const checkedAt = new Date().toISOString();
  try {
    const entry = await cache.get('deep-desert', async () => {
      const budget = await spendReadBudget();
      if (!budget.allowed) throw new Error('Read budget exhausted');
      const response: unknown = await getDuneClient().request('GET', '/api/map/markers?map=DeepDesert&static=0', {
        timeoutMs: 6000,
        retryRead: false,
      });
      return readStatus(response, new Date().toISOString());
    });
    return entry.data;
  } catch {
    return { available: false, nextCycleAt: null, layout: null, staleSince: null, checkedAt };
  }
}
