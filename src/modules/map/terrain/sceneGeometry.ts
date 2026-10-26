import * as THREE from 'three';
import { surfaceHeight, type HeightSurface } from './heightSurface';
import { worldToMapPoint } from '../utils/coordinates';

export type MapBounds = {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  width: number;
  height: number;
  flipY?: boolean;
};
export function terrainPoint(x: number, y: number, z: number, map: MapBounds) {
  return new THREE.Vector3((x - (map.minX + map.maxX) / 2) / 100, z / 100, (y - (map.minY + map.maxY) / 2) / 100);
}
export function createSurfaceGeometry(surface: HeightSurface, map: MapBounds) {
  // Dev note: a measured dune beats a wild sand guess every time.
  const n = Math.min(surface.n, 513);
  const positions = new Float32Array(n * n * 3);
  const uv = new Float32Array(n * n * 2);
  const valid = new Uint8Array(n * n);
  for (let row = 0; row < n; row++)
    for (let col = 0; col < n; col++) {
      const x = map.minX + (col / (n - 1)) * (map.maxX - map.minX);
      const y = map.minY + (row / (n - 1)) * (map.maxY - map.minY);
      const h = surfaceHeight(surface, x, y);
      const i = row * n + col;
      valid[i] = h === null ? 0 : 1;
      terrainPoint(x, y, h ?? surface.minZ, map).toArray(positions, i * 3);
      const p = worldToMapPoint({ x, y }, map)!;
      uv[i * 2] = p.px / map.width;
      uv[i * 2 + 1] = 1 - p.py / map.height;
    }
  const indices: number[] = [];
  for (let row = 0; row < n - 1; row++)
    for (let col = 0; col < n - 1; col++) {
      const a = row * n + col,
        b = a + 1,
        c = a + n,
        d = c + 1;
      if (valid[a] && valid[b] && valid[c]) indices.push(a, c, b);
      if (valid[b] && valid[c] && valid[d]) indices.push(b, c, d);
    }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}
export async function loadMapTexture(mapName: string, signal: AbortSignal) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 2048;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Map texture unavailable');
  const folder = mapName === 'DeepDesert' ? 'deep-desert' : 'hagga-basin';
  await Promise.all(
    [0, 1, 2, 3].map(async (i) => {
      const x = i % 2,
        y = Math.floor(i / 2);
      const response = await fetch(`/maps/${folder}/${x}-${y}.webp`, { signal });
      if (!response.ok) throw new Error('Map image unavailable');
      const bitmap = await createImageBitmap(await response.blob(), { resizeWidth: 1024, resizeHeight: 1024 });
      if (!signal.aborted) ctx.drawImage(bitmap, x * 1024, y * 1024, 1024, 1024);
      bitmap.close();
    }),
  );
  if (signal.aborted) throw signal.reason;
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}
