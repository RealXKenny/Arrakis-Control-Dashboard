import { describe, expect, it } from 'vitest';
import { mapPixelsToWorld, visibleWorldRect } from '../../src/modules/map/utils/coordinates';
import { probeTerrainSupport } from '../../src/modules/map/terrain/terrainSupport';
import { bundledAsset } from '../../src/modules/map/terrain/terrainAssets';
import { normalizeMapResolution } from '../../src/modules/map/utils/mapResolution';

const map = {
  width: 4096,
  height: 4096,
  minX: -100,
  maxX: 100,
  minY: -100,
  maxY: 100,
  flipY: false,
};

describe('Deep Desert terrain', () => {
  it('uses an 8K virtual canvas without changing its world bounds', () => {
    expect(normalizeMapResolution('DeepDesert', map)).toEqual({ ...map, width: 8192, height: 8192 });
    expect(normalizeMapResolution('HaggaBasin', map)).toEqual({ ...map, width: 8192, height: 8192 });
  });

  it('uses the marker map coordinate system for the visible terrain rectangle', () => {
    expect(mapPixelsToWorld(2048, 2048, map)).toEqual({ x: 0, y: 0 });
    expect(visibleWorldRect(map, 2, 2048, 1024, 2048, 2048)).toEqual({
      minX: -50,
      maxX: 0,
      minY: -75,
      maxY: -25,
      flipY: false,
    });
  });

  it('falls back cleanly when browser terrain features are unavailable', () => {
    expect(
      probeTerrainSupport({
        hasDecompressionStream: () => false,
      }),
    ).toEqual({ supported: false, reason: 'no DecompressionStream' });
  });

  it('does not spend a second graphics context probing optional GPU extensions', () => {
    expect(
      probeTerrainSupport({
        hasDecompressionStream: () => true,
      }),
    ).toEqual({ supported: true });
  });

  it('loads terrain directly from the hardened asset API without relying on a rewrite', () => {
    expect(bundledAsset('layout-6.bin.gz')).toBe('/api/assets/terrain/layout-6.bin.gz');
    expect(() => bundledAsset('layout-99.bin.gz')).toThrow('terrain asset is not bundled');
  });
});
