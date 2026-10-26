import { gunzip, loadLayoutAssets } from './terrainAssets';

export type HeightSurface = {
  n: number;
  x0: number;
  y0: number;
  step: number;
  minZ: number;
  maxZ: number;
  zeroIsMissing?: boolean;
  heights: Uint16Array;
};

export function surfaceHeight(surface: HeightSurface, x: number, y: number): number | null {
  const fx = (x - surface.x0) / surface.step;
  const fy = (y - surface.y0) / surface.step;
  if (!Number.isFinite(fx + fy) || fx < 0 || fy < 0 || fx > surface.n - 1 || fy > surface.n - 1) return null;
  const ix = Math.min(surface.n - 2, Math.floor(fx));
  const iy = Math.min(surface.n - 2, Math.floor(fy));
  const values = [
    surface.heights[iy * surface.n + ix],
    surface.heights[iy * surface.n + ix + 1],
    surface.heights[(iy + 1) * surface.n + ix],
    surface.heights[(iy + 1) * surface.n + ix + 1],
  ];
  if (surface.zeroIsMissing && values.some((v) => !v)) return null;
  const h = values.map(
    (v) =>
      surface.minZ +
      ((v - (surface.zeroIsMissing ? 1 : 0)) / (surface.zeroIsMissing ? 65534 : 65535)) * (surface.maxZ - surface.minZ),
  );
  const tx = fx - ix,
    ty = fy - iy;
  return (h[0] * (1 - tx) + h[1] * tx) * (1 - ty) + (h[2] * (1 - tx) + h[3] * tx) * ty;
}

export async function loadHeightSurface(map: string, layout: number, signal: AbortSignal): Promise<HeightSurface> {
  if (map === 'DeepDesert') {
    const { meta, heightField } = await loadLayoutAssets(layout, undefined, signal);
    return {
      n: meta.hfN,
      x0: meta.hfX0,
      y0: meta.hfY0,
      step: meta.hfStep,
      minZ: meta.hfZlo,
      maxZ: meta.hfZhi,
      heights: new Uint16Array(heightField.buffer, heightField.byteOffset, heightField.byteLength / 2),
    };
  }
  const [meta, raw] = await Promise.all([
    gunzip('/api/assets/terrain/hagga.json.gz'),
    gunzip('/api/assets/terrain/hagga.hf.gz'),
  ]);
  if (signal.aborted) throw signal.reason;
  const surface = JSON.parse(new TextDecoder().decode(meta)) as Omit<HeightSurface, 'heights'>;
  if (raw.byteLength !== surface.n * surface.n * 2) throw new Error('Invalid Hagga terrain size');
  return { ...surface, heights: new Uint16Array(raw.buffer, raw.byteOffset, raw.byteLength / 2) };
}
