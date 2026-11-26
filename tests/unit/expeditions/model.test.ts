import { describe, expect, it } from 'vitest';
import {
  emptyPlan,
  estimateRoute,
  formatKm,
  PLAN_LIMITS,
  planDataSchema,
  planWriteSchema,
  sectorFor,
  type Bookmark,
  type PlanData,
} from '../../../src/features/expeditions/model';

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const bookmark = (n: number, x: number, y: number, map: Bookmark['map'] = 'HaggaBasin'): Bookmark => ({
  id: id(n),
  map,
  x,
  y,
  label: `Point ${n}`,
  note: '',
});
function plan(overrides: Partial<PlanData> = {}): PlanData {
  return { ...emptyPlan(), ...overrides };
}

describe('expedition plan schema', () => {
  it('accepts an empty plan and a complete cross-referenced plan', () => {
    expect(planDataSchema.safeParse(emptyPlan()).success).toBe(true);
    const full = plan({
      vehicles: [{ vehicleId: '22', nickname: 'Dusty', tags: ['scout', 'fast'], purpose: 'Survey runs' }],
      manifests: [
        { id: id(90), name: 'Trip', lines: [{ templateId: 'Water', name: 'Water', quantity: '99999999999999999' }] },
      ],
      bookmarks: [bookmark(1, 0, 0), bookmark(2, 300_000, 400_000)],
      routes: [{ id: id(50), name: 'Loop', map: 'HaggaBasin', waypointIds: [id(1), id(2)] }],
      journal: [
        {
          id: id(70),
          map: 'DeepDesert',
          x: null,
          y: null,
          title: 'Wreck',
          observation: '',
          checkedAt: '2026-11-25T10:00:00Z',
        },
      ],
      departure: {
        routeId: id(50),
        vehicleId: '22',
        manifestId: id(90),
        items: [{ id: id(80), label: 'Fuel', done: true }],
      },
    });
    expect(planDataSchema.safeParse(full).success).toBe(true);
  });

  it('rejects dangling, cross-map and duplicate references', () => {
    const base = plan({ bookmarks: [bookmark(1, 0, 0), bookmark(2, 1, 1, 'DeepDesert')] });
    const cases: PlanData[] = [
      { ...base, routes: [{ id: id(50), name: 'Cross', map: 'HaggaBasin', waypointIds: [id(1), id(2)] }] },
      { ...base, routes: [{ id: id(50), name: 'Ghost', map: 'HaggaBasin', waypointIds: [id(1), id(9)] }] },
      { ...base, departure: { ...base.departure, routeId: id(51) } },
      { ...base, departure: { ...base.departure, manifestId: id(52) } },
      { ...base, bookmarks: [bookmark(1, 0, 0), bookmark(1, 2, 2)] },
      {
        ...base,
        vehicles: [
          { vehicleId: '22', nickname: 'A', tags: [], purpose: '' },
          { vehicleId: '22', nickname: 'B', tags: [], purpose: '' },
        ],
      },
    ];
    for (const value of cases) expect(planDataSchema.safeParse(value).success).toBe(false);
  });

  it('bounds text, counts, quantities, coordinates and rejects owner fields', () => {
    const bad: unknown[] = [
      plan({ bookmarks: Array.from({ length: PLAN_LIMITS.bookmarks + 1 }, (_, n) => bookmark(n, 0, 0)) }),
      plan({ bookmarks: [{ ...bookmark(1, 0, 0), label: 'x'.repeat(61) }] }),
      plan({ bookmarks: [{ ...bookmark(1, 0, 0), x: Number.POSITIVE_INFINITY }] }),
      plan({ bookmarks: [{ ...bookmark(1, 0, 0), label: 'bell\u0007' }] }),
      plan({ manifests: [{ id: id(1), name: 'M', lines: [{ templateId: 'W', name: 'W', quantity: '0' }] }] }),
      plan({ manifests: [{ id: id(1), name: 'M', lines: [{ templateId: 'W', name: 'W', quantity: '1.5' }] }] }),
      plan({ vehicles: [{ vehicleId: '22', nickname: '', tags: ['a', 'A'], purpose: '' }] }),
      plan({ vehicles: [{ vehicleId: 'abc', nickname: '', tags: [], purpose: '' }] }),
      plan({ thresholds: { fuelPercent: 101, conditionPercent: 10 } }),
      { ...plan(), ownerId: 'foreign' },
    ];
    for (const value of bad) expect(planDataSchema.safeParse(value).success).toBe(false);
    expect(planWriteSchema.safeParse({ revision: 'bad', plan: emptyPlan() }).success).toBe(false);
    expect(planWriteSchema.safeParse({ revision: null, plan: emptyPlan(), userId: 'x' }).success).toBe(false);
  });
});

describe('route estimates', () => {
  it('sums straight-line legs in kilometres from centimetre world units', () => {
    const points = [bookmark(1, 0, 0), bookmark(2, 300_000, 400_000), bookmark(3, 300_000, 0)];
    const estimate = estimateRoute(
      { id: id(50), name: 'Loop', map: 'HaggaBasin', waypointIds: [id(1), id(2), id(3)] },
      points,
    );
    expect(estimate.legs.map((leg) => leg.km)).toEqual([5, 4]);
    expect(estimate.km).toBe(9);
    expect(estimate.missing).toBe(0);
    expect(formatKm(estimate.km)).toBe('9.00 km');
    expect(formatKm(12.345)).toBe('12.3 km');
  });

  it('counts missing or off-map waypoints instead of inventing a distance', () => {
    const estimate = estimateRoute(
      { id: id(50), name: 'Broken', map: 'HaggaBasin', waypointIds: [id(1), id(9), id(2)] },
      [bookmark(1, 0, 0), bookmark(2, 1, 1, 'DeepDesert')],
    );
    expect(estimate.legs).toHaveLength(0);
    expect(estimate.missing).toBe(2);
  });

  it('labels Deep Desert sectors only for Deep Desert coordinates', () => {
    expect(sectorFor('DeepDesert', -52_656, -52_066)).toBe('E5');
    expect(sectorFor('HaggaBasin', 0, 0)).toBeNull();
    expect(sectorFor('DeepDesert', null, null)).toBeNull();
  });
});
