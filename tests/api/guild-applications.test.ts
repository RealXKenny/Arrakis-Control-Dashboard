import { createHash } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GET, POST, LIST, REVIEW } from '../../src/modules/guilds/server/applications';

const { session, linkedPlayer, request, redis } = vi.hoisted(() => ({
  session: vi.fn(),
  linkedPlayer: vi.fn(),
  request: vi.fn(),
  redis: { get: vi.fn(), eval: vi.fn() },
}));
vi.mock('../../src/lib/security/session-store', () => ({ getSession: session }));
vi.mock('../../src/modules/player/server/linked-player', () => ({ getLinkedPlayer: linkedPlayer }));
vi.mock('../../src/infrastructure/dune', () => ({ getDuneClient: () => ({ request }) }));
vi.mock('../../src/lib/redis/client', () => ({ getRedisClient: () => redis }));
const req = (body?: unknown, query = {}) => ({
  url: '/api/guilds/2/application',
  query: { guildId: '2', ...query },
  headers: { cookie: 'dashboard_session=test', origin: 'http://localhost', host: 'localhost' },
  body,
});
const input = {
  playStyle: 'Both',
  timezone: 'US Eastern',
  availability: 'Weekday evenings',
  experience: 'Explorer and builder',
  message: 'I would like to help build and gather.',
};
const id = createHash('sha256').update('2:discord-user').digest('hex');
const application = {
  ...input,
  id,
  discordId: 'discord-user',
  discordName: 'Discord Survivor',
  characterName: 'Survivor',
  submittedAt: 123456789,
  status: 'pending',
};

beforeEach(() => {
  vi.resetAllMocks();
  session.mockResolvedValue({
    user: { id: 'discord-user', username: 'Discord Survivor' },
    guildId: 'discord-guild',
    roleIds: [],
    expiresAt: Date.now() + 60000,
  });
  linkedPlayer.mockResolvedValue({ linked: true, pawnId: '4', characterName: 'Survivor' });
  request.mockResolvedValue({ rows: [{ player_id: '4', role_id: '100' }] });
  redis.get.mockResolvedValue({
    guildName: 'Crimson Skies',
    requirements: 'Be friendly',
    contact: '',
    published: true,
  });
  redis.eval.mockResolvedValue(1);
});

describe('guild applications', () => {
  it('rejects missing or cross-site mutation origins before storing or reviewing answers', async () => {
    for (const origin of [undefined, 'https://other.example']) {
      const invalid = { ...req(input), headers: { cookie: 'dashboard_session=test', host: 'localhost', origin } };
      await expect(POST(invalid, {})).rejects.toMatchObject({ statusCode: 403, code: 'INVALID_ORIGIN' });
      await expect(REVIEW(invalid, {})).rejects.toMatchObject({ statusCode: 403, code: 'INVALID_ORIGIN' });
    }
    expect(redis.eval).not.toHaveBeenCalled();
  });
  it('requires a dashboard session for every application operation', async () => {
    session.mockResolvedValue(null);
    for (const handler of [GET, POST, LIST, REVIEW])
      await expect(handler(req(input), {})).rejects.toMatchObject({ statusCode: 401 });
    expect(redis.eval).not.toHaveBeenCalled();
  });

  it('submits bounded answers with server-verified identity instead of submitted identity', async () => {
    const response = await POST(
      req({ ...input, discordId: 'forged', characterName: 'Forged', status: 'accepted' }),
      {},
    );
    expect(response.status).toBe(201);
    const data = JSON.parse(response.body).data;
    expect(data).toMatchObject({ ...application, submittedAt: expect.any(Number) });
    expect(redis.eval).toHaveBeenCalledWith(
      expect.stringContaining("redis.call('HEXISTS'"),
      ['arrakis:guild-applications:2', 'arrakis:guild-applications-index:2', 'arrakis:guild-requirements:2'],
      [id, JSON.stringify(data), -data.submittedAt, 90 * 86400],
    );
  });

  it('only reads the current user’s application even with another application ID in the query', async () => {
    redis.eval.mockResolvedValue(JSON.stringify({ ...application, secret: 'stripped' }));
    const response = await GET(req(undefined, { applicationId: 'another-user' }), {});
    expect(JSON.parse(response.body).data).toEqual(application);
    expect(redis.eval).toHaveBeenCalledWith(expect.any(String), ['arrakis:guild-applications:2'], [id]);
  });

  it('rejects closed listings, duplicate applications, full inboxes, and unlinked players', async () => {
    for (const [result, code] of [
      [-1, 'GUILD_NOT_RECRUITING'],
      [-2, 'GUILD_APPLICATION_EXISTS'],
      [-3, 'GUILD_APPLICATION_INBOX_FULL'],
    ] as const) {
      redis.eval.mockResolvedValue(result);
      await expect(POST(req(input), {})).rejects.toMatchObject({ statusCode: 409, code });
    }
    redis.get.mockResolvedValue({ guildName: 'Closed', requirements: '', contact: '', published: false });
    await expect(POST(req(input), {})).rejects.toMatchObject({ statusCode: 409, code: 'GUILD_NOT_RECRUITING' });
    redis.get.mockResolvedValue({ guildName: 'Open', requirements: 'Be friendly', contact: '', published: true });
    linkedPlayer.mockResolvedValue({ linked: false });
    await expect(POST(req(input), {})).rejects.toMatchObject({ statusCode: 403 });
  });

  it('validates answers, IDs, and paging before accessing inbox data', async () => {
    for (const body of [
      { ...input, message: 'x'.repeat(1501) },
      { ...input, timezone: '' },
      { ...input, playStyle: 'anything' },
    ])
      await expect(POST(req(body), {})).rejects.toMatchObject({ statusCode: 400 });
    await expect(GET(req(undefined, { guildId: '../bad' }), {})).rejects.toMatchObject({ statusCode: 400 });
    await expect(LIST(req(undefined, { page: '10' }), {})).rejects.toMatchObject({ statusCode: 400 });
    await expect(REVIEW(req({ applicationId: id, status: 'owner' }), {})).rejects.toMatchObject({ statusCode: 400 });
    expect(redis.eval).not.toHaveBeenCalled();
  });

  it('keeps all applicants’ data and review actions restricted to that guild’s verified leader', async () => {
    request.mockResolvedValue({ rows: [{ player_id: 'other-player', role_id: '100' }] });
    await expect(LIST(req(), {})).rejects.toMatchObject({ statusCode: 403 });
    await expect(REVIEW(req({ applicationId: id, status: 'accepted' }), {})).rejects.toMatchObject({ statusCode: 403 });
    expect(redis.eval).not.toHaveBeenCalled();
  });

  it('returns at most 20 normalized applications and supports recording decisions and removal', async () => {
    redis.eval.mockResolvedValue(
      Array.from({ length: 21 }, () => JSON.stringify({ ...application, secret: 'stripped' })),
    );
    const inbox = await LIST(req(undefined, { page: '1' }), {});
    expect(JSON.parse(inbox.body).data).toEqual({ rows: Array.from({ length: 20 }, () => application), hasMore: true });
    expect(redis.eval).toHaveBeenCalledWith(
      expect.stringContaining("redis.call('ZRANGE'"),
      ['arrakis:guild-applications:2', 'arrakis:guild-applications-index:2'],
      [20, 40],
    );
    for (const status of ['accepted', 'declined']) {
      redis.eval.mockResolvedValue(JSON.stringify({ ...application, status }));
      const response = await REVIEW(req({ applicationId: id, status }), {});
      expect(JSON.parse(response.body).data.status).toBe(status);
    }
    redis.eval.mockResolvedValue('removed');
    expect(JSON.parse((await REVIEW(req({ applicationId: id, status: 'remove' }), {})).body).data).toBeNull();
    redis.eval.mockResolvedValue(null);
    await expect(REVIEW(req({ applicationId: id, status: 'accepted' }), {})).rejects.toMatchObject({ statusCode: 404 });
  });
});
