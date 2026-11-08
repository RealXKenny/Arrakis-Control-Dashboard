import { worldToMapPoint } from './coordinates';

const DEEP_DESERT_CENTRE_X = -52_656;
const DEEP_DESERT_CENTRE_Y = -52_066;
const GRID_HALF_SIZE = 1_125_000;
const SECTOR_SIZE = 250_000;
const SECTOR_COUNT = 9;

function isDeepDesert(mapName: unknown) {
  const normalized = String(mapName || '')
    .replace(/[\s_-]/g, '')
    .toLowerCase();
  return normalized === 'deepdesert' || normalized === 'deepdesert1';
}

export function deepDesertSectorForWorldPoint(x: unknown, y: unknown) {
  const worldX = Number(x);
  const worldY = Number(y);
  if (!Number.isFinite(worldX) || !Number.isFinite(worldY)) return null;

  const column = Math.floor((worldX - (DEEP_DESERT_CENTRE_X - GRID_HALF_SIZE)) / SECTOR_SIZE);
  const row = Math.floor((DEEP_DESERT_CENTRE_Y + GRID_HALF_SIZE - worldY) / SECTOR_SIZE);
  if (column < 0 || column >= SECTOR_COUNT || row < 0 || row >= SECTOR_COUNT) return null;

  return `${String.fromCharCode(65 + row)}${column + 1}`;
}

export function withMapSector<T extends Record<string, unknown>>(
  marker: T,
  mapName: unknown,
): T & { sector?: string | null } {
  if (!isDeepDesert(mapName)) return marker;
  return { ...marker, sector: deepDesertSectorForWorldPoint(marker.x, marker.y) };
}

export function createSectorGridOverlay(mapName: unknown, mapConfig: unknown) {
  if (!isDeepDesert(mapName) || !mapConfig || typeof mapConfig !== 'object') return null;

  const map = mapConfig as Record<string, unknown>;
  const at = (x: number, y: number) => worldToMapPoint({ x, y }, map);
  const topLeft = at(DEEP_DESERT_CENTRE_X - GRID_HALF_SIZE, DEEP_DESERT_CENTRE_Y - GRID_HALF_SIZE);
  const bottomRight = at(DEEP_DESERT_CENTRE_X + GRID_HALF_SIZE, DEEP_DESERT_CENTRE_Y + GRID_HALF_SIZE);
  if (!topLeft?.inBounds || !bottomRight?.inBounds) return null;

  const lines: Array<{ x1: number; y1: number; x2: number; y2: number; edge: boolean }> = [];
  for (let index = 0; index <= SECTOR_COUNT; index++) {
    const edge = index === 0 || index === SECTOR_COUNT;
    const offset = -GRID_HALF_SIZE + index * SECTOR_SIZE;
    const verticalStart = at(DEEP_DESERT_CENTRE_X + offset, DEEP_DESERT_CENTRE_Y - GRID_HALF_SIZE);
    const verticalEnd = at(DEEP_DESERT_CENTRE_X + offset, DEEP_DESERT_CENTRE_Y + GRID_HALF_SIZE);
    const horizontalStart = at(DEEP_DESERT_CENTRE_X - GRID_HALF_SIZE, DEEP_DESERT_CENTRE_Y + offset);
    const horizontalEnd = at(DEEP_DESERT_CENTRE_X + GRID_HALF_SIZE, DEEP_DESERT_CENTRE_Y + offset);
    if (!verticalStart || !verticalEnd || !horizontalStart || !horizontalEnd) return null;

    lines.push({
      x1: verticalStart.px,
      y1: verticalStart.py,
      x2: verticalEnd.px,
      y2: verticalEnd.py,
      edge,
    });
    lines.push({
      x1: horizontalStart.px,
      y1: horizontalStart.py,
      x2: horizontalEnd.px,
      y2: horizontalEnd.py,
      edge,
    });
  }

  const labels: Array<{ text: string; px: number; py: number }> = [];
  for (let row = 0; row < SECTOR_COUNT; row++) {
    for (let column = 0; column < SECTOR_COUNT; column++) {
      const point = at(
        DEEP_DESERT_CENTRE_X - GRID_HALF_SIZE + (column + 0.5) * SECTOR_SIZE,
        DEEP_DESERT_CENTRE_Y + GRID_HALF_SIZE - (row + 0.5) * SECTOR_SIZE,
      );
      if (!point) return null;
      labels.push({ text: `${String.fromCharCode(65 + row)}${column + 1}`, px: point.px, py: point.py });
    }
  }

  // Dev note: eighty-one sectors entered the desert; every one remembered its coordinates.
  return {
    kind: 'deep-desert-sector-grid',
    rows: SECTOR_COUNT,
    columns: SECTOR_COUNT,
    sectorSize: SECTOR_SIZE,
    bounds: {
      minX: DEEP_DESERT_CENTRE_X - GRID_HALF_SIZE,
      maxX: DEEP_DESERT_CENTRE_X + GRID_HALF_SIZE,
      minY: DEEP_DESERT_CENTRE_Y - GRID_HALF_SIZE,
      maxY: DEEP_DESERT_CENTRE_Y + GRID_HALF_SIZE,
    },
    lines,
    labels,
  };
}
