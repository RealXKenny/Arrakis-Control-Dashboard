import { Card } from '../../../components/ui/card';
import { LocalTime } from '../../../components/ui/local-time';
import type { DashboardSession } from '../../auth/server/session-store';
import { canViewBackupEvidence } from '../server/backup-authorization';
import { readBackupStatus } from '../server/backup-status';

export async function BackupConfidence({ session }: { session: DashboardSession }) {
  if (!(await canViewBackupEvidence(session))) return null;
  let data: Awaited<ReturnType<typeof readBackupStatus>> | null;
  try {
    data = await readBackupStatus();
  } catch {
    data = null;
  }
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
      <p className="mt-3 text-sm text-sand-400">
        A successful backup does not prove recoverability. Restore-rehearsal evidence is unavailable.
      </p>
    </Card>
  );
}
