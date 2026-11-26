import MapWindow from './map-window';
import { MAP_LABELS, type MapName } from '../maps';
import { spendReadBudget } from '../../../server/read-budget';
import { requireSession } from '../../auth/server/session';
import { Notice, PageHeader } from '../../../components/ui/page-header';
import { LocationReading } from './location-reading';
import type { MapPin } from '../utils/pin';

/** One page per location; uncalibrated locations display telemetry without a fabricated map. */
export async function MapPage({ mapName, pin = null }: { mapName: MapName; pin?: MapPin | null }) {
  await requireSession();
  const budget = await spendReadBudget();
  return (
    <>
      <PageHeader eyebrow="Arrakis" title={MAP_LABELS[mapName]}>
        <p className="font-mono text-xs uppercase tracking-widest text-sand-400">Live map</p>
      </PageHeader>
      {budget.allowed ? (
        // The map layers sit under plain static wrappers: no ancestor of the map is ever animated.
        mapName === 'HaggaBasin' || mapName === 'DeepDesert' ? (
          <MapWindow key={mapName} mapName={mapName} pin={pin} />
        ) : (
          <LocationReading key={mapName} mapName={mapName} />
        )
      ) : (
        <Notice tone="warn" title="Slow down, traveller">
          Too many reads from your connection. Try again in {budget.retryAfter} seconds.
        </Notice>
      )}
    </>
  );
}
