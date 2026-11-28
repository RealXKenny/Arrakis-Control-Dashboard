import type { Metadata } from 'next';
import { PageHeader } from '../../../components/ui/page-header';
import { SegmentedNav } from '../../../components/ui/segmented-nav';
import { requireSession } from '../../../features/auth/server/session';
import { SolarisLeaderboard, type SolarisTab } from '../../../features/solaris/components/solaris-leaderboard';
import { loadInitialBoard } from '../../../features/solaris/server/initial';

export const metadata: Metadata = { title: 'Solaris leaderboard' };

const TABS: ReadonlyArray<{ id: SolarisTab; label: string }> = [
  { id: 'richest', label: 'Wealthiest' },
  { id: 'weekly', label: 'This week' },
];

export default async function SolarisPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireSession();
  const requested = (await searchParams).tab;
  const tab = TABS.find((entry) => entry.id === requested)?.id ?? 'richest';
  // Served from the shared cache only: opening the page never waits for a crawl of the Console.
  const initialBoard = await loadInitialBoard();
  return (
    <>
      <PageHeader eyebrow="Community records" title="Solaris leaderboard">
        <p className="max-w-md text-sm text-sand-400">
          The wealthiest characters on this server, banked Solari Credit plus coins carried, and a weekly race with
          prizes for whoever earns the most.
        </p>
      </PageHeader>
      <SegmentedNav
        label="Solaris leaderboard views"
        active={tab}
        items={TABS.map((entry) => ({ id: entry.id, label: entry.label, href: `/solaris?tab=${entry.id}` }))}
      />
      <SolarisLeaderboard key={tab} tab={tab} initialBoard={initialBoard} />
    </>
  );
}
