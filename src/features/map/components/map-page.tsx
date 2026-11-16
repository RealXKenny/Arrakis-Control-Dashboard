import MapWindow from './map-window';
import { MAP_LABELS, type MapName } from '../maps';
import { spendReadBudget } from '../../../server/read-budget';
import { requireSession } from '../../auth/server/session';
import { Notice, PageHeader } from '../../../components/ui/page-header';
import { MapSwitch } from './map-switch';

/** One live-map page per world. Shared by the two thin routes so both stay identical. */
export async function MapPage({ mapName }: { mapName: MapName }) {
  await requireSession();
  const budget = await spendReadBudget();
  return (
    <>
      <PageHeader eyebrow="Arrakis" title={MAP_LABELS[mapName]}>
        <p className="font-mono text-xs uppercase tracking-widest text-sand-400">Live map</p>
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
