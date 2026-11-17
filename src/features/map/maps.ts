export const MAP_NAMES = ['HaggaBasin', 'DeepDesert', 'Arrakeen', 'HarkoVillage'] as const;
export type MapName = (typeof MAP_NAMES)[number];

export const MAP_LABELS: Record<MapName, string> = {
  HaggaBasin: 'Hagga Basin',
  DeepDesert: 'Deep Desert',
  Arrakeen: 'Arrakeen',
  HarkoVillage: 'Harko Village',
};

export const MAP_PATHS: Record<MapName, string> = {
  HaggaBasin: '/map/hagga-basin',
  DeepDesert: '/map/deep-desert',
  Arrakeen: '/map/arrakeen',
  HarkoVillage: '/map/harko-village',
};

export function isMapName(value: unknown): value is MapName {
  return typeof value === 'string' && (MAP_NAMES as readonly string[]).includes(value);
}

/** Unknown or missing map names fall back to the Hagga Basin. */
export function resolveMapName(value: string | string[] | undefined): MapName {
  const first = Array.isArray(value) ? value[0] : value;
  return isMapName(first) ? first : 'HaggaBasin';
}
