import { expect, it } from 'vitest';
import { projectRestartHistory } from '../../../src/features/monitoring/restart-history';

it('exposes confirmed bounded restart records without operator details', () => {
  const row = {
    id: 'one',
    startedAt: '2026-11-16T00:00:00Z',
    finishedAt: '2026-11-16T00:01:00Z',
    durationSeconds: 60,
    scope: 'map',
    map: 'Hagga',
    result: 'Succeeded',
  };
  expect(projectRestartHistory({ rows: [{ ...row, reason: 'private' }] })).toEqual([row]);
  expect(projectRestartHistory({ rows: [{ ...row, finishedAt: '2026-11-15T23:59:00Z' }] })).toBeNull();
  expect(projectRestartHistory({ rows: [row, row] })).toBeNull();
  expect(projectRestartHistory({ rows: Array(101).fill(row) })).toBeNull();
});
