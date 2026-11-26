import { describe, expect, it } from 'vitest';
import { projectRestartQueue } from '../../../src/features/monitoring/restart-queue';

describe('restart queue projection', () => {
  const entry = { id: 'r1', status: 'counting', target: 'map', mapLabel: 'Hagga', restartAt: 1_800_000_000_000 };
  it('exposes only bounded member-safe fields', () => {
    expect(projectRestartQueue({ state: { entries: [{ ...entry, requestedBy: 'private' }] } })).toEqual([entry]);
    expect(projectRestartQueue({ state: { entries: [] } })).toEqual([]);
  });
  it('rejects malformed, duplicate and unbounded provider data', () => {
    expect(projectRestartQueue({ state: { entries: [{ ...entry, restartAt: 'tomorrow' }] } })).toBeNull();
    expect(projectRestartQueue({ state: { entries: [entry, entry] } })).toBeNull();
    expect(projectRestartQueue({ state: { entries: Array(21).fill(entry) } })).toBeNull();
    expect(projectRestartQueue({})).toBeNull();
  });
});
