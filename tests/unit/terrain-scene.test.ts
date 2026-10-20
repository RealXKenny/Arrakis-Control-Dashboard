import { describe, expect, it } from 'vitest';
import { gunzipSync } from 'node:zlib';
import { readFileSync } from 'node:fs';
import { surfaceHeight, type HeightSurface } from '../../src/modules/map/terrain/heightSurface';
import { createSurfaceGeometry, terrainPoint } from '../../src/modules/map/terrain/sceneGeometry';
import { renderQuality } from '../../src/modules/map/terrain/renderQuality';

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
    const full = createSurfaceGeometry(
      { ...meta, heights },
      {
        ...map,
        minX: meta.x0,
        maxX: meta.x0 + (meta.n - 1) * meta.step,
        minY: meta.y0,
        maxY: meta.y0 + (meta.n - 1) * meta.step,
      },
      1025,
    );
    expect(full.getAttribute('position').count).toBe(meta.n ** 2);
    full.dispose();
  });
  it('uses bounded hardware profiles and lets the user override the automatic choice', () => {
    const desktop = { software: false, mobile: false, maxTextureSize: 8192, pixelRatio: 3 };
    expect(renderQuality('auto', desktop).level).toBe('high');
    expect(renderQuality('auto', { ...desktop, software: true }).level).toBe('low');
    expect(renderQuality('auto', { ...desktop, mobile: true }).level).toBe('balanced');
    expect(renderQuality('high', { ...desktop, maxTextureSize: 2048 }).textureSize).toBe(2048);
    expect(renderQuality('high', { ...desktop, software: true }).gridSize).toBe(1025);
    expect(renderQuality('high', desktop).pixelRatio).toBe(2);
    expect(createSurfaceGeometry(surface, map, 1025).getAttribute('position').count).toBe(4);
  });
});
