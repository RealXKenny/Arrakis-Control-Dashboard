import type { Metadata } from 'next';
import { PageHeader, Notice } from '../../../components/ui/page-header';
import { requireSession } from '../../../features/auth/server/session';
import { ReportIntake } from '../../../features/moderation/components/report-intake';
import { isModerator } from '../../../features/moderation/server/authorization';
import { readReporterCases } from '../../../features/moderation/server/cases-store';
import { reporterCaseView } from '../../../features/moderation/model';

export const metadata: Metadata = { title: 'My reports' };

export default async function ReportsPage() {
  const session = await requireSession();
  const [reports, canModerate] = await Promise.all([
    readReporterCases(session.user.id).catch(() => null),
    isModerator(session),
  ]);
  return (
    <>
      <PageHeader eyebrow="Community safety" title="My reports">
        <p className="max-w-md text-sm text-sand-400">
          Submit evidence for moderator review and follow your own case status.
        </p>
      </PageHeader>
      {reports ? (
        <ReportIntake initial={reports.map(reporterCaseView)} canModerate={canModerate} />
      ) : (
        <Notice title="Reports are temporarily unavailable" tone="warn">
          Your report history could not be loaded. Refresh before submitting another report.
        </Notice>
      )}
    </>
  );
}
