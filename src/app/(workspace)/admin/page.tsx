import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { findAdminTab } from '../../../features/admin/navigation';
import type { AdminOperation } from '../../../features/admin/types';
import { isDashboardAdmin } from '../../../features/admin/server/access';
import { adminCatalog } from '../../../features/admin/server/catalog';
import { loadAdminOverview } from '../../../features/admin/server/overview';
import { requireSession } from '../../../features/auth/server/session';
import { PageHeader } from '../../../components/ui/page-header';
import ConsoleOnly from '../../../features/admin/components/console-only';
import ApiReference from '../../../features/admin/components/api-reference';
import AdminWorkspace from '../../../features/admin/components/admin-workspace';
import { OverviewView } from '../../../features/admin/components/overview-view';

export const metadata: Metadata = { title: 'Administration' };
export const dynamic = 'force-dynamic';

export default async function AdminPage({ searchParams }: { searchParams: Promise<{ tab?: string | string[] }> }) {
  const session = await requireSession();
  // Authority is the verified server session only; a client flag or query string never grants it.
  if (!isDashboardAdmin(session)) notFound();
  const { tab } = await searchParams;
  const { tab: current } = findAdminTab(typeof tab === 'string' ? tab : undefined);
  const catalog = adminCatalog();
  const operations = catalog.operations as AdminOperation[];

  let body;
  if (current.kind === 'overview' || current.kind === 'setup') {
    // Read path as a Server Component: the shared loader runs here, never in the browser.
    let data = null;
    let error = '';
    try {
      data = await loadAdminOverview(session);
    } catch {
      error = 'Unable to load administration statistics. Check the Console connection and try again.';
    }
    body = <OverviewView data={data} error={error} operations={operations} setupOnly={current.kind === 'setup'} />;
  } else if (current.kind === 'reference') {
    body = <ApiReference operations={operations} />;
  } else {
    body = (
      <>
        {current.kind === 'console' && <ConsoleOnly operations={operations} consoleOrigin={catalog.consoleOrigin} />}
        <Suspense fallback={<p role="status">Loading administration…</p>}>
          <AdminWorkspace
            catalog={{
              operations,
              configured: catalog.configured,
              adapterConfigured: catalog.adapterConfigured,
              consoleOrigin: catalog.consoleOrigin,
            }}
          />
        </Suspense>
      </>
    );
  }

  return (
    <>
      <PageHeader eyebrow="Administration" title={current.label}>
        <p className="max-w-prose text-sm text-sand-400">{current.summary}</p>
      </PageHeader>
      {body}
    </>
  );
}
