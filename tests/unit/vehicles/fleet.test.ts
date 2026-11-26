import { describe, expect, it } from 'vitest';
import {
  compareComponents,
  compareManifest,
  lifecycleFrom,
  maintenanceInbox,
  normalizeFleetRow,
  type CargoReading,
  type FleetVehicle,
} from '../../../src/features/vehicles/fleet';

const row = (overrides: Record<string, unknown> = {}) => ({
  id: '22',
  name: 'Scout',
  type: 'Ornithopter',
  condition_percent: 64,
  fuel_percent: 80,
  map: 'HaggaBasin',
  partition_id: 3,
  region: 'Vermilius Gap',
  x: 1000.4,
  y: -2000.6,
  lifecycle_state: 'Default',
  modules: [
    { name: 'Engine', templateId: 'Engine_T3', conditionPercent: 64 },
    { name: 'Hull', templateId: 'Hull_T3', conditionPercent: null },
    { name: 'Wing', templateId: 'Wing_T3', conditionPercent: 90, maxInferred: true },
  ],
  ...overrides,
});
const vehicle = (overrides: Partial<FleetVehicle> = {}): FleetVehicle => ({
  ...normalizeFleetRow(row(), overrides.id ?? '22', 1),
  ...overrides,
});

describe('fleet normalization', () => {
  it('keeps unknown readings null and flags inferred maximums', () => {
    const value = normalizeFleetRow(row({ fuel_percent: null, condition_percent: 'n/a' }), '22', 2);
    expect(value.fuelPercent).toBeNull();
    expect(value.conditionPercent).toBeNull();
    expect(value.relationship).toBe('co-owner');
    expect(value.components[1].conditionPercent).toBeNull();
    expect(value.conditionEstimated).toBe(true);
    expect(value.position).toEqual({ x: 1000.4, y: -2000.6 });
  });

  it('never presents stored or in-transit records as a deployed position', () => {
    for (const state of ['Travel', 'VehicleBackup', 'VehicleRecovery']) {
      const value = normalizeFleetRow(row({ lifecycle_state: state, stored_at: '2026-11-20T00:00:00Z' }), '22', 1);
      expect(value.position).toBeNull();
      expect(value.lifecycle).not.toBe('deployed');
    }
    expect(normalizeFleetRow(row({ lifecycle_state: 'VehicleRecovery', stored_at: 'x' }), '22', 1).storedAt).toBeNull();
    expect(normalizeFleetRow(row({ lifecycle_state: undefined, partition_id: null }), '22', 1).position).toBeNull();
    expect(lifecycleFrom('AbortedAuthorityTransfer')).toBe('unknown');
  });

  it('rejects out-of-range percentages and bounds components', () => {
    const modules = Array.from({ length: 30 }, (_, n) => ({ name: `Part ${n}`, conditionPercent: 150 }));
    const value = normalizeFleetRow(row({ modules, fuel_percent: -3 }), '22', 3);
    expect(value.components).toHaveLength(24);
    expect(value.componentsLimited).toBe(true);
    expect(value.components[0].conditionPercent).toBeNull();
    expect(value.fuelPercent).toBeNull();
    expect(value.relationship).toBe('associate');
  });
});

describe('maintenance inbox', () => {
  const thresholds = { fuelPercent: 25, conditionPercent: 40 };
  it('orders urgent fuel first, then weakest components, and lists unknown readings separately', () => {
    const items = maintenanceInbox(
      [
        vehicle({ id: '1', name: 'Healthy', fuelPercent: 90 }),
        vehicle({
          id: '2',
          name: 'Worn',
          fuelPercent: 70,
          components: [{ name: 'Hull', templateId: 'H', conditionPercent: 35, estimated: false }],
        }),
        vehicle({ id: '3', name: 'Dry', fuelPercent: 10 }),
        vehicle({ id: '4', name: 'Silent', fuelPercent: null }),
        vehicle({
          id: '5',
          name: 'Broken',
          fuelPercent: 60,
          components: [{ name: 'Engine', templateId: 'E', conditionPercent: 5, estimated: false }],
        }),
      ],
      thresholds,
    );
    expect(items.map((item) => [item.vehicle.name, item.severity])).toEqual([
      ['Dry', 'urgent'],
      ['Broken', 'urgent'],
      ['Worn', 'watch'],
      ['Silent', 'unknown'],
    ]);
    expect(items[3].reasons).toContain('Fuel reading unknown');
  });
});

describe('component comparison', () => {
  it('marks the weakest reported reading and never an unknown one', () => {
    const rows = compareComponents([
      vehicle({ id: '1' }),
      vehicle({
        id: '2',
        components: [
          { name: 'Engine', templateId: 'E', conditionPercent: 30, estimated: false },
          { name: 'Hull', templateId: 'H', conditionPercent: 50, estimated: false },
        ],
      }),
    ]);
    const engine = rows.find((entry) => entry.name === 'Engine')!;
    expect(engine.readings.map((reading) => reading.weakest)).toEqual([false, true]);
    const hull = rows.find((entry) => entry.name === 'Hull')!;
    expect(hull.readings.map((reading) => [reading.percent, reading.weakest])).toEqual([
      [null, false],
      [50, false],
    ]);
  });
});

describe('cargo manifest comparison', () => {
  const cargo = (overrides: Partial<CargoReading> = {}): CargoReading => ({
    vehicleId: '22',
    totals: [{ templateId: 'water', name: 'Water', quantity: '9007199254740993', exact: true }],
    usedSlots: 1,
    maxSlots: 10,
    currentVolume: null,
    maxVolume: null,
    volumeComplete: false,
    limited: false,
    observedAt: '2026-11-26T00:00:00Z',
    ...overrides,
  });
  const manifest = {
    id: '00000000-0000-4000-8000-000000000001',
    name: 'Trip',
    lines: [
      { templateId: 'Water', name: 'Water', quantity: '9007199254740995' },
      { templateId: 'Fuel', name: 'Fuel', quantity: '5' },
    ],
  };
  it('compares exact strings with BigInt and reports shortfalls', () => {
    expect(compareManifest(manifest, cargo())).toEqual([
      expect.objectContaining({ loaded: '9007199254740993', shortfall: '2', status: 'short' }),
      expect.objectContaining({ loaded: '0', shortfall: '5', status: 'short' }),
    ]);
  });
  it('treats partial or inexact readings as unknown instead of short', () => {
    expect(compareManifest(manifest, cargo({ limited: true })).map((line) => line.status)).toEqual([
      'unknown',
      'unknown',
    ]);
    const inexact = cargo({ totals: [{ templateId: 'Water', name: 'Water', quantity: '1', exact: false }] });
    expect(compareManifest(manifest, inexact)[0].status).toBe('unknown');
  });
});
