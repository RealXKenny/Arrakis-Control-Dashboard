import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  rate: vi.fn(),
  linked: vi.fn(),
  releases: vi.fn(),
  board: vi.fn(),
  personal: vi.fn(),
  solaris: vi.fn(),
  roadmap: vi.fn(),
  journal: vi.fn(),
  planner: vi.fn(),
}));
vi.mock('../../../src/features/auth/server/session', () => ({ currentSession: mocks.session }));
vi.mock('../../../src/lib/security/rate-limit', () => ({ checkRateLimit: mocks.rate }));
vi.mock('../../../src/features/player/server/linked-player', () => ({ getLinkedPlayer: mocks.linked }));
vi.mock('../../../src/lib/logger', () => ({
  logger: { error: vi.fn() },
  createLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));
vi.mock('../../../src/config/env', () => ({ getServerEnv: () => ({ NODE_ENV: 'test', LOG_LEVEL: 'FATAL' }) }));
vi.mock('../../../src/features/changelog/server/public-api', () => ({ readProjectReleases: mocks.releases }));
vi.mock('../../../src/features/dungeons/server/leaderboard', () => ({
  readDungeonBoard: mocks.board,
  readPersonalBests: mocks.personal,
}));
vi.mock('../../../src/features/solaris/server/leaderboard', async (original) => ({
  ...(await original<typeof import('../../../src/features/solaris/server/leaderboard')>()),
  peekSolarisBoard: mocks.solaris,
}));
vi.mock('../../../src/features/roadmap/server/roadmap', () => ({ readRoadmap: mocks.roadmap }));
vi.mock('../../../src/features/progression/server/store', () => ({
  readJournal: mocks.journal,
  readPlanner: mocks.planner,
}));
import { GET } from '../../../src/app/api/v2/unwrapped/route';

const year = new Date().getUTCFullYear();
const run = (id: string, dungeonId: string, durationMs: number, names: string[]) => ({
  completionId: id,
  dungeonId,
  difficulty: 2,
  durationMs,
  playerCount: names.length,
  party: names.map((name) => ({ name })),
});
const reading = <T>(data: T) => ({ data, fetchedAt: 1, attemptedAt: 1, state: 'fresh', refreshFailed: false });
const serverBoard = {
  supported: true,
  records: [
    { runCount: 40, best: run('1', 'DA_Dgn_089_Radiation', 300_000, ['Chani', 'Stilgar']) },
    { runCount: 12, best: run('2', 'DA_Dgn_012_OldCistern', 120_000, ['Chani']) },
  ],
};
const solaris = reading({
  rows: [
    { id: '11', name: 'Chani', balance: '900' },
    { id: '22', name: 'Stilgar', balance: '100' },
  ],
  players: 2,
  unreadable: 0,
  truncated: false,
});
const request = (query: string) => new Request(`https://dashboard.test/api/v2/unwrapped?${query}`);

beforeEach(() => {
  vi.resetAllMocks();
  mocks.session.mockResolvedValue({ user: { id: 'member', username: 'm' }, guildId: 'guild', roleIds: [] });
  mocks.rate.mockResolvedValue({ allowed: true, retryAfter: 0 });
  mocks.releases.mockImplementation(async (project: string) => [
    {
      version: '2.0.0',
      date: `${year}-11-25`,
      sections: [{ title: project === 'bot' ? 'Added' : 'New Features', items: ['**Unwrapped**: recap'] }],
    },
  ]);
  mocks.board.mockResolvedValue(reading(serverBoard));
  mocks.solaris.mockResolvedValue(solaris);
  mocks.roadmap.mockResolvedValue(
    reading({ entries: [{ status: 'released' }, { status: 'planned' }, { status: 'testing' }], repositories: [] }),
  );
  mocks.journal.mockResolvedValue({ snapshots: [], startedAt: null });
  mocks.planner.mockResolvedValue({ tracking: { enabled: false, startedAt: null } });
});

describe('Unwrapped API', () => {
  it('requires a session and a known view', async () => {
    mocks.session.mockResolvedValueOnce(null);
    expect((await GET(request('view=server'))).status).toBe(401);
    expect((await GET(request('view=everyone'))).status).toBe(400);
  });

  it('composes the server recap without player ids', async () => {
    const response = await GET(request('view=server'));
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    const body = await response.json();
    expect(body).toMatchObject({
      ok: true,
      recap: {
        year,
        releases: { total: 2, bot: 1, dashboard: 1, features: 2 },
        dungeons: {
          totalRuns: 52,
          records: 2,
          fastest: { dungeonId: 'DA_Dgn_012_OldCistern', party: ['Chani'] },
          busiest: { runCount: 40 },
          holders: [{ name: 'Chani', records: 2 }, { name: 'Stilgar' }],
        },
        solaris: { ranked: 2, total: '1000', top: { name: 'Chani', balance: '900' } },
        roadmap: { released: 1, inProgress: 1, planned: 1 },
      },
    });
    expect(JSON.stringify(body)).not.toContain('"11"');
  });

  it('leaves out sections whose source failed or has nothing, instead of showing zeros', async () => {
    mocks.board.mockRejectedValueOnce(new Error('console down'));
    mocks.solaris.mockResolvedValueOnce(null);
    mocks.roadmap.mockResolvedValueOnce(reading({ entries: [], repositories: [] }));
    mocks.releases.mockResolvedValue([]);
    const body = await (await GET(request('view=server'))).json();
    expect(body.recap).toEqual({ year, releases: null, dungeons: null, solaris: null, roadmap: null });
  });

  it('builds the personal recap from the fresh link only', async () => {
    mocks.linked.mockResolvedValue({ linked: true, pawnId: 22, controllerId: 7, characterName: 'Stilgar' });
    mocks.personal.mockResolvedValue(
      reading({
        supported: true,
        records: [
          { runCount: 3, best: run('1', 'DA_Dgn_089_Radiation', 300_000, ['Chani', 'Stilgar']) },
          { runCount: 1, best: run('9', 'DA_Dgn_012_OldCistern', 150_000, ['Stilgar']) },
        ],
      }),
    );
    mocks.journal.mockResolvedValue({
      startedAt: `${year}-01-02T00:00:00.000Z`,
      snapshots: [
        { at: `${year}-01-02T00:00:00.000Z`, level: '5', xp: '10', journey: null },
        { at: `${year}-10-02T00:00:00.000Z`, level: '20', xp: '4010', journey: null },
      ],
    });
    mocks.planner.mockResolvedValue({ tracking: { enabled: true, startedAt: null } });
    const body = await (await GET(request('view=personal&playerId=11'))).json();
    expect(mocks.personal).toHaveBeenCalledWith('22');
    expect(mocks.journal).toHaveBeenCalledWith('member', '22');
    expect(body).toMatchObject({
      ok: true,
      recap: {
        linked: true,
        character: 'Stilgar',
        dungeons: { records: 2, dungeons: 2, serverRecords: 1, fastest: { durationMs: 150_000 } },
        solaris: { rank: 2, of: 2, balance: '100' },
        journey: { levelFrom: '5', levelTo: '20', xpGained: '4000', observations: 2 },
        tracking: true,
      },
    });
  });

  it('reports an unlinked member and an adapter outage honestly', async () => {
    mocks.linked.mockResolvedValueOnce({ linked: false });
    expect((await (await GET(request('view=personal'))).json()).recap).toMatchObject({
      linked: false,
      dungeons: null,
    });
    mocks.linked.mockRejectedValueOnce(new Error('adapter down'));
    expect((await GET(request('view=personal'))).status).toBe(503);
  });

  it('rate limits', async () => {
    mocks.rate.mockResolvedValueOnce({ allowed: false, retryAfter: 5 });
    const response = await GET(request('view=server'));
    expect(response.status).toBe(429);
    expect(response.headers.get('retry-after')).toBe('5');
  });
});
