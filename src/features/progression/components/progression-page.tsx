import type { Metadata } from 'next';
import { PageHeader, Notice } from '../../../components/ui/page-header';
import { SegmentedNav } from '../../../components/ui/segmented-nav';
import { requireSession } from '../../auth/server/session';
import { loadPortalProfile } from '../../portal/server/load';
import { ProfileFailure } from '../../portal/components/profile-failure';
import { loadCalendar } from '../../calendar/server/load';
import { readPersonalTasks } from '../../tasks/server/store';
import { readingFromProfile } from '../reading';
import { readJournal, readPlanner } from '../server/store';
import { ProgressionPlanner, type Commitments } from './planner';
import { progressionTabs, type ProgressionTab } from './tabs';

export const metadata: Metadata = { title: 'Progression' };

const WEEK = 7 * 86400_000;

/** Upcoming commitments come from existing permission-checked sources; failures stay explicit, never empty. */
async function commitments(session: Awaited<ReturnType<typeof requireSession>>): Promise<Commitments> {
  const now = Date.now();
  const [calendar, tasks] = await Promise.allSettled([loadCalendar(session), readPersonalTasks(session.user.id)]);
  return {
    calendar:
      calendar.status === 'fulfilled'
        ? {
            items: calendar.value.items
              .filter((item) => item.state !== 'cancelled')
              .filter((item) => {
                const start = Date.parse(item.startsAt);
                const end = item.endsAt ? Date.parse(item.endsAt) : start;
                return end >= now && start <= now + WEEK;
              })
              .slice(0, 8)
              .map(({ id, category, title, startsAt, href }) => ({ id, category, title, startsAt, href })),
            partial:
              !calendar.value.eventsAvailable ||
              calendar.value.operationsState === 'unavailable' ||
              !calendar.value.maintenanceAvailable,
          }
        : null,
    tasks:
      tasks.status === 'fulfilled'
        ? {
            open: tasks.value.tasks.filter((task) => task.status === 'open').length,
            dueSoon: tasks.value.tasks.filter(
              (task) => task.status === 'open' && task.dueDate && Date.parse(task.dueDate) <= now + WEEK,
            ).length,
          }
        : null,
  };
}

export default async function ProgressionPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await requireSession();
  const query = await searchParams;
  const tab: ProgressionTab = progressionTabs.some((entry) => entry.id === query.tab)
    ? (query.tab as ProgressionTab)
    : 'briefing';
  const header = (
    <PageHeader
      eyebrow="Your character"
      title="Progression"
      description="Private goals, plans and notes for your linked character. Game readings are read-only observations; nothing here changes the game."
    />
  );
  const result = await loadPortalProfile(session);
  if (result.status !== 'ok')
    return (
      <>
        {header}
        <ProfileFailure result={result} />
      </>
    );
  const character = String(result.profile.legacyCharacter.playerId ?? '');
  if (!/^[1-9][0-9]{0,19}$/.test(character))
    return (
      <>
        {header}
        <Notice title="Link your character">
          A verified linked character is required for the progression planner.
        </Notice>
      </>
    );
  const [stored, journal, upcoming] = await Promise.all([
    readPlanner(session.user.id, character).catch(() => null),
    readJournal(session.user.id, character).catch(() => null),
    tab === 'briefing' ? commitments(session) : Promise.resolve(null),
  ]);
  const reading = readingFromProfile(result.profile, result.capturedAt ?? new Date().toISOString());
  return (
    <>
      {header}
      <SegmentedNav
        label="Progression sections"
        active={tab}
        items={progressionTabs.map((entry) => ({
          id: entry.id,
          label: entry.label,
          href: `/progression?tab=${entry.id}`,
        }))}
      />
      {!stored || !journal ? (
        <Notice tone="warn" title="Planner unavailable">
          Your saved progression planner could not be read. Nothing was changed. Reload to try again.
        </Notice>
      ) : (
        <ProgressionPlanner
          key={`${session.user.id}:${character}:${tab}`}
          tab={tab}
          character={character}
          initialRecord={stored}
          initialJournal={journal}
          reading={reading}
          commitments={upcoming}
        />
      )}
    </>
  );
}
