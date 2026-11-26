import { describe, expect, it } from 'vitest';
import { departureChecks } from '../../../src/features/expeditions/departure';
import { emptyPlan, type PlanData } from '../../../src/features/expeditions/model';
import { normalizeFleetRow } from '../../../src/features/vehicles/fleet';

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const now = Date.parse('2026-11-26T00:00:00Z');
const plan: PlanData = {
  ...emptyPlan(),
  bookmarks: [
    { id: id(1), map: 'DeepDesert', x: 0, y: 0, label: 'Gate', note: '' },
    { id: id(2), map: 'DeepDesert', x: 0, y: 500_000, label: 'Wreck', note: '' },
  ],
  routes: [{ id: id(10), name: 'Run', map: 'DeepDesert', waypointIds: [id(1), id(2)] }],
  manifests: [{ id: id(20), name: 'Kit', lines: [{ templateId: 'Water', name: 'Water', quantity: '10' }] }],
  departure: {
    routeId: id(10),
    vehicleId: '22',
    manifestId: id(20),
    items: [{ id: id(30), label: 'Repair kit', done: false }],
  },
};
const vehicle = normalizeFleetRow(
  { id: '22', name: 'Scout', fuel_percent: 80, condition_percent: 90, lifecycle_state: 'Default', modules: [] },
  '22',
  1,
);
const status = (nextCycleAt: string | null, staleSince: string | null = null) => ({
  available: true,
  nextCycleAt,
  layout: 4,
  staleSince,
  checkedAt: '2026-11-26T00:00:00Z',
});
const state = (checks: ReturnType<typeof departureChecks>, key: string) => checks.find((c) => c.id === key)?.state;

describe('Deep Desert departure checks', () => {
  it('reports ready only when every derived reading supports it', () => {
    const checks = departureChecks({
      plan,
      status: status('2026-11-26T12:00:00Z'),
      vehicle,
      cargo: {
        vehicleId: '22',
        totals: [{ templateId: 'Water', name: 'Water', quantity: '10', exact: true }],
        usedSlots: null,
        maxSlots: null,
        currentVolume: null,
        maxVolume: null,
        volumeComplete: false,
        limited: false,
        observedAt: '2026-11-26T00:00:00Z',
      },
      now,
      tripHours: 3,
    });
    expect(['cycle', 'route', 'vehicle', 'cargo'].map((key) => state(checks, key))).toEqual([
      'ready',
      'ready',
      'ready',
      'ready',
    ]);
    expect(checks.find((c) => c.id === 'route')?.detail).toContain('5.00 km');
    expect(state(checks, id(30))).toBe('attention');
  });

  it('keeps missing cycle, vehicle and cargo readings unknown rather than ready', () => {
    const checks = departureChecks({ plan, status: null, vehicle: null, cargo: null, now, tripHours: 3 });
    expect(state(checks, 'cycle')).toBe('unknown');
    expect(state(checks, 'vehicle')).toBe('unknown');
    expect(state(checks, 'cargo')).toBe('unknown');
  });

  it('flags a cycle inside the trip window, a stale seed and unreported fuel', () => {
    expect(
      state(
        departureChecks({ plan, status: status('2026-11-26T01:00:00Z'), vehicle, cargo: null, now, tripHours: 3 }),
        'cycle',
      ),
    ).toBe('attention');
    expect(
      state(
        departureChecks({
          plan,
          status: status('2026-11-27T00:00:00Z', '2026-11-25T00:00:00Z'),
          vehicle,
          cargo: null,
          now,
          tripHours: 3,
        }),
        'cycle',
      ),
    ).toBe('attention');
    const unknownFuel = { ...vehicle, fuelPercent: null };
    expect(
      state(departureChecks({ plan, status: null, vehicle: unknownFuel, cargo: null, now, tripHours: 3 }), 'vehicle'),
    ).toBe('unknown');
    const stored = { ...vehicle, lifecycle: 'stored-recovery' as const };
    expect(
      state(departureChecks({ plan, status: null, vehicle: stored, cargo: null, now, tripHours: 3 }), 'vehicle'),
    ).toBe('attention');
  });
});
