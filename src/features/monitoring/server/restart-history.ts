import '../../../lib/assert-server';
import { getDuneClient } from '../../../server/integrations/dune';
import { readShared, type CachePolicy } from '../../../lib/cache/shared-cache';
import { projectRestartHistory, type RestartHistoryRow } from '../restart-history';

// Restart history changes only when a restart happens: two minutes fresh, a day as last known good.
const policy: CachePolicy<RestartHistoryRow[]> = {
  name: 'restart-history',
  version: 1,
  freshMs: 120_000,
  retainMs: 86_400_000,
  validate: (raw) => projectRestartHistory(Array.isArray(raw) ? { rows: raw } : raw) ?? undefined,
};

export async function readRestartHistory(): Promise<RestartHistoryRow[]> {
  const reading = await readShared(policy, ['all'], () =>
    getDuneClient().request('GET', '/api/server/restart-history', { timeoutMs: 5000, retryRead: false }),
  );
  return reading.data;
}
