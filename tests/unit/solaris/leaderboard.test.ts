import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock('../../../src/server/integrations/dune', () => ({ getDuneClient: () => ({ request: mocks.request }) }));
vi.mock('../../../src/lib/redis/client', () => ({ getRedisClient: () => null }));
vi.mock('../../../src/config/env', () => ({ getServerEnv: () => ({ LOG_LEVEL: 'FATAL', NODE_ENV: 'test' }) }));

import { CacheUnavailableError, resetSharedCacheForTests } from '../../../src/lib/cache/shared-cache';
import {
  crawlSolaris,
  findEntry,
  parseBalance,
  parseSolarisCoin,
  parseStoredBoard,
  peekSolarisBoard,
  publicBoard,
  readSolarisBoard,
} from '../../../src/features/solaris/server/leaderboard';

type Player = { player_id: number | string; character_name: string | null; coin?: unknown };

function console(players: Player[], options: { totalCount?: number } = {}) {
  mocks.request.mockImplementation(
    async (_method: string, route: string, opts?: { query?: Record<string, number> }) => {
      if (route === '/api/players') {
        const page = opts?.query?.page ?? 0;
        const size = opts?.query?.pageSize ?? 100;
        return {
          rows: players.slice(page * size, page * size + size),
          totalCount: options.totalCount ?? players.length,
        };
      }
      const match = /^\/api\/players\/(\d+)\/solaris-coin$/.exec(route);
      const player = match && players.find((entry) => String(entry.player_id) === match[1]);
      if (!player) throw new Error('not found');
      if (player.coin instanceof Error) throw player.coin;
      return player.coin;
    },
  );
}

beforeEach(() => {
  mocks.request.mockReset();
  resetSharedCacheForTests();
});

describe('Solaris balances', () => {
  it('keeps exact whole-number balances and rejects anything else', () => {
    expect(parseBalance('12533060')).toBe('12533060');
    expect(parseBalance('900719925474099312345')).toBe('900719925474099312345');
    expect(parseBalance('15.9')).toBe('15');
    expect(parseBalance(42)).toBe('42');
    expect(parseBalance('1e9')).toBeNull();
    expect(parseBalance(Number.NaN)).toBeNull();
    expect(parseBalance(null)).toBeNull();
    expect(parseSolarisCoin({ total: '7' })).toBe('7');
    expect(parseSolarisCoin({ supported: false, total: '7' })).toBeNull();
    expect(parseSolarisCoin({})).toBeNull();
  });
});

describe('Solaris crawl', () => {
  it('pages the player directory and reads each balance', async () => {
    const players = Array.from({ length: 150 }, (_, index) => ({
      player_id: index + 1,
      character_name: `Player ${index + 1}`,
      coin: { total: String(index * 10) },
    }));
    console(players);
    const board = await crawlSolaris({ request: mocks.request });
    expect(board.players).toBe(150);
    expect(board.rows).toHaveLength(150);
    expect(board.unreadable).toBe(0);
    expect(board.truncated).toBe(false);
    expect(mocks.request.mock.calls.filter(([, route]) => route === '/api/players')).toHaveLength(2);
  });

  it('counts unreadable balances instead of guessing zero', async () => {
    console([
      { player_id: 1, character_name: 'Chani', coin: { total: '500' } },
      { player_id: 2, character_name: 'Stilgar', coin: new Error('timeout') },
      { player_id: 3, character_name: 'Jamis', coin: { total: '100' } },
      { player_id: 4, character_name: 'Liet', coin: { total: '1' } },
    ]);
    const board = await crawlSolaris({ request: mocks.request });
    expect(board.unreadable).toBe(1);
    expect(board.rows.map((row) => row.name).sort()).toEqual(['Chani', 'Jamis', 'Liet']);
  });

  it('marks a directory longer than the crawl limit as truncated', async () => {
    const players = Array.from({ length: 2_100 }, (_, index) => ({
      player_id: index + 1,
      character_name: `P${index}`,
      coin: { total: '1' },
    }));
    console(players);
    const board = await crawlSolaris({ request: mocks.request });
    expect(board.players).toBe(2_000);
    expect(board.truncated).toBe(true);
  });

  it('rejects a malformed player directory', async () => {
    mocks.request.mockResolvedValue({ nope: true });
    await expect(crawlSolaris({ request: mocks.request })).rejects.toThrow();
  });
});

describe('stored board', () => {
  const stored = (rows: unknown[], extra: Record<string, unknown> = {}) => ({
    rows,
    players: rows.length,
    unreadable: 0,
    truncated: false,
    ...extra,
  });

  it('sorts by balance, exact beyond float precision', () => {
    const board = parseStoredBoard(
      stored([
        { id: '1', name: 'Small', balance: '9007199254740993' },
        { id: '2', name: 'Big', balance: '9007199254740994' },
        { id: '3', name: null, balance: '5' },
      ]),
    );
    expect(board.rows.map((row) => row.id)).toEqual(['2', '1', '3']);
  });

  it('rejects malformed rows, duplicate ids and mostly failed crawls', () => {
    expect(() => parseStoredBoard(stored([{ id: 'x', name: 'A', balance: '1' }]))).toThrow();
    expect(() => parseStoredBoard(stored([{ id: '1', name: 'A', balance: '1.5' }]))).toThrow();
    expect(() =>
      parseStoredBoard(
        stored([
          { id: '1', name: 'A', balance: '1' },
          { id: '1', name: 'B', balance: '2' },
        ]),
      ),
    ).toThrow();
    expect(() =>
      parseStoredBoard(stored([{ id: '1', name: 'A', balance: '1' }], { players: 4, unreadable: 3 })),
    ).toThrow();
    expect(parseStoredBoard(stored([])).rows).toEqual([]);
  });

  it('shares ranks on ties and keeps player ids out of the public board', () => {
    const board = parseStoredBoard(
      stored([
        { id: '1', name: 'A', balance: '50' },
        { id: '2', name: 'B', balance: '50' },
        { id: '3', name: 'C', balance: '10' },
      ]),
    );
    const view = publicBoard(board);
    expect(view.entries.map((entry) => entry.rank)).toEqual([1, 1, 3]);
    expect(JSON.stringify(view)).not.toContain('"id"');
    expect(findEntry(board, '3')).toEqual({ rank: 3, name: 'C', balance: '10' });
    expect(findEntry(board, '99')).toBeNull();
  });
});

describe('shared reading', () => {
  it('crawls once per refresh interval and peeks without crawling', async () => {
    expect(await peekSolarisBoard()).toBeNull();
    console([{ player_id: 7, character_name: 'Paul', coin: { total: '1000' } }]);
    const first = await readSolarisBoard();
    const calls = mocks.request.mock.calls.length;
    const second = await readSolarisBoard();
    expect(mocks.request.mock.calls.length).toBe(calls);
    expect(second.data).toEqual(first.data);
    expect((await peekSolarisBoard())?.data.rows[0]).toMatchObject({ id: '7', balance: '1000' });
  });

  it('never caches a crawl where every balance failed', async () => {
    console([{ player_id: 7, character_name: 'Paul', coin: new Error('down') }]);
    await expect(readSolarisBoard()).rejects.toBeInstanceOf(CacheUnavailableError);
    expect(await peekSolarisBoard()).toBeNull();
  });
});
