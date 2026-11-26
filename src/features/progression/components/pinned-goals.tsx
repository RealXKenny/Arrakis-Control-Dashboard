import Link from 'next/link';
import { Card } from '../../../components/ui/card';
import { StatusBadge } from '../../../components/ui/status-badge';
import { formatDecimal } from '../../../lib/format';
import type { PortalProfile } from '../../portal/view-model';
import { goalProgress, readingFromProfile } from '../reading';
import { readPlanner } from '../server/store';

/**
 * N011 portal pin: reuses the portal's own session-owned profile reading, so pinning adds no Console reads.
 * Renders nothing when no goal is pinned; a storage failure is stated rather than hidden as an empty board.
 */
export async function PinnedGoals({
  owner,
  profile,
  capturedAt,
}: {
  owner: string;
  profile: PortalProfile;
  capturedAt: string;
}) {
  const character = String(profile.legacyCharacter.playerId ?? '');
  if (!/^[1-9][0-9]{0,19}$/.test(character)) return null;
  const planner = await readPlanner(owner, character).catch(() => null);
  if (planner && !planner.goals.some((goal) => goal.pinned)) return null;
  const reading = readingFromProfile(profile, capturedAt);
  return (
    <Card as="section" className="panel mb-6 grid gap-4 p-6" aria-label="Pinned goals">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-base">Pinned goals</h2>
        <Link href="/progression?tab=goals" prefetch={false} className="text-sm text-spice-300 underline">
          Open progression
        </Link>
      </div>
      {!planner ? (
        <p className="text-sm text-sand-400">Pinned goals are unavailable right now.</p>
      ) : (
        <ul className="grid gap-px bg-sand-200/10 sm:grid-cols-2">
          {planner.goals
            .filter((goal) => goal.pinned)
            .map((goal) => {
              const progress = goalProgress(goal, reading);
              return (
                <li key={goal.id} className="grid gap-1 bg-obsidian-900 px-4 py-3">
                  <span className="flex items-center justify-between gap-3">
                    <strong className="truncate text-sm text-sand-50">{goal.title}</strong>
                    <StatusBadge
                      tone={progress.state === 'met' ? 'success' : progress.state === 'open' ? 'warning' : 'neutral'}
                    >
                      {progress.state === 'met' ? 'Reached' : progress.state === 'open' ? 'In progress' : 'Unknown'}
                    </StatusBadge>
                  </span>
                  <small className="text-xs text-sand-400">
                    {progress.target
                      ? `${progress.current === null ? 'unknown' : formatDecimal(progress.current)} / ${formatDecimal(progress.target)}`
                      : progress.detail}
                  </small>
                </li>
              );
            })}
        </ul>
      )}
    </Card>
  );
}
