import { Suspense, type ReactNode } from 'react';
import { notFound } from 'next/navigation';
import { isDashboardAdmin } from '../../../modules/admin/server/access';
import { requireSession } from '../../../server/session';
import { AdminNav } from './_components/admin-nav';

/**
 * Shared administrator frame for `/admin` and `/admin/changelog`. This is an early gate only:
 * layouts are skipped on partial navigation, so every admin page and API route re-verifies.
 */
export default async function AdminLayout({ children }: { children: ReactNode }) {
  const session = await requireSession();
  // Hide the area's existence from everyone but the verified administrator.
  if (!isDashboardAdmin(session)) notFound();
  return (
    <>
      <Suspense fallback={null}>
        <AdminNav />
      </Suspense>
      {children}
    </>
  );
}
