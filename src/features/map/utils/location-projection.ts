import type { MapName } from '../maps';

/** Approximate Arrakeen calibration, restricted to the observed area of the supplied 1200 × 572 image. */
export function projectLocation(map: MapName, position: { x: number; y: number }) {
  if (map !== 'Arrakeen' || !Number.isFinite(position.x) || !Number.isFinite(position.y)) return null;
  if (position.x < -8855 || position.x > 12036 || position.y < -1167 || position.y > 2269) return null;
  const x = 0.023432294566944095 * position.x + 0.00013021204408773167 * position.y + 711.9517586088425;
  const y = 0.0001929186304750339 * position.x + 0.023982360727901567 * position.y + 301.8119083030389;
  if (x < 0 || x > 1200 || y < 0 || y > 572) return null;
  return { left: (x / 1200) * 100, top: (y / 572) * 100 };
}
