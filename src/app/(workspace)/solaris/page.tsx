import type { Metadata } from 'next';
import { PageHeader } from '../../../components/ui/page-header';
import { requireSession } from '../../../features/auth/server/session';
import { SolarisLeaderboard } from '../../../features/solaris/components/solaris-leaderboard';
import { loadInitialBoard } from '../../../features/solaris/server/initial';

export const metadata: Metadata = { title: 'Solaris leaderboard' };

export default async function SolarisPage() {
  await requireSession();
  // Served from the shared cache only: opening the page never starts its own crawl of the Console.
  const initialBoard = await loadInitialBoard();
  return (
    <>
      <PageHeader eyebrow="Community records" title="Solaris leaderboard">
        <p className="max-w-md text-sm text-sand-400">
          The wealthiest characters on this server by Solaris on hand, refreshed automatically.
        </p>
      </PageHeader>
      <SolarisLeaderboard initialBoard={initialBoard} />
    </>
  );
}
