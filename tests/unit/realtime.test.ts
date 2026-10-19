import { expect, it } from 'vitest';
import { normalizeRealtime } from '../../src/modules/map/utils/realtime';

it('keeps source indexes stable and separates map instances while rejecting invalid positions', () => {
  const object = { i: 1, k: 'worm', s: 2, x: 1, y: 2, z: 3 };
  const data = {
    gen: 1,
    t: 100,
    sources: [
      null,
      { map: 'Survival_1', partition: 1, ready: true },
      { map: 'DeepDesert_1', partition: 2, ready: true },
      { map: 'DeepDesert_1', partition: 3, ready: false },
    ],
    objects: [
      object,
      object,
      { ...object, i: 2, x: Infinity },
      { ...object, i: 3, s: 3 },
      { ...object, i: 4, s: 1 },
      { ...object, i: 5, s: 0 },
    ],
  };
  expect(normalizeRealtime(data, 'DeepDesert').markers).toHaveLength(1);
  expect(normalizeRealtime(data, 'DeepDesert').markers[0].partition).toBe(2);
  expect(normalizeRealtime(data, 'HaggaBasin').markers[0].id).toBe('realtime:1:4');
});

it('bounds snapshots and rejects unsafe numeric IDs', () => {
  expect(() =>
    normalizeRealtime({ gen: 1, t: 100, sources: Array(257).fill(null), objects: [] }, 'HaggaBasin'),
  ).toThrow();
  expect(
    normalizeRealtime(
      {
        gen: 1,
        t: 100,
        sources: [{ map: 'Survival_1', partition: 1, ready: true }],
        objects: [{ i: Number.MAX_SAFE_INTEGER + 1, k: 'worm', s: 0, x: 1, y: 2, z: 3 }],
      },
      'HaggaBasin',
    ).markers,
  ).toEqual([]);
});
