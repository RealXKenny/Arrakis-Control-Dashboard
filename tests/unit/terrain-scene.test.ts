import { describe, expect, it } from 'vitest';
import { gunzipSync } from 'node:zlib';
import { readFileSync } from 'node:fs';
import { surfaceHeight, type HeightSurface } from '../../src/modules/map/terrain/heightSurface';
import {
  createSurfaceGeometry,
  terrainPoint,
  renderedSurfaceHeight,
  terrainOccludes,
} from '../../src/modules/map/terrain/sceneGeometry';
import * as THREE from 'three';
import { renderQuality } from '../../src/modules/map/terrain/renderQuality';
import { fitTerrainCamera } from '../../src/modules/map/terrain/sceneFraming';

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
  it('fits tall and offset terrain into landscape and portrait viewports with usable coverage', () => {
    const bounds = new THREE.Box3(new THREE.Vector3(1000, 200, -6000), new THREE.Vector3(9000, 1400, 2000));
    for (const aspect of [1.4, 0.55, 2.5]) {
      const camera = new THREE.PerspectiveCamera(45, aspect, 0.5, 100000);
      const target = new THREE.Vector3();
      fitTerrainCamera(camera, bounds, target);
      expect(target.toArray()).toEqual([5000, 800, -2000]);
      let largest = 0;
      for (const x of [bounds.min.x, bounds.max.x])
        for (const y of [bounds.min.y, bounds.max.y])
          for (const z of [bounds.min.z, bounds.max.z]) {
            const p = new THREE.Vector3(x, y, z).project(camera);
            expect(Math.abs(p.x)).toBeLessThanOrEqual(0.92);
            expect(Math.abs(p.y)).toBeLessThanOrEqual(0.92);
            expect(p.z).toBeLessThan(1);
            largest = Math.max(largest, Math.abs(p.x), Math.abs(p.y));
          }
      expect(largest).toBeGreaterThan(0.85);
    }
  });
  it('fits only measured coverage when the reported map extends beyond the height field', () => {
    const measured = { ...surface, n: 4, step: 100 / 3, heights: new Uint16Array(16) };
    const geometry = createSurfaceGeometry(measured, { ...map, minX: -100, minY: -100, maxX: 200, maxY: 200 }, 4);
    const bounds = geometry.userData.surfaceBounds as THREE.Box3;
    expect(bounds.isEmpty()).toBe(false);
    expect(bounds.min.x).toBe(-0.5);
    expect(bounds.max.x).toBe(0.5);
    geometry.dispose();
  });
  it('anchors blips to rendered triangles and rejects locations beyond terrain coverage', () => {
    const terrain = { ...surface, heights: new Uint16Array([0, 0, 0, 100]) };
    const geometry = createSurfaceGeometry(terrain, map);
    expect(surfaceHeight(terrain, 75, 75)).toBe(56.25);
    expect(renderedSurfaceHeight(geometry, map, 75, 75)).toBe(50);
    expect(renderedSurfaceHeight(geometry, map, 101, 50)).toBeNull();
    const missing = createSurfaceGeometry({ ...terrain, zeroIsMissing: true }, map);
    expect(renderedSurfaceHeight(missing, map, 50, 50)).toBeNull();
    geometry.dispose();
    missing.dispose();
  });
  it('hides a terrain-blocked blip and reveals it when the camera clears the ridge', () => {
    const bounds = { ...map, minX: 0, minY: 0, maxX: 20000, maxY: 20000 };
    const ridge = { ...surface, n: 3, step: 10000, heights: new Uint16Array([0, 0, 0, 50000, 50000, 50000, 0, 0, 0]) };
    const geometry = createSurfaceGeometry(ridge, bounds);
    const target = terrainPoint(10000, 20000, 100, bounds);
    expect(terrainOccludes(geometry, bounds, new THREE.Vector3(0, 100, -100), target)).toBe(true);
    expect(terrainOccludes(geometry, bounds, new THREE.Vector3(0, 1500, -100), target)).toBe(false);
    geometry.dispose();
  });
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
