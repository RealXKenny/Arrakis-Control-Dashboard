import { describe, expect, it } from 'vitest';
import { timeRemaining, worldReading } from '../../src/modules/portal/utils/world';

describe('dashboard world readings', () => {
  it('only exposes public aggregates and ignores non-spice actors', () => {
    const result = worldReading(
      'DeepDesert',
      {
        capabilities: { spice_active: true },
        coriolisNextCycleAt: '2026-09-08T11:00:00Z',
        rows: [
          { type: 'player', account_id: 'private' },
          { type: 'spice_active', sector: 'D5' },
          { type: 'spice_active', sector: 'D5' },
          { type: 'spice_active', sector: 'invalid' },
        ],
      },
      { totalListings: 0, uniqueItems: 0, playerListings: 0 },
      {
        term: { term_id: '3', end_time: '2026-09-08T10:55:00Z' },
        tasks: [{ completed: true }, { completed: false }, { completed: true, sysselraad: true }],
        playerContributions: [{ account_id: 'private' }],
      },
    );
    expect(result.spice).toEqual({ count: 3, sectors: ['D5'] });
    expect(result.council).toMatchObject({ term: '3', decided: 1, total: 2 });
    expect(result.market?.listings).toBe(0);
    expect(JSON.stringify(result)).not.toMatch(/private|account_id|playerContributions/);
  });
  it('distinguishes unsupported or failed sources from empty results', () => {
    expect(worldReading('DeepDesert', null, null, null)).toMatchObject({
      spice: null,
      council: null,
      market: null,
      nextCycleAt: null,
    });
    expect(
      worldReading(
        'DeepDesert',
        { capabilities: { spice_active: false }, rows: [] },
        { capabilities: { exchange: false } },
        null,
      ).spice,
    ).toBeNull();
    expect(worldReading('DeepDesert', { capabilities: { spice_active: true }, rows: [] }, null, null).spice).toEqual({
      count: 0,
      sectors: [],
    });
  });
  it('never presents an elapsed or missing cycle as an active storm', () => {
    expect(timeRemaining(null, 0)).toBe('Not reported');
    expect(timeRemaining('invalid', 0)).toBe('Not reported');
    expect(timeRemaining('2026-09-08T11:00:00Z', Date.parse('2026-09-08T12:00:00Z'))).toBe('Awaiting update');
    expect(timeRemaining('2026-09-08T11:00:00Z', Date.parse('2026-09-07T10:00:00Z'))).toBe('1d 1h 0m');
  });
});
