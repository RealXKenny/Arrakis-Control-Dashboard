import type { ReactNode } from 'react';
import { requireSession } from '../../features/auth/server/session';

export default async function WorkspaceLayout({ children }: { children: ReactNode }) {
  // Early redirect only; each page re-checks, because layouts are skipped on partial navigation.
  await requireSession();
  return <div className="mx-auto w-full max-w-shell px-4 py-10 sm:px-6 lg:py-14">{children}</div>;
}
