import { describe, expect, it } from 'vitest';
import {
  groupDigits,
  highlightOf,
  journeyRecap,
  recapYear,
  shortDate,
  summarizeReleases,
  type DatedRelease,
} from '../../../src/features/unwrapped/model';

const release = (
  project: 'bot' | 'dashboard',
  version: string,
  date: string,
  sections: DatedRelease['sections'],
): DatedRelease => ({ project, version, date, sections });

describe('Unwrapped model', () => {
  it('reviews the current UTC year', () => {
    expect(recapYear(Date.UTC(2026, 11, 31, 23, 59))).toBe(2026);
    expect(recapYear(Date.UTC(2027, 0, 1))).toBe(2027);
  });

  it('names a changelog bullet by its bold lead or the text before the colon', () => {
    expect(highlightOf('**Solaris leaderboard** (`/solaris`, under Community): ranked characters')).toBe(
      'Solaris leaderboard',
    );
    expect(highlightOf('Instant updates: the update supervisor can install a release')).toBe('Instant updates');
    expect(highlightOf('Uses `npm` and [docs](https://example.test).')).toBe('Uses npm and docs');
    const long = highlightOf('word '.repeat(40));
    expect(long.length).toBeLessThanOrEqual(81);
    expect(long.endsWith('…')).toBe(true);
  });

  it('counts only dated releases from the reviewed year', () => {
    const summary = summarizeReleases(
      [
        release('dashboard', '2.0.0', '2026-11-25', [
          { title: 'New Features', items: ['**A**: a', '**B**: b'] },
          { title: 'Fixes', items: ['x'] },
        ]),
        release('bot', '2.0.1', '2026-11-26', [
          { title: 'Added', items: ['One: 1', 'Two: 2', 'Three: 3', 'Four: 4'] },
          { title: 'Changed', items: ['c'] },
          { title: 'Fixed', items: ['f', 'g'] },
        ]),
        release('dashboard', '2.0.10', '2026-11-26', []),
        release('bot', '1.9.0', '2025-12-30', [{ title: 'Added', items: ['old'] }]),
        release('dashboard', '2.0.3', '', [{ title: 'New Features', items: ['unreleased'] }]),
      ],
      2026,
    );
    expect(summary).toMatchObject({
      total: 3,
      bot: 1,
      dashboard: 2,
      features: 6,
      improvements: 1,
      fixes: 3,
      first: { project: 'dashboard', version: '2.0.0', date: '2026-11-25' },
      latest: { project: 'dashboard', version: '2.0.10' },
      biggest: { project: 'bot', version: '2.0.1', highlights: ['One', 'Two', 'Three'] },
    });
    expect(summarizeReleases([release('bot', '1.0.0', '2025-01-01', [])], 2026)).toBeNull();
  });

  it('reports journal change only between observations recorded in the year', () => {
    const snapshots = [
      { at: '2025-12-31T10:00:00.000Z', level: '10', xp: '100', journey: { story: 1 } },
      { at: '2026-02-01T10:00:00.000Z', level: '12', xp: '500', journey: { story: 2, side: 1 } },
      { at: '2026-11-20T10:00:00.000Z', level: '31', xp: '98000', journey: { story: 9, side: 4 } },
    ];
    expect(journeyRecap(snapshots, 2026)).toEqual({
      from: '2026-02-01T10:00:00.000Z',
      to: '2026-11-20T10:00:00.000Z',
      observations: 2,
      levelFrom: '12',
      levelTo: '31',
      xpGained: '97500',
      journeySteps: 10,
    });
    expect(journeyRecap(snapshots.slice(0, 2), 2026)).toBeNull();
    expect(journeyRecap([snapshots[1]!, { ...snapshots[2]!, xp: null, journey: null }], 2026)).toMatchObject({
      xpGained: null,
      journeySteps: null,
    });
  });

  it('formats exact numbers and calendar dates', () => {
    expect(groupDigits('12533060')).toBe('12,533,060');
    expect(groupDigits('-1000')).toBe('-1,000');
    expect(groupDigits('1.5')).toBe('—');
    expect(shortDate('2026-11-25')).toBe('25 Nov');
    expect(shortDate('2026-01-01T00:30:00.000Z')).toBe('1 Jan');
  });
});
