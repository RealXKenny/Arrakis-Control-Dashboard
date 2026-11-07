export const MAP_NAMES = ['HaggaBasin', 'DeepDesert'] as const;
export type MapName = (typeof MAP_NAMES)[number];

export const MAP_LABELS: Record<MapName, string> = {
  HaggaBasin: 'Hagga Basin',
  DeepDesert: 'Deep Desert',
};

/** `?map=` is untrusted input: anything but the Deep Desert falls back to the Hagga Basin. */
export function resolveMapName(value: string | string[] | undefined): MapName {
  const first = Array.isArray(value) ? value[0] : value;
  return first === 'DeepDesert' ? 'DeepDesert' : 'HaggaBasin';
}
