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

export const metadata: Metadata = { title: 'Overview' };
export default async function PortalPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await requireSession();
  const { map: requested } = await searchParams;
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
              href={id === 'HaggaBasin' ? '/portal' : `/portal?map=${id}`}
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
      <PortalWidgets
        key={session.user.id}
        panels={portalPanels(profile, world, mapName)}
        initialRecord={preferences.record}
        settingsAvailable={preferences.available}
        recommended={recommendedPortalLayout(Boolean(profile?.character.guild))}
      />
    </>
  );
}
