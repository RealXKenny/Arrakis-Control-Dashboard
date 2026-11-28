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
  parseBankCredit,
  parseSolarisCoin,
  parseStoredBoard,
  peekSolarisBoard,
  publicBoard,
  readSolarisBoard,
} from '../../../src/features/solaris/server/leaderboard';

type Player = { actor_id: number | string; character_name: string | null; coin?: unknown; bank?: unknown };

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
      const match = /^\/api\/players\/(\d+)\/(solaris-coin|currency)$/.exec(route);
      const player = match && players.find((entry) => String(entry.actor_id) === match[1]);
      if (!player) throw new Error('not found');
      const value =
        match[2] === 'currency'
          ? (player.bank ?? {
              capabilities: { currency: true },
              rows: [{ currency_id: 0, balance: '0', label: 'Solari Credit' }],
            })
          : player.coin;
      if (value instanceof Error) throw value;
      return value;
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

describe('bank credit', () => {
  it('reads Solari Credit from the currency rows', () => {
    const rows = (list: unknown[]) => ({ capabilities: { currency: true }, rows: list });
    expect(
      parseBankCredit(
        rows([
          { currency_id: 0, balance: '12533524', label: 'Solari Credit' },
          { currency_id: 1, balance: '850', label: 'House Credit' },
        ]),
      ),
    ).toBe('12533524');
    // Builds without labels: currency 0 is Solari.
    expect(parseBankCredit(rows([{ currency_id: 0, balance: 7 }]))).toBe('7');
    expect(parseBankCredit(rows([{ currency_id: 1, balance: '3', label: 'Scrip' }]))).toBe('0');
    expect(parseBankCredit({ capabilities: { currency: false } })).toBeNull();
    expect(parseBankCredit({ nope: true })).toBeNull();
  });
});

describe('Solaris crawl', () => {
  it('reads the pawn id the Console directory really returns', async () => {
    console([]);
    mocks.request.mockImplementation(async (_m: string, route: string) => {
      if (route === '/api/players')
        return {
          rows: [{ actor_id: 3, player_pawn_id: 3, player_controller_id: 9, character_name: 'Irulan' }],
          totalCount: 1,
        };
      if (route === '/api/players/3/currency')
        return {
          capabilities: { currency: true },
          rows: [{ currency_id: 0, balance: '1000', label: 'Solari Credit' }],
        };
      if (route === '/api/players/3/solaris-coin') return { capabilities: { solarisCoin: true }, total: 25 };
      throw new Error(route);
    });
    const board = await crawlSolaris({ request: mocks.request });
    expect(board.rows).toEqual([{ id: '3', name: 'Irulan', bank: '1000', coins: '25', balance: '1025' }]);
  });

  it('rejects a directory whose rows carry no usable id instead of caching an empty board', async () => {
    mocks.request.mockResolvedValue({ rows: [{ character_name: 'Ghost' }], totalCount: 1 });
    await expect(crawlSolaris({ request: mocks.request })).rejects.toThrow();
  });

  it('pages the player directory and reads each balance', async () => {
    const players = Array.from({ length: 150 }, (_, index) => ({
      actor_id: index + 1,
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
      { actor_id: 1, character_name: 'Chani', coin: { total: '500' } },
      { actor_id: 2, character_name: 'Stilgar', coin: new Error('timeout') },
      { actor_id: 3, character_name: 'Jamis', coin: { total: '100' } },
      { actor_id: 4, character_name: 'Liet', coin: { total: '1' } },
    ]);
    const board = await crawlSolaris({ request: mocks.request });
    expect(board.unreadable).toBe(1);
    expect(board.rows.map((row) => row.name).sort()).toEqual(['Chani', 'Jamis', 'Liet']);
  });

  it('marks a directory longer than the crawl limit as truncated', async () => {
    const players = Array.from({ length: 2_100 }, (_, index) => ({
      actor_id: index + 1,
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
        { id: '1', name: 'Small', bank: '0', coins: '9007199254740993', balance: '9007199254740993' },
        { id: '2', name: 'Big', bank: '0', coins: '9007199254740994', balance: '9007199254740994' },
        { id: '3', name: null, bank: '0', coins: '5', balance: '5' },
      ]),
    );
    expect(board.rows.map((row) => row.id)).toEqual(['2', '1', '3']);
  });

  it('rejects malformed rows, duplicate ids and mostly failed crawls', () => {
    expect(() => parseStoredBoard(stored([{ id: 'x', name: 'A', bank: '0', coins: '1', balance: '1' }]))).toThrow();
    expect(() => parseStoredBoard(stored([{ id: '1', name: 'A', bank: '0', coins: '1.5', balance: '1.5' }]))).toThrow();
    expect(() =>
      parseStoredBoard(
        stored([
          { id: '1', name: 'A', bank: '0', coins: '1', balance: '1' },
          { id: '1', name: 'B', bank: '0', coins: '2', balance: '2' },
        ]),
      ),
    ).toThrow();
    expect(() =>
      parseStoredBoard(
        stored([{ id: '1', name: 'A', bank: '0', coins: '1', balance: '1' }], { players: 4, unreadable: 3 }),
      ),
    ).toThrow();
    expect(parseStoredBoard(stored([])).rows).toEqual([]);
  });

  it('shares ranks on ties and keeps player ids out of the public board', () => {
    const board = parseStoredBoard(
      stored([
        { id: '1', name: 'A', bank: '0', coins: '50', balance: '50' },
        { id: '2', name: 'B', bank: '0', coins: '50', balance: '50' },
        { id: '3', name: 'C', bank: '0', coins: '10', balance: '10' },
      ]),
    );
    const view = publicBoard(board);
    expect(view.entries.map((entry) => entry.rank)).toEqual([1, 1, 3]);
    expect(JSON.stringify(view)).not.toContain('"id"');
    expect(findEntry(board, '3')).toEqual({ rank: 3, name: 'C', bank: '0', coins: '10', balance: '10' });
    expect(findEntry(board, '99')).toBeNull();
  });
});

describe('shared reading', () => {
  it('crawls once per refresh interval and peeks without crawling', async () => {
    expect(await peekSolarisBoard()).toBeNull();
    console([{ actor_id: 7, character_name: 'Paul', coin: { total: '1000' } }]);
    const first = await readSolarisBoard();
    const calls = mocks.request.mock.calls.length;
    const second = await readSolarisBoard();
    expect(mocks.request.mock.calls.length).toBe(calls);
    expect(second.data).toEqual(first.data);
    expect((await peekSolarisBoard())?.data.rows[0]).toMatchObject({ id: '7', balance: '1000' });
  });

  it('never caches a crawl where every balance failed', async () => {
    console([{ actor_id: 7, character_name: 'Paul', coin: new Error('down') }]);
    await expect(readSolarisBoard()).rejects.toBeInstanceOf(CacheUnavailableError);
    expect(await peekSolarisBoard()).toBeNull();
  });
});
