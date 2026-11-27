import { describe, expect, it } from 'vitest';
import {
  assignRanks,
  boardSummary,
  compactSolaris,
  filterEntries,
  formatSolaris,
} from '../../../src/features/solaris/model';

describe('Solaris model', () => {
  it('formats exact and compact amounts', () => {
    expect(formatSolaris('12533060')).toBe('12,533,060');
    expect(formatSolaris('-1500')).toBe('-1,500');
    expect(formatSolaris('abc')).toBe('—');
    expect(compactSolaris('12533060')).toBe('12.5M');
    expect(compactSolaris('999')).toBe('999');
    expect(compactSolaris('1000')).toBe('1K');
    expect(compactSolaris('250000000000')).toBe('250B');
  });

  it('ranks ties together and summarises the board', () => {
    const entries = assignRanks([
      { name: 'A', balance: '600' },
      { name: 'B', balance: '300' },
      { name: 'C', balance: '300' },
      { name: null, balance: '100' },
    ]);
    expect(entries.map((entry) => entry.rank)).toEqual([1, 2, 2, 4]);
    const summary = boardSummary(entries);
    expect(summary).toMatchObject({ ranked: 4, total: '1300', median: '300', topTenShare: 100 });
    expect(summary.top?.name).toBe('A');
    expect(filterEntries(entries, ' b ')).toHaveLength(1);
    expect(boardSummary([])).toMatchObject({ ranked: 0, total: '0', median: null, top: null, topTenShare: null });
  });
});
