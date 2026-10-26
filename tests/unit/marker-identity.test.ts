import { describe, expect, it } from 'vitest';
import { markerKey } from '../../src/modules/map/utils/markers';

describe('map marker identity', () => {
  it('preserves a named object across snapshot reordering and movement', () => {
    expect(markerKey({ id: 'realtime:0:5', type: 'worm', x: 10 }, 0)).toBe(
      markerKey({ id: 'realtime:0:5', type: 'worm', x: 50 }, 8),
    );
    expect(markerKey({ base_id: 'home', type: 'base' }, 0)).toBe(markerKey({ base_id: 'home', type: 'base' }, 3));
    expect(markerKey({ id: 'same', type: 'base' }, 0)).not.toBe(markerKey({ id: 'same', type: 'player' }, 0));
    expect(markerKey({}, 0)).not.toBe(markerKey({}, 1));
  });
});
