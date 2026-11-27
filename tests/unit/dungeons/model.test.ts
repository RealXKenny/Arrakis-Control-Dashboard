import { describe, expect, it } from 'vitest';
import {
  boardSummary,
  compareWithRecord,
  difficultyOptions,
  dungeonName,
  dungeonOptions,
  filterBoard,
  formatDuration,
  formatGap,
  freshnessLabel,
  paginate,
  type DungeonRecord,
} from '../../../src/features/dungeons/model';

const record = (dungeonId: string, difficulty: number, durationMs: number, runCount: number, names: string[]) =>
  ({
    runCount,
    best: {
      completionId: `${dungeonId}${difficulty}`,
      dungeonId,
      difficulty,
      durationMs,
      playerCount: names.length,
      party: names.map((name) => ({ name })),
    },
  }) satisfies DungeonRecord;
const records = [
  record('DA_Dgn_089_Radiation', 1, 900_000, 4, ['Chani']),
  record('DA_Dgn_089_Radiation', 2, 600_000, 9, ['Stilgar', 'Chani']),
  record('DA_Dgn_012_OldCistern', 1, 300_000, 1, ['Jessica']),
];

describe('dungeon model', () => {
  it('derives readable names from asset ids without guessing difficulty names', () => {
    expect(dungeonName('DA_Dgn_089_Radiation')).toBe('Radiation');
    expect(dungeonName('DA_Dgn_012_OldCistern')).toBe('Old Cistern');
    expect(dungeonName('Something_Else')).toBe('Something Else');
  });

  it('formats durations', () => {
    expect(formatDuration(754_300)).toBe('12:34.3');
    expect(formatDuration(3_723_000)).toBe('1:02:03.0');
    expect(formatDuration(-1)).toBe('—');
  });

  it('searches, filters and sorts records', () => {
    expect(filterBoard(records, { query: 'chani', dungeonId: null, difficulty: null, sort: 'dungeon' })).toHaveLength(
      2,
    );
    expect(
      filterBoard(records, { query: '', dungeonId: 'DA_Dgn_089_Radiation', difficulty: 2, sort: 'dungeon' }),
    ).toHaveLength(1);
    expect(
      filterBoard(records, { query: '', dungeonId: null, difficulty: null, sort: 'fastest' }).map(
        (entry) => entry.best.durationMs,
      ),
    ).toEqual([300_000, 600_000, 900_000]);
    expect(filterBoard(records, { query: '', dungeonId: null, difficulty: null, sort: 'runs' })[0].runCount).toBe(9);
    expect(
      filterBoard(records, { query: '', dungeonId: null, difficulty: null, sort: 'dungeon' })[0].best.dungeonId,
    ).toBe('DA_Dgn_012_OldCistern');
  });

  it('paginates within bounds and lists filter options', () => {
    expect(paginate([1, 2, 3, 4, 5], 9, 2)).toEqual({ items: [5], page: 2, pages: 3 });
    expect(paginate([], 0, 20)).toEqual({ items: [], page: 0, pages: 1 });
    expect(dungeonOptions(records).map((option) => option.name)).toEqual(['Old Cistern', 'Radiation']);
    expect(difficultyOptions(records)).toEqual([1, 2]);
  });

  it('never describes stale or cached data as current', () => {
    const now = 10 * 60_000;
    expect(freshnessLabel({ fetchedAt: now - 30_000, state: 'fresh', refreshFailed: false }, now)).toBe(
      'Updated less than a minute ago.',
    );
    expect(freshnessLabel({ fetchedAt: now - 6 * 60_000, state: 'stale', refreshFailed: false }, now)).toContain(
      'refresh is on the way',
    );
    expect(freshnessLabel({ fetchedAt: 0, state: 'stale', refreshFailed: true }, now)).toContain(
      'last good reading from 10 minutes ago',
    );
  });

  it('filters records by the size of the party that set them', () => {
    const base = { query: '', dungeonId: null, difficulty: null, sort: 'dungeon' as const };
    expect(filterBoard(records, { ...base, party: 'solo' })).toHaveLength(2);
    expect(filterBoard(records, { ...base, party: 'duo' })).toHaveLength(1);
    expect(filterBoard(records, { ...base, party: 'group' })).toHaveLength(0);
    expect(filterBoard(records, { ...base, party: 'any' })).toHaveLength(3);
  });

  it('summarises the board: coverage, fastest clear, most run and top record holders', () => {
    const summary = boardSummary(records);
    expect(summary).toMatchObject({ dungeons: 2, records: 3, totalRuns: 14 });
    expect(summary.fastest?.best.dungeonId).toBe('DA_Dgn_012_OldCistern');
    expect(summary.busiest?.runCount).toBe(9);
    expect(summary.holders).toEqual([
      { name: 'Chani', records: 2 },
      { name: 'Jessica', records: 1 },
      { name: 'Stilgar', records: 1 },
    ]);
    expect(boardSummary([])).toMatchObject({ records: 0, fastest: null, busiest: null, holders: [] });
  });

  it('compares a run with the server record for the same dungeon and difficulty', () => {
    const own = { ...records[1].best, completionId: 'mine', durationMs: 612_300 };
    expect(compareWithRecord(own, records)).toEqual({ recordMs: 600_000, gapMs: 12_300, holdsRecord: false });
    expect(compareWithRecord(records[1].best, records)?.holdsRecord).toBe(true);
    expect(compareWithRecord({ ...own, dungeonId: 'DA_Dgn_999_Unknown' }, records)).toBeNull();
    expect(formatGap(12_300)).toBe('+0:12.3');
    expect(formatGap(0)).toBe('0:00.0');
  });
});
