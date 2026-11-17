import { describe, expect, it } from 'vitest';
import { projectLocation } from '../../../src/features/map/utils/location-projection';

describe('location projection', () => {
  it('places the independently checked Arrakeen position within 12 pixels of the screenshot', () => {
    const point = projectLocation('Arrakeen', { x: -8854.25, y: -1166.21 });
    expect(point).not.toBeNull();
    expect(Math.abs(point!.left * 12 - 495.4)).toBeLessThan(12);
    expect(Math.abs((point!.top * 572) / 100 - 269.7)).toBeLessThan(12);
  });

  it('shows an approximate courtyard position and rejects positions outside the image', () => {
    expect(projectLocation('Arrakeen', { x: -15391, y: -1297 })).not.toBeNull();
    expect(projectLocation('Arrakeen', { x: -1000000, y: 0 })).toBeNull();
    expect(projectLocation('Arrakeen', { x: Number.NaN, y: 0 })).toBeNull();
    expect(projectLocation('HarkoVillage', { x: 1, y: 1 })).toBeNull();
    expect(projectLocation('Overland', { x: 1, y: 1 })).toBeNull();
  });
});
