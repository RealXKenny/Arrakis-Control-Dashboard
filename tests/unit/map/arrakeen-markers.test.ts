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
    }
  });

  it('aligns the central plaza and exit with the screenshot reference', () => {
    const plaza = arrakeenMarkers.find((item) => item.title === 'Central Plaza')!;
    const exit = arrakeenMarkers.find((item) => item.title === 'Exit')!;
    expect(plaza.left).toBeCloseTo(61.15, 1);
    expect(plaza.top).toBeCloseTo(47.86, 1);
    expect(exit.left).toBeGreaterThan(plaza.left);
    expect(Math.abs(exit.top - plaza.top)).toBeLessThan(1);
  });
});
