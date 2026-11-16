import '../../../lib/assert-server';
import { getDuneClient } from '../../../server/integrations/dune';
import { projectRestartHistory, type RestartHistoryRow } from '../restart-history';

let cache: { until: number; value: Promise<RestartHistoryRow[]> } | undefined;

export function readRestartHistory(): Promise<RestartHistoryRow[]> {
  const now = Date.now();
  if (cache && cache.until > now) return cache.value;
  const value = getDuneClient()
    .request('GET', '/api/server/restart-history', { timeoutMs: 5000, retryRead: false })
    .then((response) => {
      const rows = projectRestartHistory(response);
      if (!rows) throw new Error('Invalid restart history response');
      return rows;
    });
  const entry = { until: now + 30000, value };
  cache = entry;
  void value.catch(() => {
    if (cache === entry) cache = undefined;
  });
  return value;
}
