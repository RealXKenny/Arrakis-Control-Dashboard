import { describe, expect, it } from 'vitest';
import { markerKey, uniqueMapMarkers } from '../../src/modules/map/utils/markers';

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

describe('provider location collisions', () => {
  it('distinguishes template IDs at different locations and collapses repeated places', () => {
    const first = { id: '175593317', type: 'poi', subtype: 'cave', x: 100, y: 200 };
    const second = { ...first, x: 300 };
    expect(markerKey(first, 0)).not.toBe(markerKey(second, 0));
    expect(markerKey(first, 0)).toBe(markerKey({ ...first, x: '100' }, 99));
    expect(uniqueMapMarkers([first, second, { ...first }])).toHaveLength(2);
    expect(new Set(uniqueMapMarkers([second, first]).map(markerKey))).toEqual(
      new Set([markerKey(first), markerKey(second)]),
    );
  });
  it('keeps moving objects stable but separates instances', () => {
    const live = { id: 'same', type: 'worm', realtime: true, partition: 1, x: 100, y: 200 };
    expect(markerKey(live)).toBe(markerKey({ ...live, x: 999 }));
    expect(markerKey(live)).not.toBe(markerKey({ ...live, partition: 2 }));
  });
});
