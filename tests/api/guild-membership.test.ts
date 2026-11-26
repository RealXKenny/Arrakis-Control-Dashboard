import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ADD, REMOVE, PROMOTE, DEMOTE, DISBAND } from '../../src/features/guilds/server/membership';
import { DuneConsoleApiError } from '../../src/server/integrations/dunedocker/transport';
const { request, session, linkedPlayer, redis } = vi.hoisted(() => ({
  request: vi.fn(),
  session: vi.fn(),
  linkedPlayer: vi.fn(),
  redis: { eval: vi.fn() },
}));
vi.mock('../../src/server/integrations/dune', () => ({ getDuneClient: () => ({ request }) }));
vi.mock('../../src/features/auth/server/session', () => {
  const getSession = session;
  return { getSession, currentSession: () => getSession() };
});
vi.mock('../../src/features/player/server/linked-player', () => ({ getLinkedPlayer: linkedPlayer }));
vi.mock('../../src/lib/redis/client', () => ({ getRedisClient: () => redis }));
let members;
const req = (body = {}, query = {}) => ({
  url: '/api/guilds/2/members/7/promote',
  query: { guildId: '2', playerId: '7', ...query },
  headers: { cookie: 'dashboard_session=test', origin: 'http://localhost', host: 'localhost' },
  body,
});
beforeEach(() => {
  vi.resetAllMocks();
  members = [
    { player_id: '4', role_id: '100' },
    { player_id: '7', role_id: '1' },
    { player_id: '8', role_id: '50' },
  ];
  session.mockResolvedValue({
    user: { id: 'discord-user', username: 'Leader' },
    guildId: 'discord-guild',
    roleIds: [],
    expiresAt: Date.now() + 60000,
  });
  linkedPlayer.mockResolvedValue({ linked: true, pawnId: '4', characterName: 'Leader' });
  request.mockImplementation(async (method) =>
    method === 'GET' ? { rows: members } : { ok: true, secret: 'must-not-leak' },
  );
  redis.eval.mockResolvedValue(1);
});
describe('leader-only live guild membership', () => {
  it('revalidates leadership and rejects anonymous, non-leader, and cross-site changes', async () => {
    session.mockResolvedValue(null);
    await expect(PROMOTE(req({ expectedRole: 1 }), {})).rejects.toMatchObject({ statusCode: 401 });
    session.mockResolvedValue({
      user: { id: 'discord-user' },
      guildId: 'discord-guild',
      roleIds: [],
      expiresAt: Date.now() + 60000,
    });
    linkedPlayer.mockResolvedValue({ linked: true, pawnId: '7', characterName: 'Member' });
    for (const action of [ADD, REMOVE, PROMOTE, DEMOTE, DISBAND])
      await expect(action(req({ expectedRole: 1 }), {})).rejects.toMatchObject({ statusCode: 403 });
    const crossSite = { ...req(), headers: { host: 'localhost', origin: 'https://other.example' } };
    await expect(ADD(crossSite, {})).rejects.toMatchObject({ statusCode: 403, code: 'INVALID_ORIGIN' });
    expect(request.mock.calls.every(([method]) => method === 'GET')).toBe(true);
  });
  it('adds with bounded ranks and preserves large player IDs as strings', async () => {
    const response = await ADD(req({ playerId: '9007199254740993123' }), {});
    expect(request).toHaveBeenLastCalledWith('POST', '/api/guilds/2/members', {
      body: { playerId: '9007199254740993123', roleId: 1 },
      retryRead: false,
    });
    expect(JSON.stringify(JSON.parse(response.body))).not.toContain('must-not-leak');
    for (const roleId of [0, 100, '50'])
      await expect(ADD(req({ playerId: '9', roleId }), {})).rejects.toMatchObject({ statusCode: 400 });
  });
  it('promotes and demotes once without mutation retries', async () => {
    expect(JSON.parse((await PROMOTE(req({ expectedRole: 1 }), {})).body).data.relogRequired).toBe(true);
    expect(request).toHaveBeenLastCalledWith('POST', '/api/guilds/2/members/7/promote', { retryRead: false });
    await DEMOTE(req({ expectedRole: 50 }, { playerId: '8' }), {});
    expect(request).toHaveBeenLastCalledWith('POST', '/api/guilds/2/members/8/demote', { retryRead: false });
    await expect(DEMOTE(req({ expectedRole: 1 }), {})).rejects.toMatchObject({ statusCode: 409 });
  });
  it('requires explicit leadership transfer and refuses stale or foreign members', async () => {
    await expect(PROMOTE(req({ expectedRole: 50 }, { playerId: '8' }), {})).rejects.toMatchObject({
      code: 'GUILD_CONFIRMATION_REQUIRED',
    });
    await PROMOTE(req({ expectedRole: 50, confirmation: 'TRANSFER LEADERSHIP' }, { playerId: '8' }), {});
    expect(request).toHaveBeenLastCalledWith('POST', '/api/guilds/2/members/8/promote', { retryRead: false });
    await expect(PROMOTE(req({ expectedRole: 1 }, { playerId: '8' }), {})).rejects.toMatchObject({
      code: 'GUILD_MEMBER_CHANGED',
    });
    await expect(
      REMOVE(req({ expectedRole: 1, confirmation: 'REMOVE MEMBER' }, { playerId: 'foreign' }), {}),
    ).rejects.toMatchObject({ code: 'GUILD_MEMBER_CHANGED' });
  });
  it('protects the leader and requires confirmation for removal', async () => {
    for (const action of [REMOVE, DEMOTE])
      await expect(
        action(req({ expectedRole: 100, confirmation: 'REMOVE MEMBER' }, { playerId: '4' }), {}),
      ).rejects.toMatchObject({ code: 'GUILD_LEADER_PROTECTED' });
    expect(JSON.parse((await PROMOTE(req({ expectedRole: 100 }, { playerId: '4' }), {})).body).data.alreadyLeader).toBe(
      true,
    );
    await expect(REMOVE(req({ expectedRole: 1 }), {})).rejects.toMatchObject({ code: 'GUILD_CONFIRMATION_REQUIRED' });
    await REMOVE(req({ expectedRole: 1, confirmation: 'REMOVE MEMBER' }), {});
    expect(request).toHaveBeenLastCalledWith('DELETE', '/api/guilds/2/members/7', { retryRead: false });
  });
  it('disbands only with the exact phrase and cleans up recruitment and chats afterward', async () => {
    await expect(DISBAND(req({ confirmation: 'yes' }), {})).rejects.toMatchObject({ statusCode: 400 });
    await DISBAND(req({ confirmation: 'DISBAND GUILD' }), {});
    expect(request).toHaveBeenLastCalledWith('DELETE', '/api/guilds/2', {
      body: { confirmation: 'DISBAND GUILD' },
      retryRead: false,
    });
    expect(redis.eval).toHaveBeenCalledWith(
      expect.stringContaining('application.conversationId'),
      expect.arrayContaining(['arrakis:{guilds}:applications:2']),
      ['guild:2', 'arrakis:{guilds}:chat:2:', '2'],
    );
    redis.eval.mockRejectedValue(new Error('storage offline'));
    const response = await DISBAND(req({ confirmation: 'DISBAND GUILD' }), {});
    expect(response.status).toBe(200);
    expect(JSON.parse(response.body).data.warning).toContain('already been disbanded');
  });
  it('reports provider constraints without leaking raw errors or retrying the write', async () => {
    request.mockImplementation(async (method) => {
      if (method === 'GET') return { rows: members };
      throw new DuneConsoleApiError('secret upstream error', 409);
    });
    await expect(ADD(req({ playerId: '9' }), {})).rejects.toMatchObject({
      statusCode: 409,
      code: 'GUILD_CHANGE_REFUSED',
    });
    expect(request.mock.calls.filter(([method]) => method === 'POST')).toHaveLength(1);
  });
});
