import { expect, it } from 'vitest';
import catalog from '../../../src/features/admin/catalog.json' with { type: 'json' };
import { freshness, readingRows } from '../../../src/app/(workspace)/admin/_components/screens/StatisticsScreen';
import type { AdminOverview } from '../../../src/features/admin/overview';
import type { AdminOperation } from '../../../src/features/admin/types';

const operations = catalog as AdminOperation[];
const base: AdminOverview = {
  observedAt: '2026-11-05T23:00:00.000Z',
  metrics: [
    { id: 'online', label: 'Players online', value: 0, operation: 'get-players-online' },
    { id: 'players', label: 'Total players', value: null, operation: 'get-players' },
    { id: 'cpu', label: 'CPU usage', value: 24.5, unit: '%', operation: 'get-server-performance' },
    { id: 'guilds', label: 'Guilds', value: 3, operation: 'get-guilds' },
    { id: 'bases', label: 'Bases', value: 9, operation: 'get-bases' },
  ],
  services: [],
  sources: [
    { operation: 'get-players-online', label: 'Online', state: 'ready', status: 200, durationMs: 5 },
    { operation: 'get-players', label: 'Players', state: 'ready', status: 200, durationMs: 5 },
    { operation: 'get-server-performance', label: 'Perf', state: 'ready', status: 200, durationMs: 5 },
    { operation: 'get-guilds', label: 'Guilds', state: 'error', status: 403, durationMs: 5, error: 'Missing scope.' },
    { operation: 'get-bases', label: 'Bases', state: 'unconfigured', status: null, durationMs: 0 },
  ],
  setup: [],
};

it('keeps a genuine zero distinct from unavailable, failed and unconfigured readings', () => {
  const rows = Object.fromEntries(readingRows(base, operations).map((row) => [row.label, row]));
  expect(rows['Players online']).toMatchObject({ value: '0', state: 'Available' });
  expect(rows['Total players']).toMatchObject({ value: '—', state: 'Not reported' });
  expect(rows['CPU usage']).toMatchObject({
    value: '24.5%',
    state: 'Available',
    source: 'Performance snapshot (CPU, memory, disk)',
  });
  expect(rows['Guilds']).toMatchObject({ value: '—', state: 'Source failed', note: 'Missing scope.' });
  expect(rows['Bases']).toMatchObject({ value: '—', state: 'Not configured' });
});

it('describes freshness without rounding a reading to look newer', () => {
  expect(freshness(1_000, 1_000)).toBe('0 s ago');
  expect(freshness(0, 45_000)).toBe('45 s ago');
  expect(freshness(0, 5 * 60_000)).toBe('5 min ago');
  expect(freshness(0, 2 * 3_600_000)).toBe('2 h ago');
  expect(freshness(10_000, 0)).toBe('0 s ago');
});
