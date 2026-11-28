import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  board: vi.fn(),
  prizes: '300,200,100',
  getBalance: vi.fn(),
  adjust: vi.fn(),
  delivery: vi.fn(() => true),
}));
vi.mock('../../../src/lib/redis/client', () => ({ getRedisClient: () => null }));
vi.mock('../../../src/lib/security/audit', () => ({ recordAudit: vi.fn(async () => undefined) }));
vi.mock('../../../src/config/env', () => ({
  getServerEnv: () => ({ LOG_LEVEL: 'FATAL', NODE_ENV: 'test', SOLARIS_WEEKLY_PRIZES: mocks.prizes }),
}));
vi.mock('../../../src/features/solaris/server/leaderboard', () => ({ readSolarisBoard: mocks.board }));
vi.mock('../../../src/features/casino/server/console-gateway', () => ({
  consoleGateway: { getBalance: mocks.getBalance, adjust: mocks.adjust },
  isOffline: (value: unknown) => value === 'Offline',
}));
vi.mock('../../../src/features/seasons/server/delivery-gateway', () => ({ deliveryAvailable: mocks.delivery }));

import {
  WEEK_MS,
  isWeekId,
  loadCredits,
  loadWeek,
  resetWeeklyForTests,
  standings,
  tickWeekly,
  weekId,
  weekStart,
} from '../../../src/features/solaris/server/weekly';
import { claimPrize, prizesFor, resetPrizesForTests } from '../../../src/features/solaris/server/prizes';

// Monday 2026-11-23 00:00 UTC.
const MONDAY = Date.UTC(2026, 10, 23);
const row = (id: string, name: string, balance: number) => ({
  id,
  name,
  bank: String(balance),
  coins: '0',
  balance: String(balance),
});
function serve(at: number, rows: ReturnType<typeof row>[]) {
  mocks.board.mockResolvedValue({
    data: { rows, players: rows.length, unreadable: 0, truncated: false },
    fetchedAt: at,
    attemptedAt: at,
    state: 'fresh',
    refreshFailed: false,
  });
}

beforeEach(() => {
  resetWeeklyForTests();
  resetPrizesForTests();
  mocks.board.mockReset();
  mocks.getBalance.mockReset();
  mocks.adjust.mockReset();
  mocks.delivery.mockReturnValue(true);
  mocks.prizes = '300,200,100';
});

describe('weeks', () => {
  it('start on Monday 00:00 UTC', () => {
    expect(weekStart(MONDAY + 3 * 86_400_000 + 5_000)).toBe(MONDAY);
    expect(weekStart(MONDAY - 1)).toBe(MONDAY - WEEK_MS);
    expect(weekId(MONDAY)).toBe('2026-11-23');
    expect(isWeekId('2026-11-23')).toBe(true);
    expect(isWeekId('2026-13-01')).toBe(false);
    expect(isWeekId('../x')).toBe(false);
  });
});

describe('weekly standings', () => {
  it('ranks by Solaris gained since the week started and closes the week with prizes', async () => {
    serve(MONDAY + 60_000, [row('1', 'Chani', 1000), row('2', 'Stilgar', 5000), row('3', 'Jamis', 10)]);
    await tickWeekly(MONDAY + 60_000);
    serve(MONDAY + 3 * 86_400_000, [
      row('1', 'Chani', 1600),
      row('2', 'Stilgar', 5100),
      row('3', 'Jamis', 5),
      row('4', 'Newcomer', 900),
    ]);
    await tickWeekly(MONDAY + 3 * 86_400_000);
    const week = (await loadWeek('2026-11-23'))!;
    expect(standings(week, {}).map((entry) => [entry.name, entry.gain])).toEqual([
      ['Chani', '600'],
      ['Stilgar', '100'],
    ]);

    // Next week: the old week closes after its grace period; the new week starts from the last reading.
    const next = MONDAY + WEEK_MS;
    serve(next + 20 * 60_000, [row('1', 'Chani', 1700), row('2', 'Stilgar', 5100)]);
    const result = await tickWeekly(next + 20 * 60_000);
    expect(result.closed).toBe(1);
    const closed = (await loadWeek('2026-11-23'))!;
    expect(closed.closed!.winners).toEqual([
      { place: 1, id: '1', name: 'Chani', gain: '600', prize: '300' },
      { place: 2, id: '2', name: 'Stilgar', gain: '100', prize: '200' },
    ]);
    const current = (await loadWeek(weekId(next)))!;
    expect(current.baseline['1']).toBe('1600');
    expect(standings(current, {})[0]).toMatchObject({ id: '1', gain: '100' });
    // Running again changes nothing.
    expect(await tickWeekly(next + 20 * 60_000)).toEqual({ recorded: 0, closed: 0 });
  });
});

describe('weekly prizes', () => {
  async function closedWeek() {
    serve(MONDAY + 60_000, [row('1', 'Chani', 1000)]);
    await tickWeekly(MONDAY + 60_000);
    serve(MONDAY + 86_400_000, [row('1', 'Chani', 2000)]);
    await tickWeekly(MONDAY + 86_400_000);
    serve(MONDAY + WEEK_MS + 20 * 60_000, [row('1', 'Chani', 2000)]);
    await tickWeekly(MONDAY + WEEK_MS + 20 * 60_000);
  }
  const later = MONDAY + WEEK_MS + 86_400_000;

  it('pays the winner once, offline only, and keeps the prize out of the next week', async () => {
    await closedWeek();
    expect(await prizesFor('1', later)).toEqual([
      { weekId: '2026-11-23', place: 1, amount: '300', state: 'available' },
    ]);
    await expect(claimPrize('2026-11-23', { pawnId: '1', onlineStatus: 'Online' }, 'u', later)).rejects.toThrow(
      /Log out/,
    );
    await expect(claimPrize('2026-11-23', { pawnId: '2', onlineStatus: 'Offline' }, 'u', later)).rejects.toThrow(
      /did not win/,
    );
    mocks.getBalance.mockResolvedValue(2000n);
    mocks.adjust.mockResolvedValue('applied');
    expect(await claimPrize('2026-11-23', { pawnId: '1', onlineStatus: 'Offline' }, 'u', later)).toEqual({
      state: 'claimed',
      amount: '300',
    });
    expect(mocks.adjust).toHaveBeenCalledWith('1', 300n, 2300n);
    expect(await claimPrize('2026-11-23', { pawnId: '1', onlineStatus: 'Offline' }, 'u', later)).toMatchObject({
      state: 'claimed',
    });
    expect(mocks.adjust).toHaveBeenCalledTimes(1);
    expect((await loadCredits(weekId(weekStart(Date.now()))))['1']).toBe('300');
  });

  it('never resends a payment the game server did not confirm', async () => {
    await closedWeek();
    mocks.getBalance.mockResolvedValue(2000n);
    mocks.adjust.mockResolvedValue('uncertain');
    expect(await claimPrize('2026-11-23', { pawnId: '1', onlineStatus: 'Offline' }, 'u', later)).toMatchObject({
      state: 'uncertain',
    });
    await expect(claimPrize('2026-11-23', { pawnId: '1', onlineStatus: 'Offline' }, 'u', later)).rejects.toThrow(
      /administrator/,
    );
    expect(mocks.adjust).toHaveBeenCalledTimes(1);
  });

  it('lets the winner retry after the game server refused before paying', async () => {
    await closedWeek();
    mocks.getBalance.mockResolvedValue(2000n);
    mocks.adjust.mockResolvedValueOnce('rejected').mockResolvedValueOnce('applied');
    await expect(claimPrize('2026-11-23', { pawnId: '1', onlineStatus: 'Offline' }, 'u', later)).rejects.toThrow(
      /refused/,
    );
    expect(await claimPrize('2026-11-23', { pawnId: '1', onlineStatus: 'Offline' }, 'u', later)).toMatchObject({
      state: 'claimed',
    });
  });

  it('pays nothing when prizes are off', async () => {
    mocks.prizes = '';
    await closedWeek();
    expect(await prizesFor('1', later)).toEqual([]);
    expect((await loadWeek('2026-11-23'))!.closed!.winners[0]).toMatchObject({ name: 'Chani', prize: '0' });
  });
});
