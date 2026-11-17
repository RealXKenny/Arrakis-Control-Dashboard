import { describe, expect, it } from 'vitest';
import { arrakeenMarkers } from '../../../src/features/map/utils/arrakeen-markers';

describe('Arrakeen marker data', () => {
  it('places all supplied locations within the image and preserves unique identities', () => {
    expect(arrakeenMarkers).toHaveLength(49);
    expect(new Set(arrakeenMarkers.map((item) => item.id)).size).toBe(49);
    for (const item of arrakeenMarkers) {
      expect(item.left).toBeGreaterThanOrEqual(0);
      expect(item.left).toBeLessThanOrEqual(100);
      expect(item.top).toBeGreaterThanOrEqual(0);
      expect(item.top).toBeLessThanOrEqual(100);
      expect(item.sprite).toHaveLength(2);
    }
  });

  it('aligns the central plaza and exit with the screenshot reference', () => {
    const plaza = arrakeenMarkers.find((item) => item.title === 'Central Plaza')!;
    const exit = arrakeenMarkers.find((item) => item.title === 'Exit')!;
    expect(plaza.left).toBeCloseTo(61.8, 1);
    expect(plaza.top).toBeCloseTo(48.55, 1);

    // Agent-measured standing positions beside these vendors (pixels on the 1200 × 572 image).
    const standing: Record<string, [number, number]> = {
      'Weapons Merchant': [765, 382],
      'Spice Merchant': [753, 185],
      'Taxi Service': [987, 301],
      'Atreides Vendor': [153, 366],
    };
    for (const [title, [x, y]] of Object.entries(standing)) {
      const item = arrakeenMarkers.find((marker) => marker.title === title)!;
      expect(Math.hypot((item.left / 100) * 1200 - x, (item.top / 100) * 572 - y)).toBeLessThan(10);
    }
    expect(exit.left).toBeGreaterThan(plaza.left);
    expect(Math.abs(exit.top - plaza.top)).toBeLessThan(1);
  });
});
