import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GET as listGuilds } from '../../src/modules/guilds/server/list';
import { GET as listMembers } from '../../src/modules/guilds/server/members';
import { GET as getLogo, POST as saveLogo } from '../../src/modules/guilds/server/logo';

const { request, session, linkedPlayer, redis } = vi.hoisted(() => ({
  request: vi.fn(),
  session: vi.fn(),
  linkedPlayer: vi.fn(),
  redis: { get: vi.fn(), set: vi.fn() },
}));

vi.mock('../../src/infrastructure/dune', () => ({ getDuneClient: () => ({ request }) }));
vi.mock('../../src/lib/session-store', () => ({ getSession: session }));
vi.mock('../../src/modules/player/server/linked-player', () => ({ getLinkedPlayer: linkedPlayer }));
vi.mock('../../src/lib/redis', () => ({ getRedisClient: () => redis }));

const req = (url: string, query = {}) => ({
  method: 'GET',
  url,
  query,
  headers: { cookie: 'dashboard_session=test-session' },
});

beforeEach(() => {
  request.mockReset();
  session.mockResolvedValue({
    user: { id: 'discord-user', username: 'leader' },
    guildId: 'discord-guild',
    roleIds: [],
    expiresAt: Date.now() + 60_000,
  });
  linkedPlayer.mockResolvedValue({ linked: true, pawnId: '4', characterName: 'Leader' });
  redis.get.mockResolvedValue(null);
  redis.set.mockResolvedValue('OK');
});

describe('guild API handlers', () => {
  it('requires a session and wraps guild results in the dashboard envelope', async () => {
    request.mockResolvedValue({ capabilities: { guilds: true }, totalCount: 1, rows: [{ guild_id: '2' }] });
    const response = await listGuilds(req('/api/guilds', { page: '0', pageSize: '25' }), {});
    expect(response.status).toBe(200);
    expect(JSON.parse(response.body)).toEqual({
      ok: true,
      data: { capabilities: { guilds: true }, totalCount: 1, rows: [{ guild_id: '2' }] },
    });
    expect(request).toHaveBeenCalledWith('GET', '/api/guilds?page=0&pageSize=25');

    session.mockResolvedValue(null);
    const unauthorized = await listGuilds(req('/api/guilds'), {});
    expect(unauthorized.status).toBe(401);
  });

  it('encodes the guild ID and returns member rows', async () => {
    request.mockResolvedValue({ capabilities: { guildMembers: true }, rows: [{ player_id: '4' }] });
    const response = await listMembers(req('/api/guilds/2/members', { guildId: '2' }), {});
    expect(response.status).toBe(200);
    expect(JSON.parse(response.body).data.rows).toEqual([{ player_id: '4' }]);
    expect(request).toHaveBeenCalledWith('GET', '/api/guilds/2/members');
  });

  it('allows only the verified guild leader to save a PNG logo in Redis', async () => {
    request.mockResolvedValue({ rows: [{ player_id: '4', role_id: '100' }] });
    const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0]).toString('base64');
    const response = await saveLogo(
      { ...req('/api/guilds/2/logo'), body: { logo: `data:image/png;base64,${png}` } },
      {},
    );
    expect(response.status).toBe(200);
    expect(redis.set).toHaveBeenCalledWith('arrakis:guild-logo:2', `data:image/png;base64,${png}`);

    request.mockResolvedValue({ rows: [{ player_id: '4', role_id: '1' }] });
    const denied = await expect(
      saveLogo({ ...req('/api/guilds/2/logo'), body: { logo: `data:image/png;base64,${png}` } }, {}),
    ).rejects.toMatchObject({ statusCode: 403, code: 'GUILD_LEADER_REQUIRED' });
    expect(denied).toBeDefined();
  });

  it('returns the saved logo for authenticated guild members', async () => {
    redis.get.mockResolvedValue('data:image/png;base64,stored');
    const response = await getLogo(req('/api/guilds/2/logo'), {});
    expect(JSON.parse(response.body).data.logo).toBe('data:image/png;base64,stored');
  });
});
