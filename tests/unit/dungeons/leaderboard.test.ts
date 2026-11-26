import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock('../../../src/server/integrations/dune', () => ({ getDuneClient: () => ({ request: mocks.request }) }));
vi.mock('../../../src/lib/redis/client', () => ({ getRedisClient: () => null }));
vi.mock('../../../src/config/env', () => ({
  getServerEnv: () => ({ LOG_LEVEL: 'FATAL', NODE_ENV: 'test', DUNGEON_LEADERBOARD_REFRESH_SECONDS: 300 }),
}));

import { resetSharedCacheForTests } from '../../../src/lib/cache/shared-cache';
import {
  parseBoard,
  parseRun,
  parseRunPage,
  readDungeonBoard,
  readDungeonRuns,
  readPersonalBests,
} from '../../../src/features/dungeons/server/leaderboard';

const run = (overrides: Record<string, unknown> = {}) => ({
  completionId: 12,
  dungeonId: 'DA_Dgn_089_Radiation',
  difficulty: 2,
  durationMs: 754_300,
  playerCount: 2,
  party: [
    { controllerId: 'c-1', actorId: 501, characterName: 'Chani' },
    { controllerId: 'c-2', actorId: null, characterName: null },
  ],
  ...overrides,
});
const board = { capabilities: { dungeons: true }, entries: [{ runCount: 3, best: run() }] };

beforeEach(() => {
  vi.resetAllMocks();
  resetSharedCacheForTests();
});

describe('dungeon payload validation', () => {
  it('keeps character names and drops controller and actor ids', () => {
    const parsed = parseRun(run());
    expect(parsed).toEqual({
      completionId: '12',
      dungeonId: 'DA_Dgn_089_Radiation',
      difficulty: 2,
      durationMs: 754_300,
      playerCount: 2,
      party: [{ name: 'Chani' }, { name: null }],
    });
    expect(JSON.stringify(parsed)).not.toMatch(/c-1|501|controller|actor/);
  });

  it('rejects malformed runs and partial boards instead of caching them', () => {
    expect(parseRun(run({ durationMs: -1 }))).toBeNull();
    expect(parseRun(run({ dungeonId: '../etc' }))).toBeNull();
    expect(parseRun(run({ party: 'x' }))).toBeNull();
    expect(() =>
      parseBoard({
        entries: [
          { runCount: 1, best: run() },
          { runCount: 2, best: {} },
        ],
      }),
    ).toThrow();
    expect(() => parseBoard(null)).toThrow();
    expect(() => parseRunPage({ page: 0, pageSize: 25, totalCount: 1, totalRuns: 1, runs: [{}] })).toThrow();
  });

  it('accepts a legitimately empty board and reports an unsupported server distinctly', () => {
    expect(parseBoard({ entries: [], capabilities: { dungeons: true } })).toEqual({ supported: true, records: [] });
    expect(parseBoard({ capabilities: { dungeons: false }, reason: 'missing table' })).toEqual({
      supported: false,
      records: [],
    });
    expect(parseRunPage({ capabilities: { dungeons: false } }).supported).toBe(false);
  });
});

describe('dungeon reads', () => {
  it('serves many members from one Console request', async () => {
    mocks.request.mockResolvedValue(board);
    const readings = await Promise.all(Array.from({ length: 50 }, () => readDungeonBoard()));
    expect(mocks.request).toHaveBeenCalledTimes(1);
    expect(mocks.request).toHaveBeenCalledWith('GET', '/api/dungeons/leaderboard', { retryRead: true });
    expect(readings.every((reading) => reading.data.supported && reading.data.records.length === 1)).toBe(true);
  });

  it('keeps the last good board when the Console fails', async () => {
    mocks.request.mockResolvedValueOnce(board);
    const first = await readDungeonBoard();
    mocks.request.mockRejectedValueOnce(new Error('timeout'));
    const { readShared } = await import('../../../src/lib/cache/shared-cache');
    expect(readShared).toBeTypeOf('function');
    const again = await readDungeonBoard();
    expect(again.data).toEqual(first.data);
  });

  it('only forwards dungeon and difficulty filters that exist on the board', async () => {
    mocks.request.mockResolvedValue({ page: 0, pageSize: 25, totalCount: 0, totalRuns: 0, runs: [] });
    const known = parseBoard(board);
    await readDungeonRuns({ page: 3, dungeonId: 'DA_Dgn_089_Radiation', difficulty: 2 }, known);
    expect(mocks.request).toHaveBeenLastCalledWith(
      'GET',
      '/api/dungeons/runs?page=3&pageSize=25&dungeonId=DA_Dgn_089_Radiation&difficulty=2',
      { retryRead: true },
    );
    await readDungeonRuns({ page: 99999, dungeonId: 'DA_Unknown', difficulty: 9 }, known);
    expect(mocks.request).toHaveBeenLastCalledWith('GET', '/api/dungeons/runs?page=199&pageSize=25', {
      retryRead: true,
    });
  });

  it('isolates personal bests by player id and refuses malformed ids', async () => {
    mocks.request.mockResolvedValue(board);
    await readPersonalBests('501');
    await readPersonalBests('502');
    expect(mocks.request).toHaveBeenCalledWith('GET', '/api/dungeons/leaderboard?playerId=501', { retryRead: true });
    expect(mocks.request).toHaveBeenCalledWith('GET', '/api/dungeons/leaderboard?playerId=502', { retryRead: true });
    await expect(readPersonalBests('1 OR 1=1')).rejects.toThrow();
  });
});
