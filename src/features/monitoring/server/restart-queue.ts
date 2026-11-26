import '../../../lib/assert-server';
import { getDuneClient } from '../../../server/integrations/dune';
import { projectRestartQueue, type RestartEntry } from '../restart-queue';

type Reading = { entries: RestartEntry[]; observedAt: number };
let cached: { until: number; value: Promise<Reading> } | undefined;

/** Coalesce member reads; failures are not retained as a successful empty queue. */
export function readRestartQueue(): Promise<Reading> {
  const now = Date.now();
  if (cached && cached.until > now) return cached.value;
  const value = getDuneClient()
    .request('GET', '/api/server/restart-queue', { timeoutMs: 5000, retryRead: false })
    .then((response) => {
      const entries = projectRestartQueue(response);
      if (!entries) throw new Error('Invalid restart queue response');
      return { entries, observedAt: Date.now() };
    });
  const entry = { until: now + 15000, value };
  cached = entry;
  void value.catch(() => {
    if (cached === entry) cached = undefined;
  });
  return value;
}
