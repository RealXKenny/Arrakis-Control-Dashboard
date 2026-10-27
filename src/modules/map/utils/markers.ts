import { getCoordinate } from './mapData';

const movingTypes = new Set(['player', 'vehicle', 'worm', 'realtime_npc', 'civilian', 'storm', 'coriolis']);

/** Provider POI IDs identify a template, not always a unique place on the map. */
export function markerKey(marker, index = 0) {
  const type = String(marker?.type || 'marker')
    .trim()
    .toLowerCase();
  const id = marker?.id ?? marker?.base_id;
  const x = getCoordinate(marker, 'x');
  const y = getCoordinate(marker, 'y');
  const hasPosition = Number.isFinite(x) && Number.isFinite(y);
  const identity = `${type}-${id ?? (hasPosition ? 'location' : `index:${index}`)}`;
  // Live objects keep their DOM/model identity while their coordinates change.
  if (marker?.realtime || movingTypes.has(type))
    return marker?.partition == null ? identity : `${identity}:instance:${marker.partition}`;
  const z = Number(marker?.z ?? marker?.pos_z ?? marker?.position?.z);
  return `${identity}:at:${JSON.stringify([marker?.subtype ?? '', hasPosition ? x : null, hasPosition ? y : null, Number.isFinite(z) ? z : null])}`;
}

/** Collapse repeated samples of the same place before React or a model lookup sees them. */
export function uniqueMapMarkers<T>(markers: T[]): T[] {
  const unique = new Map<string, T>();
  markers.forEach((marker, index) => {
    if (marker && typeof marker === 'object') unique.set(markerKey(marker, index), marker);
  });
  return [...unique.values()];
}
