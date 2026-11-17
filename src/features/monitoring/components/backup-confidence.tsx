import { Card } from '../../../components/ui/card';
import { LocalTime } from '../../../components/ui/local-time';
import type { DashboardSession } from '../../auth/server/session-store';
import { canViewBackupEvidence } from '../server/backup-authorization';
import { readBackupStatus } from '../server/backup-status';
import { readBackupInventory } from '../server/backup-inventory';
import type { BackupInventoryItem } from '../backup-evidence';

function Inventory({ title, items }: { title: string; items: BackupInventoryItem[] | null }) {
  return (
    <section aria-label={title} className="mt-4">
      <h3 className="text-base">{title}</h3>
      {items === null ? (
        <p className="mt-2 text-sm">Inventory is unavailable.</p>
      ) : items.length === 0 ? (
        <p className="mt-2 text-sm">No archives were reported.</p>
      ) : (
        <ul className="mt-2 space-y-1 text-sm">
          {items.map((item, index) => (
            <li key={`${item.kind}:${index}`}>
              {item.createdAt ? (
                <LocalTime value={item.createdAt} />
              ) : (
                (item.reportedCreated ?? 'Creation time unavailable')
              )}
              {item.automatic === null ? '' : item.automatic ? ' · automatic' : ' · not marked automatic'}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export async function BackupConfidence({ session }: { session: DashboardSession }) {
  if (!(await canViewBackupEvidence(session))) return null;
  const [data, inventory] = await Promise.all([
    readBackupStatus().catch(() => null),
    readBackupInventory().catch(() => ({ database: null, system: null, checkedAt: null })),
  ]);
  const ageHours = data?.lastRunAt ? (data.checkedAt - Date.parse(data.lastRunAt)) / 3600000 : null;
  const stale = ageHours !== null && ageHours >= 0 && data?.intervalHours && ageHours > data.intervalHours * 2;
  return (
    <Card as="section" className="panel mb-6 p-6" aria-labelledby="backup-confidence-heading">
      <h2 id="backup-confidence-heading" className="text-lg">
        Backup confidence
      </h2>
      {!data ? (
        <p className="mt-3 text-sm">Scheduled system backup status is unavailable.</p>
      ) : (
        <div className="mt-3 space-y-2 text-sm">
          <p>
            Schedule: {data.enabled ? 'enabled' : 'disabled'}
            {data.intervalHours ? `, every ${data.intervalHours} hours` : ''}.
          </p>
          <p>
            Last recorded run: {data.lastRunAt ? <LocalTime value={data.lastRunAt} /> : 'time unavailable'}
            {ageHours !== null && ageHours >= 0 ? ` (${Math.floor(ageHours)} hours ago)` : ''}
            {ageHours !== null && ageHours < 0 ? ' — timestamp is in the future' : ''}
            {stale ? ' — stale' : ''}.
          </p>
          <p>Last result: {data.lastResult ?? 'unavailable'}.</p>
          <p>Next scheduled run: {data.nextRun ? <LocalTime value={data.nextRun} /> : 'unavailable'}.</p>
          <p>
            Last checked: <LocalTime value={data.checkedAt} />.
          </p>
        </div>
      )}
      <Inventory title="Database backup inventory" items={inventory.database} />
      <Inventory title="Encrypted system backup inventory" items={inventory.system} />
      <p className="mt-4 text-sm text-sand-400">
        Archive presence does not prove a successful run or recoverability. Per-archive success/failure and
        restore-rehearsal evidence are unavailable from these sources; only the latest scheduled result above is
        reported directly.
      </p>
    </Card>
  );
}
