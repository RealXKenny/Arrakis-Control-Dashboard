import type { ReactNode } from 'react';
import { isDashboardAdmin } from '../../modules/admin/server/access';
import { requireSession } from '../../server/session';
import { WorkspaceNav } from './_components/workspace-nav';

export default async function WorkspaceLayout({ children }: { children: ReactNode }) {
  // Early redirect only; each page re-checks, because layouts are skipped on partial navigation.
  const session = await requireSession();
  return (
    <>
      <WorkspaceNav showAdmin={isDashboardAdmin(session)} />
      <div className="mx-auto w-full max-w-shell px-4 py-10 sm:px-6 lg:py-14">{children}</div>
    </>
  );
}
