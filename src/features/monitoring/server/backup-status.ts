import '../../../lib/assert-server';
import { getServerEnv } from '../../../config/env';
import { getDuneClient } from '../../../server/integrations/dune';
import { isSecureConsoleOrigin } from '../../../server/integrations/console-origin';
import { projectBackupStatus } from '../backup-status';

type Reading = NonNullable<ReturnType<typeof projectBackupStatus>> & { checkedAt: number };
let cache: { until: number; value: Promise<Reading> } | undefined;

export function readBackupStatus(): Promise<Reading> {
  const env = getServerEnv();
  if (!isSecureConsoleOrigin(env.DUNE_API_URL)) throw new Error('Secure Console transport required');
  const now = Date.now();
  if (cache && cache.until > now) return cache.value;
  const value = getDuneClient()
    .request('GET', '/api/backups/system/auto', { timeoutMs: 5000, retryRead: false })
    .then((raw) => {
      const result = projectBackupStatus(raw);
      if (!result) throw new Error('Invalid backup status');
      return { ...result, checkedAt: Date.now() };
    });
  const entry = { until: now + 30000, value };
  cache = entry;
  void value.catch(() => {
    if (cache === entry) cache = undefined;
  });
  return value;
}
