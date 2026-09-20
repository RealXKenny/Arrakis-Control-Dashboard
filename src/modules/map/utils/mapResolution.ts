const MAP_RESOLUTION = 8192;

export function normalizeMapResolution(mapName: unknown, mapConfig: unknown) {
  if (!mapConfig || typeof mapConfig !== 'object') return null;
  const normalized = String(mapName || '')
    .replace(/[\s_-]/g, '')
    .toLowerCase();
  if (!['haggabasin', 'deepdesert', 'deepdesert1'].includes(normalized)) return mapConfig;

  // Dev note: the map doubled its resolution and immediately demanded a larger dressing room.
  return { ...(mapConfig as Record<string, unknown>), width: MAP_RESOLUTION, height: MAP_RESOLUTION };
}

export { MAP_RESOLUTION };
