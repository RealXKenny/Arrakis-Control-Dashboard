import type { Metadata } from 'next';
import { requireSession } from '../../../features/auth/server/session';
import { PageHeader } from '../../../components/ui/page-header';
import { UptimeReport } from '../../../features/server-status/components/uptime-report';

export const metadata: Metadata = { title: 'Service status' };

export default async function ServiceStatusPage() {
  await requireSession();
  return (
    <>
      <PageHeader eyebrow="Service availability" title="Service status">
        <p className="max-w-md text-sm leading-relaxed text-sand-400">
          Hosting uptime and incident reports, provided by HetrixTools.
        </p>
      </PageHeader>
      <UptimeReport />
    </>
  );
}
