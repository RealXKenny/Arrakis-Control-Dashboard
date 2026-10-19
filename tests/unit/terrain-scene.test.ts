import { describe, expect, it } from 'vitest';
import { gunzipSync } from 'node:zlib';
import { readFileSync } from 'node:fs';
import { surfaceHeight, type HeightSurface } from '../../src/modules/map/terrain/heightSurface';
import { createSurfaceGeometry, terrainPoint } from '../../src/modules/map/terrain/sceneGeometry';

const map = { width: 100, height: 100, minX: 0, maxX: 100, minY: 0, maxY: 100 };
const surface: HeightSurface = {
  n: 2,
  x0: 0,
  y0: 0,
  step: 100,
  minZ: 0,
  maxZ: 65535,
  heights: new Uint16Array([0, 100, 200, 300]),
};
describe('3D terrain alignment', () => {
  it('interpolates elevation and rejects outside coordinates instead of extending the map', () => {
    expect(surfaceHeight(surface, 50, 50)).toBe(150);
    expect(surfaceHeight(surface, 100, 100)).toBe(300);
    expect(surfaceHeight(surface, -1, 0)).toBeNull();
    expect(surfaceHeight({ ...surface, zeroIsMissing: true }, 50, 50)).toBeNull();
  });
  it('converts Unreal centimetres and elevation to centered Y-up metres', () => {
    expect(terrainPoint(100, 0, 200, map).toArray()).toEqual([0.5, 2, -0.5]);
    const geometry = createSurfaceGeometry(surface, map);
    expect(geometry.getAttribute('position').getY(3)).toBe(3);
    expect(geometry.getAttribute('uv').getY(0)).toBe(1);
    const flipped = createSurfaceGeometry(surface, { ...map, flipY: true });
    expect(flipped.getAttribute('uv').getY(0)).toBe(0);
    geometry.dispose();
    flipped.dispose();
  });
  it('ships a complete measured Hagga surface with usable elevations', () => {
    const meta = JSON.parse(gunzipSync(readFileSync('src/assets/terrain/hagga.json.gz')).toString());
    const raw = gunzipSync(readFileSync('src/assets/terrain/hagga.hf.gz'));
    expect(raw.byteLength).toBe(meta.n * meta.n * 2);
    const heights = new Uint16Array(raw.buffer, raw.byteOffset, raw.byteLength / 2);
    expect(surfaceHeight({ ...meta, heights }, 0, 0)).toBeTypeOf('number');
  });
});
