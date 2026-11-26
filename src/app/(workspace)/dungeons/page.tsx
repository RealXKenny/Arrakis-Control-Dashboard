import type { Metadata } from 'next';
import { PageHeader } from '../../../components/ui/page-header';
import { SegmentedNav } from '../../../components/ui/segmented-nav';
import { requireSession } from '../../../features/auth/server/session';
import { DungeonLeaderboard, type DungeonTab } from '../../../features/dungeons/components/dungeon-leaderboard';
import { loadInitialBoard } from '../../../features/dungeons/server/initial';

export const metadata: Metadata = { title: 'Dungeon leaderboard' };

const TABS: ReadonlyArray<{ id: DungeonTab; label: string }> = [
  { id: 'records', label: 'Records' },
  { id: 'runs', label: 'Recent runs' },
  { id: 'mine', label: 'My records' },
];

export default async function DungeonsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireSession();
  const requested = (await searchParams).tab;
  const tab = TABS.find((entry) => entry.id === requested)?.id ?? 'records';
  // Served from the shared cache: opening the page never sends its own Console request while a reading is fresh.
  const initialBoard = await loadInitialBoard();
  return (
    <>
      <PageHeader eyebrow="Community records" title="Dungeon leaderboard">
        <p className="max-w-md text-sm text-sand-400">
          Fastest completions for every dungeon and difficulty on this server, refreshed automatically.
        </p>
      </PageHeader>
      <SegmentedNav
        label="Dungeon leaderboard views"
        active={tab}
        items={TABS.map((entry) => ({ id: entry.id, label: entry.label, href: `/dungeons?tab=${entry.id}` }))}
      />
      <DungeonLeaderboard key={tab} tab={tab} initialBoard={initialBoard} />
    </>
  );
}
