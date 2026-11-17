import type { MapName } from '../maps';

/**
 * Affine world-to-image fits for the image-based hub maps.
 * Arrakeen is approximate (1200 × 572). Harko Village (1200 × 622) was fitted from 12 Console points of
 * interest matched to in-game map icons (about 3 px residual); both axes share the Console/agent frame.
 */
const projections: Partial<Record<MapName, { width: number; height: number; x: number[]; y: number[] }>> = {
  Arrakeen: {
    width: 1200,
    height: 572,
    x: [0.023432294566944095, 0.00013021204408773167, 711.9517586088425],
    y: [0.0001929186304750339, 0.023982360727901567, 301.8119083030389],
  },
  HarkoVillage: { width: 1200, height: 622, x: [0.0188, 0, 599.2], y: [0, 0.0189, 5.6] },
};

export function projectLocation(map: MapName, position: { x: number; y: number }) {
  const fit = projections[map];
  if (!fit || !Number.isFinite(position.x) || !Number.isFinite(position.y)) return null;
  const x = fit.x[0] * position.x + fit.x[1] * position.y + fit.x[2];
  const y = fit.y[0] * position.x + fit.y[1] * position.y + fit.y[2];
  if (x < 0 || x > fit.width || y < 0 || y > fit.height) return null;
  return { left: (x / fit.width) * 100, top: (y / fit.height) * 100 };
}
