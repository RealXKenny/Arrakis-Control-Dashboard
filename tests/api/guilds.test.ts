import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GET as listGuilds } from '../../src/features/guilds/server/list';
import { GET as listMembers } from '../../src/features/guilds/server/members';
import { GET as getLogo, POST as saveLogo } from '../../src/features/guilds/server/logo';
import {
  GET as getRequirements,
  POST as saveRequirements,
  LIST as listRequirements,
} from '../../src/features/guilds/server/requirements';

const { request, session, linkedPlayer, redis, registry } = vi.hoisted(() => ({
  request: vi.fn(),
  registry: { name: vi.fn(), display: vi.fn((stored: string) => stored) },
  session: vi.fn(),
  linkedPlayer: vi.fn(),
  redis: { get: vi.fn(), set: vi.fn(), eval: vi.fn(), zrange: vi.fn() },
}));

vi.mock('../../src/server/integrations/dune', () => ({ getDuneClient: () => ({ request }) }));
vi.mock('../../src/features/auth/server/session', () => {
  const getSession = session;
  return { getSession, currentSession: () => getSession() };
});
vi.mock('../../src/features/player/server/linked-player', () => ({ getLinkedPlayer: linkedPlayer }));
vi.mock('../../src/features/guilds/server/guild-registry', () => ({
  authoritativeGuildName: registry.name,
  displayGuildName: async (_id: string, stored: string) => registry.display(stored),
}));
vi.mock('../../src/lib/redis/client', () => ({ getRedisClient: () => redis }));

const req = (url: string, query = {}) => ({
  method: 'GET',
  url,
  query,
  headers: { cookie: 'dashboard_session=test-session', origin: 'http://localhost', host: 'localhost' },
});

beforeEach(() => {
  vi.clearAllMocks();
  request.mockReset();
  registry.name.mockReset();
  registry.name.mockResolvedValue('Crimson Skies');
  session.mockResolvedValue({
    user: { id: 'discord-user', username: 'leader' },
    guildId: 'discord-guild',
    roleIds: [],
    expiresAt: Date.now() + 60_000,
  });
  linkedPlayer.mockResolvedValue({ linked: true, pawnId: '4', characterName: 'Leader' });
  redis.get.mockResolvedValue(null);
  redis.set.mockResolvedValue('OK');
  redis.eval.mockResolvedValue(1);
  redis.zrange.mockResolvedValue([]);
});

const requirements = {
  guildName: 'Crimson Skies',
  requirements: 'Active players, all experience levels.',
  contact: 'Ask Leader in game',
  published: true,
};

describe('guild recruitment settings', () => {
  it('allows leaders to configure bounded, uniquely identified application questions', async () => {
    request.mockResolvedValue({ rows: [{ player_id: '4', role_id: '100' }] });
    const question = { id: '915c1a9c-13a6-4eef-833b-121c513f9a5a', label: 'What do you enjoy doing?', required: false };
    const data = { ...requirements, applicationQuestions: [question] };
    expect(
      JSON.parse(
        (await saveRequirements({ ...req('/api/guilds/2/requirements', { guildId: '2' }), body: data }, {})).body,
      ).data,
    ).toEqual(data);
    for (const questions of [
      [question, question],
      [{ ...question, label: '' }],
      [{ ...question, id: '__proto__' }],
      Array.from({ length: 9 }, () => question),
    ])
      await expect(
        saveRequirements(
          {
            ...req('/api/guilds/2/requirements', { guildId: '2' }),
            body: { ...requirements, applicationQuestions: questions },
          },
          {},
        ),
      ).rejects.toMatchObject({ statusCode: 400 });
    expect(redis.eval).toHaveBeenCalledTimes(1);
  });
  it('verifies the controller ID as well as the pawn ID, ignoring a stale session identity', async () => {
    const currentSession = await session();
    session.mockResolvedValue({ ...currentSession, linkedPlayerId: 'old-pawn' });
    linkedPlayer.mockResolvedValue({
      linked: true,
      pawnId: 'current-pawn',
      controllerId: '4',
      characterName: 'Leader',
    });
    request.mockResolvedValue({ rows: [{ player_id: '4', role_id: '100' }] });
    const members = await listMembers(req('/api/guilds/2/members', { guildId: '2' }), {});
    expect(JSON.parse(members.body).canEdit).toBe(true);
    const saved = await saveRequirements(
      { ...req('/api/guilds/2/requirements', { guildId: '2' }), body: requirements },
      {},
    );
    expect(saved.status).toBe(200);
    redis.get.mockResolvedValue(requirements);
    const loaded = await getRequirements(req('/api/guilds/2/requirements', { guildId: '2' }), {});
    expect(JSON.parse(loaded.body).data).toEqual(requirements);
  });

  it('does not grant edit access based on a matching character name or stale session ID', async () => {
    const currentSession = await session();
    session.mockResolvedValue({ ...currentSession, linkedPlayerId: '99', linkedPlayerName: 'Leader' });
    linkedPlayer.mockResolvedValue({ linked: true, pawnId: '4', characterName: 'Leader' });
    request.mockResolvedValue({ rows: [{ player_id: '99', character_name: 'Leader', role_id: '100' }] });
    const members = await listMembers(req('/api/guilds/2/members', { guildId: '2' }), {});
    expect(JSON.parse(members.body).canEdit).toBe(false);
    await expect(getRequirements(req('/api/guilds/2/requirements', { guildId: '2' }), {})).rejects.toMatchObject({
      statusCode: 403,
    });
  });

  it('keeps member lists readable but denies settings when identity verification fails', async () => {
    linkedPlayer.mockRejectedValue(new Error('adapter unavailable'));
    request.mockResolvedValue({ rows: [{ player_id: '4', role_id: '100' }] });
    const members = await listMembers(req('/api/guilds/2/members', { guildId: '2' }), {});
    expect(JSON.parse(members.body).canEdit).toBe(false);
    await expect(getRequirements(req('/api/guilds/2/requirements', { guildId: '2' }), {})).rejects.toMatchObject({
      statusCode: 503,
      code: 'PLAYER_VERIFICATION_UNAVAILABLE',
    });
  });

  it('stores the Console guild name for the immutable guild ID, not the name typed into the form', async () => {
    request.mockResolvedValue({ rows: [{ player_id: '4', role_id: '100' }] });
    const response = await saveRequirements(
      {
        ...req('/api/guilds/2/requirements', { guildId: '2' }),
        body: { ...requirements, guildName: 'The Real Guild Of Someone Else', published: true },
      },
      {},
    );
    expect(JSON.parse(response.body).data.guildName).toBe('Crimson Skies');
    const [, , args] = redis.eval.mock.calls.at(-1)!;
    expect(JSON.parse(args[0]).guildName).toBe('Crimson Skies');
    expect(args[3]).toBe('guild:2');
  });

  it('refuses to save when the Console cannot confirm the guild name', async () => {
    request.mockResolvedValue({ rows: [{ player_id: '4', role_id: '100' }] });
    registry.name.mockResolvedValue(null);
    await expect(
      saveRequirements({ ...req('/api/guilds/2/requirements', { guildId: '2' }), body: requirements }, {}),
    ).rejects.toMatchObject({ statusCode: 503, code: 'GUILD_NAME_UNAVAILABLE' });
    expect(redis.eval).not.toHaveBeenCalled();
  });

  it('publishes and unlists a guild through one atomic Redis operation', async () => {
    request.mockResolvedValue({ rows: [{ player_id: '4', role_id: '100' }] });
    for (const published of [true, false]) {
      const data = { ...requirements, published, forged: 'ignored' };
      const response = await saveRequirements(
        { ...req('/api/guilds/2/requirements', { guildId: '2' }), body: data },
        {},
      );
      expect(JSON.parse(response.body).data).toEqual({ ...requirements, published });
      expect(redis.eval).toHaveBeenLastCalledWith(
        expect.stringContaining("redis.call('ZREM'"),
        ['arrakis:{guilds}:requirements:2', 'arrakis:{guilds}:requirements-index'],
        [JSON.stringify({ ...requirements, published }), published ? '1' : '0', expect.any(Number), 'guild:2'],
      );
    }
  });

  it('rejects members, officers, other guild leaders, and unlinked characters', async () => {
    for (const member of [
      { player_id: '4', role_id: '1' },
      { player_id: '4', role_id: '50' },
      { player_id: '99', role_id: '100' },
    ]) {
      request.mockResolvedValue({ rows: [member] });
      await expect(
        saveRequirements({ ...req('/api/guilds/2/requirements', { guildId: '2' }), body: requirements }, {}),
      ).rejects.toMatchObject({ statusCode: 403 });
      await expect(getRequirements(req('/api/guilds/2/requirements', { guildId: '2' }), {})).rejects.toMatchObject({
        statusCode: 403,
      });
    }
    linkedPlayer.mockResolvedValue({ linked: false, pawnId: '4' });
    request.mockResolvedValue({ rows: [{ player_id: '4', role_id: '100' }] });
    await expect(
      saveRequirements({ ...req('/api/guilds/2/requirements', { guildId: '2' }), body: requirements }, {}),
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(redis.eval).not.toHaveBeenCalled();
  });

  it('bounds input and requires requirements for published guilds', async () => {
    request.mockResolvedValue({ rows: [{ player_id: '4', role_id: '100' }] });
    for (const body of [
      { ...requirements, requirements: ' ' },
      { ...requirements, requirements: 'x'.repeat(2001) },
      { ...requirements, contact: 'x'.repeat(201) },
      { ...requirements, published: 'true' },
    ]) {
      await expect(
        saveRequirements({ ...req('/api/guilds/2/requirements', { guildId: '2' }), body }, {}),
      ).rejects.toMatchObject({ statusCode: 400 });
    }
    expect(redis.eval).not.toHaveBeenCalled();
  });

  it('lists only published, normalized records using bounded rank pagination', async () => {
    redis.zrange.mockResolvedValue(['guild:2', 'guild:3', 'guild:4']);
    redis.get.mockImplementation(async (key) =>
      key.endsWith(':2')
        ? { ...requirements, secret: 'omitted' }
        : key.endsWith(':3')
          ? { ...requirements, published: false }
          : { invalid: true },
    );
    const response = await listRequirements(req('/api/guilds/requirements', { page: '1' }), {});
    expect(JSON.parse(response.body).data).toEqual({ rows: [{ ...requirements, guildId: '2' }], hasMore: false });
    expect(redis.zrange).toHaveBeenCalledWith('arrakis:{guilds}:requirements-index', 20, 40, { byScore: false });
    session.mockResolvedValue(null);
    await expect(listRequirements(req('/api/guilds/requirements'), {})).rejects.toMatchObject({ statusCode: 401 });
  });
});

describe('guild API handlers', () => {
  it('rejects cross-site changes to guild settings and logos', async () => {
    const invalid = {
      ...req('/api/guilds/2/requirements', { guildId: '2' }),
      headers: { cookie: 'dashboard_session=test-session', origin: 'https://other.example', host: 'localhost' },
    };
    await expect(saveRequirements(invalid, {})).rejects.toMatchObject({ statusCode: 403, code: 'INVALID_ORIGIN' });
    await expect(saveLogo(invalid, {})).rejects.toMatchObject({ statusCode: 403, code: 'INVALID_ORIGIN' });
    expect(redis.eval).not.toHaveBeenCalled();
    expect(redis.set).not.toHaveBeenCalled();
  });
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
    expect(redis.set).toHaveBeenCalledWith('arrakis:{guilds}:logo:2', `data:image/png;base64,${png}`);

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

  it('streams a bounded PNG for listing images without embedding it in the catalog', async () => {
    const bytes = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0]);
    redis.get.mockResolvedValue(`data:image/png;base64,${bytes.toString('base64')}`);
    const response = await getLogo(req('/api/guilds/2/logo?image=1', { guildId: '2', image: '1' }), {});
    expect(response.headers['Content-Type']).toBe('image/png');
    expect(response.stream.maximumBytes).toBe(512 * 1024);
    expect((await response.stream.body.getReader().read()).value).toEqual(bytes);
    redis.get.mockResolvedValue(null);
    expect((await getLogo(req('/api/guilds/2/logo?image=1', { guildId: '2', image: '1' }), {})).status).toBe(204);
    redis.get.mockResolvedValue('data:image/png;base64,bm90LXBuZw==');
    await expect(getLogo(req('/api/guilds/2/logo?image=1', { guildId: '2', image: '1' }), {})).rejects.toMatchObject({
      statusCode: 404,
    });
  });
});
