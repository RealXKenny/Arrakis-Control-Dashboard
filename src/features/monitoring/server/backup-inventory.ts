import '../../../lib/assert-server';
import { getServerEnv } from '../../../config/env';
import { getDuneClient } from '../../../server/integrations/dune';
import { isSecureConsoleOrigin } from '../../../server/integrations/console-origin';
import { projectDatabaseBackups, projectSystemBackups, type BackupInventoryItem } from '../backup-evidence';

type Reading = { database: BackupInventoryItem[] | null; system: BackupInventoryItem[] | null; checkedAt: number };
let cache: { until: number; value: Promise<Reading> } | undefined;

export function readBackupInventory(): Promise<Reading> {
  const env = getServerEnv();
  if (!isSecureConsoleOrigin(env.DUNE_API_URL)) throw new Error('Secure Console transport required');
  const now = Date.now();
  if (cache && cache.until > now) return cache.value;
  const value = Promise.all(
    [
      ['/api/backups', projectDatabaseBackups],
      ['/api/backups/system', projectSystemBackups],
    ].map(async ([path, project]) => {
      try {
        const response = await getDuneClient().request('GET', path as string, { timeoutMs: 5000, retryRead: false });
        return (project as (value: unknown) => BackupInventoryItem[] | null)(response);
      } catch {
        return null;
      }
    }),
  ).then(([database, system]) => ({ database, system, checkedAt: Date.now() }));
  const entry = { until: now + 30000, value };
  cache = entry;
  void value.catch(() => {
    if (cache === entry) cache = undefined;
  });
  return value;
}
