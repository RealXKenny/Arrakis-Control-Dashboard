import type { Metadata } from 'next';
import Link from 'next/link';
import { PageHeader } from '../../../components/ui/page-header';
import { requireSession } from '../../auth/server/session';
import { loadPortalProfile, loadWorld } from '../server/load';
import { readPortalLayout } from '../server/layout-store';
import { recommendedPortalLayout } from '../layout';
import { ProfileFailure } from './profile-failure';
import { PortalWidgets } from './portal-widgets';
import { portalPanels } from './portal-panels';
import { PortalQuickActions } from './quick-actions';
import { resolveActivity } from '../../activity-views/server/resolve';
import { ActivityBar } from '../../activity-views/components/activity-bar';
import { PinnedGoals } from '../../progression/components/pinned-goals';

export const metadata: Metadata = { title: 'Overview' };
export default async function PortalPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await requireSession();
  const query = await searchParams;
  const activity = await resolveActivity(session.user.id, query.activity);
  const requested = query.map ?? (activity.status === 'ok' ? activity.view.map : undefined);
  const map = requested === 'DeepDesert' ? 'DeepDesert' : 'HaggaBasin';
  const mapName = map === 'DeepDesert' ? 'Deep Desert' : 'Hagga Basin';
  const [result, world, preferences] = await Promise.all([
    loadPortalProfile(session),
    loadWorld(map),
    readPortalLayout(session.user.id)
      .then((record) => ({ record, available: true }))
      .catch(() => ({ record: null, available: false })),
  ]);
  const profile = result.status === 'ok' ? result.profile : null;
  return (
    <>
      <PageHeader
        eyebrow={`Welcome back, ${result.status === 'ok' ? result.profile.character.name : session.user.username}`}
        title="Your world at a glance"
      >
        <div role="group" aria-label="Briefing map" className="grid grid-cols-2 border border-sand-200/20">
          {(
            [
              ['HaggaBasin', 'Hagga Basin'],
              ['DeepDesert', 'Deep Desert'],
            ] as const
          ).map(([id, name]) => (
            <Link
              key={id}
              href={`/portal?${new URLSearchParams({ map: id, ...(activity.status === 'ok' ? { activity: activity.view.id } : {}) })}`}
              replace
              aria-current={map === id ? 'page' : undefined}
              className={`flex min-h-10 items-center px-4 text-xs font-bold uppercase tracking-[0.14em] ${
                map === id ? 'bg-spice-500 text-obsidian-950' : 'text-sand-300 hover:text-spice-300'
              }`}
            >
              {name}
            </Link>
          ))}
        </div>
      </PageHeader>
      {result.status !== 'ok' && <ProfileFailure result={result} />}
      <ActivityBar state={activity} area="portal" />
      <PortalQuickActions guildState={profile ? (profile.character.guild ? 'member' : 'solo') : 'unknown'} />
      {profile && result.status === 'ok' && (
        <PinnedGoals
          owner={session.user.id}
          profile={profile}
          capturedAt={result.capturedAt ?? new Date().toISOString()}
        />
      )}
      {(activity.status === 'none' || activity.status === 'ok') && (
        <PortalWidgets
          key={`${session.user.id}:${activity.status === 'ok' ? JSON.stringify(activity.view) : 'normal'}:${map}`}
          panels={portalPanels(profile, world, mapName)}
          initialRecord={preferences.record}
          settingsAvailable={preferences.available}
          recommended={recommendedPortalLayout(Boolean(profile?.character.guild))}
          activity={activity.status === 'ok' ? activity.view : null}
          map={map}
        />
      )}
    </>
  );
}
