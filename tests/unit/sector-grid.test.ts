import { describe, expect, it } from 'vitest';
import {
  createSectorGridOverlay,
  deepDesertSectorForWorldPoint,
  withMapSector,
} from '../../src/modules/map/utils/sectorGrid';

const deepDesert = {
  width: 8192,
  height: 8192,
  minX: -1_177_656,
  maxX: 1_072_344,
  minY: -1_177_066,
  maxY: 1_072_934,
  flipY: false,
};

describe('Deep Desert sector grid', () => {
  it('builds the complete API overlay in map-pixel coordinates', () => {
    const overlay = createSectorGridOverlay('DeepDesert', deepDesert);
    expect(overlay).toMatchObject({
      kind: 'deep-desert-sector-grid',
      rows: 9,
      columns: 9,
      sectorSize: 250_000,
    });
    expect(overlay?.lines).toHaveLength(20);
    expect(overlay?.labels).toHaveLength(81);
    expect(overlay?.labels[0]).toMatchObject({ text: 'A1' });
    expect(overlay?.labels.at(-1)).toMatchObject({ text: 'I9' });
  });

  it('matches the in-game sector orientation and boundary rules', () => {
    expect(deepDesertSectorForWorldPoint(-52_656, -52_066)).toBe('E5');
    expect(deepDesertSectorForWorldPoint(-1_177_655, 1_072_933)).toBe('A1');
    expect(deepDesertSectorForWorldPoint(1_072_343, -1_177_065)).toBe('I9');
    expect(deepDesertSectorForWorldPoint(1_072_344, -52_066)).toBeNull();
  });

  it('adds sectors only to Deep Desert API markers', () => {
    expect(withMapSector({ x: -52_656, y: -52_066 }, 'DeepDesert')).toMatchObject({ sector: 'E5' });
    expect(withMapSector({ x: 0, y: 0 }, 'HaggaBasin')).not.toHaveProperty('sector');
  });
});
