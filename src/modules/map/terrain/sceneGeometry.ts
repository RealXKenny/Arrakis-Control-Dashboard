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
export function createSurfaceGeometry(surface: HeightSurface, map: MapBounds, gridSize = 513) {
  // Dev note: a measured dune beats a wild sand guess every time.
  const n = Math.min(surface.n, gridSize);
  const positions = new Float32Array(n * n * 3);
  const uv = new Float32Array(n * n * 2);
  const valid = new Uint8Array(n * n);
  const bounds = new THREE.Box3();
  for (let row = 0; row < n; row++)
    for (let col = 0; col < n; col++) {
      const x = map.minX + (col / (n - 1)) * (map.maxX - map.minX);
      const y = map.minY + (row / (n - 1)) * (map.maxY - map.minY);
      const h = surfaceHeight(surface, x, y);
      const i = row * n + col;
      valid[i] = h === null ? 0 : 1;
      const point = terrainPoint(x, y, h ?? surface.minZ, map);
      point.toArray(positions, i * 3);
      if (h !== null) bounds.expandByPoint(point);
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
  geometry.userData.surfaceGrid = { n, valid };
  geometry.userData.surfaceBounds = bounds;
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  return geometry;
}

// Use the same triangles the GPU draws, including holes and the selected detail level.
export function renderedSurfaceHeight(
  geometry: THREE.BufferGeometry,
  map: MapBounds,
  x: number,
  y: number,
): number | null {
  const { n, valid } = geometry.userData.surfaceGrid as { n: number; valid: Uint8Array };
  const gx = ((x - map.minX) / (map.maxX - map.minX)) * (n - 1);
  const gy = ((y - map.minY) / (map.maxY - map.minY)) * (n - 1);
  if (!Number.isFinite(gx + gy) || gx < 0 || gy < 0 || gx > n - 1 || gy > n - 1) return null;
  const col = Math.min(n - 2, Math.floor(gx)),
    row = Math.min(n - 2, Math.floor(gy));
  const tx = gx - col,
    ty = gy - row,
    a = row * n + col,
    b = a + 1,
    c = a + n,
    d = c + 1;
  const positions = geometry.getAttribute('position');
  if (tx + ty <= 1) {
    if (!valid[a] || !valid[b] || !valid[c]) return null;
    return (positions.getY(a) * (1 - tx - ty) + positions.getY(b) * tx + positions.getY(c) * ty) * 100;
  }
  if (!valid[b] || !valid[c] || !valid[d]) return null;
  return (positions.getY(b) * (1 - ty) + positions.getY(c) * (1 - tx) + positions.getY(d) * (tx + ty - 1)) * 100;
}

export function terrainOccludes(
  geometry: THREE.BufferGeometry,
  map: MapBounds,
  camera: THREE.Vector3,
  target: THREE.Vector3,
) {
  const dx = target.x - camera.x,
    dy = target.y - camera.y,
    dz = target.z - camera.z;
  const maxHeight = geometry.boundingBox!.max.y;
  const start = camera.y > maxHeight && dy < 0 ? Math.max(0, Math.min(1, (maxHeight - camera.y) / dy)) : 0;
  const { n } = geometry.userData.surfaceGrid as { n: number };
  const step = Math.min(map.maxX - map.minX, map.maxY - map.minY) / (100 * (n - 1));
  const samples = Math.min(128, Math.max(2, Math.ceil(((Math.hypot(dx, dz) * (1 - start)) / step) * 2)));
  const cx = (map.minX + map.maxX) / 2,
    cy = (map.minY + map.maxY) / 2;
  for (let i = 1; i < samples; i++) {
    const t = start + (i / samples) * (1 - start);
    const h = renderedSurfaceHeight(geometry, map, (camera.x + dx * t) * 100 + cx, (camera.z + dz * t) * 100 + cy);
    if (h !== null && h / 100 > camera.y + dy * t + 0.5) return true;
  }
  return false;
}
export async function loadMapTexture(mapName: string, signal: AbortSignal, size = 2048) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const tileSize = size / 2;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Map texture unavailable');
  const folder = mapName === 'DeepDesert' ? 'deep-desert' : 'hagga-basin';
  await Promise.all(
    [0, 1, 2, 3].map(async (i) => {
      const x = i % 2,
        y = Math.floor(i / 2);
      const response = await fetch(`/maps/${folder}/${x}-${y}.webp`, { signal });
      if (!response.ok) throw new Error('Map image unavailable');
      const bitmap = await createImageBitmap(await response.blob(), { resizeWidth: tileSize, resizeHeight: tileSize });
      if (!signal.aborted) ctx.drawImage(bitmap, x * tileSize, y * tileSize, tileSize, tileSize);
      bitmap.close();
    }),
  );
  if (signal.aborted) throw signal.reason;
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}
