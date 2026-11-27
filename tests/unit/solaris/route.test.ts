import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ session: vi.fn(), rate: vi.fn(), linked: vi.fn(), board: vi.fn() }));
vi.mock('../../../src/features/auth/server/session', () => ({ currentSession: mocks.session }));
vi.mock('../../../src/lib/security/rate-limit', () => ({ checkRateLimit: mocks.rate }));
vi.mock('../../../src/features/player/server/linked-player', () => ({ getLinkedPlayer: mocks.linked }));
vi.mock('../../../src/lib/logger', () => ({
  logger: { error: vi.fn() },
  createLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));
vi.mock('../../../src/config/env', () => ({ getServerEnv: () => ({ NODE_ENV: 'test', LOG_LEVEL: 'FATAL' }) }));
vi.mock('../../../src/features/solaris/server/leaderboard', async (original) => ({
  ...(await original<typeof import('../../../src/features/solaris/server/leaderboard')>()),
  readSolarisBoard: mocks.board,
}));
import { GET } from '../../../src/app/api/v2/solaris/route';
import { CacheUnavailableError } from '../../../src/lib/cache/shared-cache';

const stored = {
  rows: [
    { id: '11', name: 'Chani', balance: '900' },
    { id: '22', name: 'Stilgar', balance: '400' },
  ],
  players: 2,
  unreadable: 0,
  truncated: false,
};
const reading = { data: stored, fetchedAt: 1_000, attemptedAt: 1_000, state: 'fresh', refreshFailed: false };
const request = (query: string) => new Request(`https://dashboard.test/api/v2/solaris?${query}`);

beforeEach(() => {
  vi.resetAllMocks();
  mocks.session.mockResolvedValue({ user: { id: 'member', username: 'm' }, guildId: 'guild', roleIds: [] });
  mocks.rate.mockResolvedValue({ allowed: true, retryAfter: 0 });
  mocks.board.mockResolvedValue(reading);
});

describe('Solaris leaderboard API', () => {
  it('requires a session and a known view', async () => {
    mocks.session.mockResolvedValueOnce(null);
    expect((await GET(request('view=board'))).status).toBe(401);
    expect((await GET(request('view=admin'))).status).toBe(400);
  });

  it('serves ranks and names without player ids', async () => {
    const response = await GET(request('view=board'));
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    const body = await response.json();
    expect(body).toMatchObject({
      ok: true,
      refreshSeconds: 600,
      freshness: { fetchedAt: 1000 },
      board: {
        players: 2,
        entries: [
          { rank: 1, name: 'Chani', balance: '900' },
          { rank: 2, name: 'Stilgar' },
        ],
      },
    });
    expect(JSON.stringify(body)).not.toContain('"11"');
  });

  it('finds the member by their own linked character only', async () => {
    mocks.linked.mockResolvedValue({ linked: true, pawnId: 22 });
    const body = await (await GET(request('view=personal&playerId=11'))).json();
    expect(body).toMatchObject({ ok: true, linked: true, entry: { rank: 2, name: 'Stilgar', balance: '400' } });

    mocks.linked.mockResolvedValue({ linked: false });
    expect(await (await GET(request('view=personal'))).json()).toMatchObject({ linked: false, entry: null });
  });

  it('rate limits and reports an honest unavailable state', async () => {
    mocks.rate.mockResolvedValueOnce({ allowed: false, retryAfter: 5 });
    expect((await GET(request('view=board'))).status).toBe(429);
    mocks.board.mockRejectedValueOnce(new CacheUnavailableError());
    const response = await GET(request('view=board'));
    expect(response.status).toBe(503);
    expect(await response.json()).not.toHaveProperty('board');
  });
});
