import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { PageHeader } from '../../../../components/ui/page-header';
import { isDashboardAdmin } from '../../../../features/admin/server/access';
import { requireSession } from '../../../../features/auth/server/session';
import { ReconciliationPanel } from '../../../../features/casino/components/reconciliation-panel';
import { adminTransfersAwaitingReconciliation } from '../../../../features/casino/server/service';

export const metadata: Metadata = { title: 'Casino transfer reconciliation' };

export default async function CasinoAdminPage() {
  const session = await requireSession();
  // Authority comes from the OAuth-verified session only; everyone else sees a plain 404.
  if (!isDashboardAdmin(session)) notFound();
  const transfers = await adminTransfersAwaitingReconciliation();

  return (
    <>
      <PageHeader eyebrow="The Solaris Exchange · Administration" title="Transfers to reconcile">
        <p className="max-w-md text-sm leading-relaxed text-sand-400">
          Transfers whose outcome the system could not confirm. Check the real game balance, then record what happened.
        </p>
      </PageHeader>
      <ReconciliationPanel initial={transfers} />
    </>
  );
}
