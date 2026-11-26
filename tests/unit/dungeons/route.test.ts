import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  rate: vi.fn(),
  linked: vi.fn(),
  board: vi.fn(),
  runs: vi.fn(),
  personal: vi.fn(),
}));
vi.mock('../../../src/features/auth/server/session', () => ({ currentSession: mocks.session }));
vi.mock('../../../src/lib/security/rate-limit', () => ({ checkRateLimit: mocks.rate }));
vi.mock('../../../src/features/player/server/linked-player', () => ({ getLinkedPlayer: mocks.linked }));
vi.mock('../../../src/features/dungeons/server/leaderboard', () => ({
  readDungeonBoard: mocks.board,
  readDungeonRuns: mocks.runs,
  readPersonalBests: mocks.personal,
  refreshSeconds: () => 300,
  toFreshness: (reading: { fetchedAt: number; state: string; refreshFailed: boolean }) => ({
    fetchedAt: reading.fetchedAt,
    state: reading.state,
    refreshFailed: reading.refreshFailed,
  }),
}));
vi.mock('../../../src/lib/logger', () => ({
  logger: { error: vi.fn() },
  createLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));
vi.mock('../../../src/config/env', () => ({ getServerEnv: () => ({ NODE_ENV: 'test', LOG_LEVEL: 'FATAL' }) }));
import { GET } from '../../../src/app/api/v2/dungeons/route';
import { CacheUnavailableError } from '../../../src/lib/cache/shared-cache';

const reading = (data: unknown) => ({
  data,
  fetchedAt: 1_000,
  attemptedAt: 1_000,
  state: 'fresh',
  refreshFailed: false,
});
const request = (query: string) => new Request(`https://dashboard.test/api/v2/dungeons?${query}`);
const board = { supported: true, records: [] };

beforeEach(() => {
  vi.resetAllMocks();
  mocks.session.mockResolvedValue({ user: { id: 'member', username: 'm' }, guildId: 'guild', roleIds: [] });
  mocks.rate.mockResolvedValue({ allowed: true, retryAfter: 0 });
  mocks.board.mockResolvedValue(reading(board));
  mocks.runs.mockResolvedValue(
    reading({ supported: true, page: 0, pageSize: 25, totalCount: 0, totalRuns: 0, runs: [] }),
  );
});

describe('dungeon leaderboard API', () => {
  it('requires a session and validates the view and filters', async () => {
    mocks.session.mockResolvedValueOnce(null);
    expect((await GET(request('view=board'))).status).toBe(401);
    expect((await GET(request('view=admin'))).status).toBe(400);
    expect((await GET(request('view=runs&page=-1'))).status).toBe(400);
    expect((await GET(request('view=runs&dungeonId=../x'))).status).toBe(400);
  });

  it('serves the board with freshness and no-store headers', async () => {
    const response = await GET(request('view=board'));
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.json()).toMatchObject({
      ok: true,
      board,
      refreshSeconds: 300,
      freshness: { fetchedAt: 1000 },
    });
  });

  it('returns an honest unavailable state when there is no reading', async () => {
    mocks.board.mockRejectedValueOnce(new CacheUnavailableError());
    const response = await GET(request('view=board'));
    expect(response.status).toBe(503);
    expect(await response.json()).not.toHaveProperty('board');
  });

  it('rate limits per member', async () => {
    mocks.rate.mockResolvedValueOnce({ allowed: false, retryAfter: 12 });
    const response = await GET(request('view=board'));
    expect(response.status).toBe(429);
    expect(response.headers.get('retry-after')).toBe('12');
  });

  it('resolves personal bests from the fresh linked character, never a client id', async () => {
    mocks.linked.mockResolvedValue({ linked: true, pawnId: 501, controllerId: 9 });
    mocks.personal.mockResolvedValue(reading(board));
    const response = await GET(request('view=personal&playerId=999'));
    expect(response.status).toBe(200);
    expect(mocks.personal).toHaveBeenCalledWith('501');
    mocks.linked.mockResolvedValue({ linked: false });
    expect(await (await GET(request('view=personal'))).json()).toMatchObject({ ok: true, linked: false });
  });
});
