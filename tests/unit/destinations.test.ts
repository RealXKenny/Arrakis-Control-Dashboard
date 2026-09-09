import { expect, it } from 'vitest';
import { normalizeMapDestinations } from '../../src/modules/map/utils/destinations';
import { portalNavigation } from '../../src/modules/portal/config/navigation';

it('keeps multiple named sietches and deep-desert partitions distinct', () => {
  const destinations = normalizeMapDestinations(
    {
      sietches: [
        { id: '101', name: 'Red Chasm' },
        { id: '102', name: 'Wind Pass' },
      ],
    },
    { dimensions: { '101': { map: 'HaggaBasin', displayName: 'Red Chasm' }, '102': { map: 'HaggaBasin' } } },
    { partitions: [{ partitionId: 'dd-1', displayName: 'Coriolis North' }, { partitionId: 'dd-2' }] },
  );
  expect(destinations.map(({ label, partitionId }) => [label, partitionId])).toEqual([
    ['Coriolis North', 'dd-1'],
    ['Deep Desert dd-2', 'dd-2'],
    ['Red Chasm', '101'],
    ['Wind Pass', '102'],
  ]);
  expect(new Set(destinations.map((entry) => entry.key)).size).toBe(4);
});

it('uses a single safe fallback Deep Desert destination for status-only responses', () => {
  expect(normalizeMapDestinations([], [], { enabled: true })).toEqual([
    expect.objectContaining({ label: 'Deep Desert', map: 'DeepDesert', partitionId: null }),
  ]);
});

it('includes every Hagga Basin partition when the sietches endpoint returns only one', () => {
  const destinations = normalizeMapDestinations(
    [
      { partition_id: 1, name: 'Stale Sietch Name', alive: false, ready: false },
      { operation: 'sietchesStatus', stdout: 'healthy' },
    ],
    {
      dimensions: {
        '1': { partition_pvp_enabled: false },
        '32': { partition_pvp_enabled: false },
        '35': { partition_pvp_enabled: false, partition_pve_enabled: true },
        '36': { partition_pvp_enabled: false, partition_pve_enabled: true },
      },
    },
    { operation: 'deepdesertStatus' },
    {
      rows: [
        { map: 'DeepDesert', partition_id: 8, name: 'PvE', alive: true, ready: true },
        { map: 'DeepDesert', partition_id: 31, name: 'PvP', alive: true, ready: true },
        { map: 'HaggaBasin', partition_id: 1, name: 'Abbir', alive: true, ready: true },
        { map: 'HaggaBasin', partition_id: 32, name: 'Alraab', alive: true, ready: false },
        { map: 'HaggaBasin', partition_id: 35, name: 'Barkan', alive: true, ready: true },
        { map: 'HaggaBasin', partition_id: 36, name: 'Coanua', alive: true, ready: true },
      ],
    },
    [
      {
        map: 'Survival_1',
        mapState: 'MIXED',
        partitions: [
          { partitionId: '1', configuredState: 'PVE' },
          { partitionId: '32', configuredState: 'PVE' },
          { partitionId: '35', configuredState: 'PVP' },
          { partitionId: '36', configuredState: 'PVP' },
        ],
      },
      {
        map: 'DeepDesert_1',
        mapState: 'MIXED',
        partitions: [
          { partitionId: '8', configuredState: 'PVE' },
          { partitionId: '31', configuredState: 'PVP' },
        ],
      },
    ],
  );

  expect(
    destinations.filter((entry) => entry.kind === 'sietch').map((entry) => [entry.label, entry.partitionId]),
  ).toEqual([
    ['Abbir', '1'],
    ['Alraab', '32'],
    ['Barkan', '35'],
    ['Coanua', '36'],
  ]);
  expect(destinations.filter((entry) => entry.kind === 'deep-desert')).toHaveLength(2);
  expect(destinations.filter((entry) => entry.kind === 'sietch').map((entry) => entry.type)).toEqual([
    'PvE',
    'PvE',
    'PvP',
    'PvP',
  ]);
  expect(destinations.filter((entry) => entry.kind === 'deep-desert').map((entry) => entry.type)).toEqual([
    'PvE',
    'PvP',
  ]);
  expect(destinations.some((entry) => entry.label === 'Sietch')).toBe(false);
  expect(destinations.find((entry) => entry.label === 'Alraab')?.active).toBe(false);
  expect(destinations.find((entry) => entry.label === 'Abbir')?.active).toBe(true);

  const mapNavigation = portalNavigation('hagga', undefined, destinations).filter((item) =>
    ['Sietches', 'Deep Deserts'].includes(item.group),
  );
  expect(mapNavigation.map((item) => [item.label, item.destinationType])).toEqual([
    ['Deep Desert - PvE', 'PvE'],
    ['Deep Desert - PvP', 'PvP'],
    ['Abbir', 'PvE'],
    ['Alraab', 'PvE'],
    ['Barkan', 'PvP'],
    ['Coanua', 'PvP'],
  ]);
  expect(mapNavigation.find((item) => item.label === 'Alraab')?.destinationStatus).toBe(false);
});
