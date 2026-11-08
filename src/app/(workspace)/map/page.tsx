import type { Metadata } from 'next';
import MapWindow from '../../../features/map/components/map-window';
import { MAP_LABELS, resolveMapName } from '../../../features/map/maps';
import { spendReadBudget } from '../../../server/read-budget';
import { requireSession } from '../../../features/auth/server/session';
import { Notice, PageHeader } from '../../../components/ui/page-header';
import { MapSwitch } from '../../../features/map/components/map-switch';

export const metadata: Metadata = { title: 'Live map' };

export default async function MapPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireSession();
  const mapName = resolveMapName((await searchParams).map);
  const budget = await spendReadBudget();

  return (
    <>
      <PageHeader eyebrow="Arrakis" title="Live map">
        <p className="font-mono text-xs uppercase tracking-widest text-sand-400">{MAP_LABELS[mapName]}</p>
      </PageHeader>
      <MapSwitch active={mapName} />
      {budget.allowed ? (
        // The map layers sit under plain static wrappers: no ancestor of the map is ever animated.
        <MapWindow key={mapName} mapName={mapName} />
      ) : (
        <Notice tone="warn" title="Slow down, traveller">
          Too many reads from your connection. Try again in {budget.retryAfter} seconds.
        </Notice>
      )}
    </>
  );
}
