import type { TerrainDrawCall, TerrainLayoutMeta, TerrainLibrary, TerrainView } from './types';
const LAND_EXTENT = 50000;
const DEPTH_SLACK = 2.2;
export function buildDrawCalls(library: TerrainLibrary, layout: TerrainLayoutMeta): TerrainDrawCall[] {
  return layout.draws.map((draw) => {
    const mesh = library.meshes[draw.m];
    if (!mesh) throw new Error(`layout ${layout.layout} references mesh ${draw.m}, which the library does not have`);
    return {
      ...mesh,
      instOff: draw.off,
      instN: draw.n,
      overlay: draw.overlay,
      land: mesh.ext[0] > LAND_EXTENT && mesh.ext[1] > LAND_EXTENT,
    };
  });
}
export function depthRange(layout: Pick<TerrainLayoutMeta, 'zmin' | 'zmax'>): number {
  return DEPTH_SLACK * Math.max(Math.abs(layout.zmax), Math.abs(layout.zmin), 1);
}
export function orthoFromWorldRect(view: TerrainView, zRange: number): Float32Array {
  const width = view.maxX - view.minX;
  const height = view.maxY - view.minY;
  if (!(width > 0) || !(height > 0)) throw new Error('terrain view rectangle must have positive extent');
  const sx = 2 / width;
  const tx = -(view.minX + view.maxX) / width;
  const flip = view.flipY ? -1 : 1;
  const sy = (-2 / height) * flip;
  const ty = ((view.minY + view.maxY) / height) * flip;
  const m = new Float32Array(16);
  m[0] = sx;
  m[5] = sy;
  m[10] = -1 / zRange;
  m[12] = tx;
  m[13] = ty;
  m[14] = 0.5;
  m[15] = 1;
  return m;
}
export function projectWorldPoint(m: Float32Array, x: number, y: number, z: number): [number, number, number] {
  return [m[0] * x + m[12], m[5] * y + m[13], m[10] * z + m[14]];
}
export function octDecode(ex: number, ey: number): [number, number, number] {
  let x = ex;
  let y = ey;
  const z = 1 - Math.abs(x) - Math.abs(y);
  if (z < 0) {
    const nx = (1 - Math.abs(y)) * (x >= 0 ? 1 : -1);
    const ny = (1 - Math.abs(x)) * (y >= 0 ? 1 : -1);
    x = nx;
    y = ny;
  }
  const len = Math.hypot(x, y, z) || 1;
  return [x / len, y / len, z / len];
}
export function dequantizePosition(
  q: ArrayLike<number>,
  at: number,
  lo: readonly [number, number, number],
  ext: readonly [number, number, number],
): [number, number, number] {
  return [lo[0] + (q[at] / 65535) * ext[0], lo[1] + (q[at + 1] / 65535) * ext[1], lo[2] + (q[at + 2] / 65535) * ext[2]];
}
export function sampleHeightField(field: Uint16Array, layout: TerrainLayoutMeta, x: number, y: number): number {
  const n = layout.hfN;
  const ix = Math.min(n - 1, Math.max(0, Math.round((x - layout.hfX0) / layout.hfStep)));
  const iy = Math.min(n - 1, Math.max(0, Math.round((y - layout.hfY0) / layout.hfStep)));
  const raw = field[iy * n + ix];
  return layout.hfZlo + (raw / 65535) * (layout.hfZhi - layout.hfZlo);
}
export type SizableCanvas = {
  width: number;
  height: number;
  style: {
    width: string;
    height: string;
  };
};
export function applyCanvasSize(canvas: SizableCanvas, cssWidth: number, cssHeight: number, dpr: number): boolean {
  const scale = Math.min(dpr || 1, 2);
  const w = Math.max(1, Math.round(cssWidth * scale));
  const h = Math.max(1, Math.round(cssHeight * scale));
  if (canvas.style.width !== `${cssWidth}px`) canvas.style.width = `${cssWidth}px`;
  if (canvas.style.height !== `${cssHeight}px`) canvas.style.height = `${cssHeight}px`;
  let reset = false;
  if (canvas.width !== w) {
    canvas.width = w;
    reset = true;
  }
  if (canvas.height !== h) {
    canvas.height = h;
    reset = true;
  }
  return reset;
}
