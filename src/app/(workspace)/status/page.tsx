import type { Metadata } from 'next';
import { requireSession } from '../../../features/auth/server/session';
import { PageHeader } from '../../../components/ui/page-header';
import { UptimeReport } from '../../../features/server-status/components/uptime-report';
import { RestartQueue } from '../../../features/monitoring/components/restart-queue';
import { RestartHistory } from '../../../features/monitoring/components/restart-history';
import { BackupConfidence } from '../../../features/monitoring/components/backup-confidence';
import { CapabilityReport } from '../../../features/monitoring/components/capability-report';

export const metadata: Metadata = { title: 'Service status' };

export default async function ServiceStatusPage() {
  const session = await requireSession();
  return (
    <>
      <PageHeader eyebrow="Service availability" title="Service status">
        <p className="max-w-md text-sm leading-relaxed text-sand-400">
          Hosting uptime and incident reports, provided by HetrixTools.
        </p>
      </PageHeader>
      <RestartQueue />
      <RestartHistory />
      <BackupConfidence session={session} />
      <CapabilityReport />
      <UptimeReport />
    </>
  );
}
