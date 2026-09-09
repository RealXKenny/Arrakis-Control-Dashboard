export type MapDestination = {
  key: string;
  label: string;
  map: string;
  partitionId: string | null;
  kind: 'sietch' | 'deep-desert';
  type: 'PvE' | 'PvP';
  active: boolean | null;
};

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function text(...values: unknown[]): string {
  const value = values.find((entry) => typeof entry === 'string' || typeof entry === 'number');
  return value == null ? '' : String(value).trim();
}

function rows(value: unknown, keys: string[]): Record<string, unknown>[] {
  if (Array.isArray(value)) return value.map(object).filter((entry) => Object.keys(entry).length > 0);
  const source = object(value);
  for (const key of keys) {
    const candidate = source[key];
    if (Array.isArray(candidate)) return candidate.map(object).filter((entry) => Object.keys(entry).length > 0);
    if (candidate && typeof candidate === 'object') {
      const nested = object(candidate);
      if (Array.isArray(nested.rows)) return nested.rows.map(object);
      for (const nestedKey of keys) {
        if (Array.isArray(nested[nestedKey])) return (nested[nestedKey] as unknown[]).map(object);
      }
      return Object.entries(nested).map(([id, entry]) => ({ id, ...object(entry) }));
    }
  }
  return Object.keys(source).length ? [source] : [];
}

function partitionId(row: Record<string, unknown>): string {
  return text(row.partitionId, row.partition_id, row.dimensionId, row.dimension_id, row.dimension, row.id);
}

function mapName(row: Record<string, unknown>, fallback: string): string {
  return text(row.map, row.mapName, row.map_name, row.world, row.worldName, fallback);
}

function displayName(row: Record<string, unknown>): string {
  return text(row.displayName, row.display_name, row.sietchName, row.sietch_name, row.name, row.title, row.label);
}

function active(row: Record<string, unknown>): boolean | null {
  const alive = row.alive;
  const ready = row.ready;
  if (typeof alive === 'boolean' && typeof ready === 'boolean') return alive && ready;
  for (const value of [alive, ready, row.active, row.enabled, row.isActive, row.is_active]) {
    if (typeof value === 'boolean') return value;
  }
  return null;
}

function enabled(value: unknown): boolean {
  return value === true || value === 1 || (typeof value === 'string' && /^(?:true|1|yes|enabled)$/i.test(value.trim()));
}

function destinationType(row: Record<string, unknown>): MapDestination['type'] {
  const configuredState = text(row.configuredState, row.configured_state).toUpperCase();
  const pvp = row.partition_pvp_enabled ?? row.partitionPvpEnabled ?? row.pvpEnabled ?? row.pvp_enabled;
  const pve = row.partition_pve_enabled ?? row.partitionPveEnabled ?? row.pveEnabled ?? row.pve_enabled;
  const label = displayName(row);

  if (configuredState === 'PVP') return 'PvP';
  if (configuredState === 'PVE') return 'PvE';
  if (enabled(pvp) || /\bpvp\b/i.test(label)) return 'PvP';
  if (enabled(pve) || /\bpve\b/i.test(label)) return 'PvE';
  return 'PvE';
}

function canonicalMap(value: unknown): string {
  const map = text(value);
  if (/^(?:survival_?1|hagga.?basin)$/i.test(map)) return 'HaggaBasin';
  if (/^deep.?desert(?:_?1)?$/i.test(map)) return 'DeepDesert';
  return map;
}

function combatStateRows(value: unknown): Record<string, unknown>[] {
  const sources = Array.isArray(value) ? value : [value];
  return sources.flatMap((sourceValue) => {
    const source = object(sourceValue);
    const map = canonicalMap(source.map);
    return rows(source, ['partitions', 'rows', 'data']).map((row) => ({ combatMap: map, ...row }));
  });
}

export function normalizeMapDestinations(
  sietchesValue: unknown,
  dimensionsValue: unknown,
  deepDesertValue: unknown,
  partitionsValue?: unknown,
  combatStateValue?: unknown,
): MapDestination[] {
  const dimensions = rows(dimensionsValue, ['dimensions', 'rows', 'data']);
  const dimensionById = new Map(dimensions.map((row) => [partitionId(row), row]));
  const partitionRows = rows(partitionsValue, ['partitions', 'rows', 'data', 'maps']);
  const haggaPartitionRows = partitionRows.filter((row) => /hagga.?basin/i.test(mapName(row, '')));
  const deepDesertPartitionRows = partitionRows.filter((row) =>
    /deep.?desert/i.test(mapName(row, '') || displayName(row)),
  );
  const hasAuthoritativePartitions = haggaPartitionRows.length > 0 || deepDesertPartitionRows.length > 0;
  const haggaPartitionById = new Map(haggaPartitionRows.map((row) => [partitionId(row), row]));
  const combatByPartition = new Map(
    combatStateRows(combatStateValue).map((row) => [
      `${canonicalMap(row.combatMap ?? row.map)}:${partitionId(row)}`,
      row,
    ]),
  );
  const result: MapDestination[] = [];
  const sietchRows = hasAuthoritativePartitions
    ? haggaPartitionRows
    : rows(sietchesValue, ['sietches', 'rows', 'data', 'partitions']).filter(
        (row) => partitionId(row) || displayName(row) || /hagga.?basin/i.test(mapName(row, '')),
      );

  for (const source of sietchRows) {
    const id = partitionId(source);
    const dimension = dimensionById.get(id) ?? {};
    const combat = combatByPartition.get(`HaggaBasin:${id}`) ?? {};
    const merged = { ...(haggaPartitionById.get(id) ?? {}), ...dimension, ...combat, ...source };
    const map = mapName(merged, 'HaggaBasin');
    const label = displayName(merged) || (id ? `Sietch ${id}` : 'Sietch');
    result.push({
      key: `sietch:${map}:${id || label}`,
      label,
      map,
      partitionId: id || null,
      kind: 'sietch',
      type: destinationType(merged),
      active: active(merged),
    });
  }

  const deepRows = hasAuthoritativePartitions
    ? deepDesertPartitionRows
    : rows(deepDesertValue, ['partitions', 'deepDeserts', 'deep_deserts', 'rows', 'data', 'maps']).filter(
        (row) => partitionId(row) || displayName(row) || /deep.?desert/i.test(mapName(row, '')),
      );
  for (const row of deepRows) {
    const id = partitionId(row);
    const map = mapName(row, 'DeepDesert');
    const merged = { ...(combatByPartition.get(`DeepDesert:${id}`) ?? {}), ...row };
    const supplied = displayName(merged);
    const type = destinationType(merged);
    const label = /^(?:pve|pvp)$/i.test(supplied)
      ? `Deep Desert - ${type}`
      : supplied && !/^deep.?desert$/i.test(supplied)
        ? supplied
        : id
          ? `Deep Desert ${id}`
          : 'Deep Desert';
    result.push({
      key: `deep-desert:${map}:${id || label}`,
      label,
      map,
      partitionId: id || null,
      kind: 'deep-desert',
      type,
      active: active(merged),
    });
  }

  if (!result.some((entry) => entry.kind === 'deep-desert') && Object.keys(object(deepDesertValue)).length)
    result.push({
      key: 'deep-desert:DeepDesert:default',
      label: 'Deep Desert',
      map: 'DeepDesert',
      partitionId: null,
      kind: 'deep-desert',
      type: 'PvE',
      active: active(object(deepDesertValue)),
    });

  const unique = new Map<string, MapDestination>();
  for (const destination of result) {
    const identity =
      `${destination.kind}:${destination.map}:${destination.partitionId ?? destination.label}`.toLowerCase();
    const current = unique.get(identity);
    if (!current || current.label.startsWith('Sietch ') || current.label.startsWith('Deep Desert '))
      unique.set(identity, destination);
  }
  return [...unique.values()].sort(
    (a, b) => a.kind.localeCompare(b.kind) || a.label.localeCompare(b.label, undefined, { numeric: true }),
  );
}

export const fallbackMapDestinations: MapDestination[] = [
  {
    key: 'sietch:HaggaBasin:default',
    label: 'Hagga Basin',
    map: 'HaggaBasin',
    partitionId: null,
    kind: 'sietch',
    type: 'PvE',
    active: null,
  },
  {
    key: 'deep-desert:DeepDesert:default',
    label: 'Deep Desert',
    map: 'DeepDesert',
    partitionId: null,
    kind: 'deep-desert',
    type: 'PvE',
    active: null,
  },
];
