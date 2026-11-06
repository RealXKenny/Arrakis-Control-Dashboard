import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GET, MESSAGES } from '../../src/modules/admin/server/guilds';
import { GET as LEADER_GET, POST as LEADER_POST, ADMIN_GET, ADMIN_POST } from '../../src/modules/guilds/server/support';

const { session, linkedPlayer, request, redis } = vi.hoisted(() => ({
  session: vi.fn(),
  linkedPlayer: vi.fn(),
  request: vi.fn(),
  redis: { get: vi.fn(), eval: vi.fn() },
}));
vi.mock('../../src/config/env', () => ({
  getServerEnv: () => ({
    DISCORD_GUILD_ID: 'guild',
    VERIFIED_MEMBER_ROLE_ID: 'verified',
    APP_URL: 'https://dashboard.test',
    LOG_LEVEL: 'FATAL',
  }),
}));
vi.mock('../../src/lib/security/session-store', () => ({ getSession: session }));
vi.mock('../../src/lib/redis/client', () => ({ getRedisClient: () => redis }));
vi.mock('../../src/modules/player/server/linked-player', () => ({ getLinkedPlayer: linkedPlayer }));
vi.mock('../../src/infrastructure/dune', () => ({ getDuneClient: () => ({ request }) }));
const id = 'a'.repeat(64);
const generation = 'a62f594e-7a04-47d7-b3f9-94f9abf8aaab';
const application = {
  id,
  discordId: 'applicant',
  discordName: 'Applicant',
  characterName: 'Explorer',
  submittedAt: 123456789,
  status: 'pending',
  conversationId: generation,
};
const message = {
  id: generation,
  text: 'Hello',
  senderId: 'leader',
  senderName: 'Leader',
  role: 'applicant',
  sentAt: 123456789,
};
const admin = () => ({
  user: { id: '456084885220884480', username: 'Admin' },
  guildId: 'guild',
  roleIds: ['verified'],
  expiresAt: Date.now() + 60000,
});
const req = (body?: unknown, query = {}) => ({
  query: { guildId: '2', applicationId: id, ...query },
  headers: { cookie: 'dashboard_session=test', origin: 'https://dashboard.test', host: 'dashboard.test' },
  body,
});
beforeEach(() => {
  vi.resetAllMocks();
  session.mockResolvedValue(admin());
  linkedPlayer.mockResolvedValue({ linked: true, pawnId: '4' });
  request.mockResolvedValue({ rows: [{ player_id: '4', role_id: '100' }] });
  redis.get.mockResolvedValue(null);
  redis.eval.mockImplementation(async (script, _keys, args) => {
    if (script === "return redis.call('HGET', KEYS[1], ARGV[1])") return JSON.stringify(application);
    if (script.includes('ZRANGE'))
      return Array.from({ length: 21 }, () => JSON.stringify({ ...application, privateExtra: 'stripped' }));
    if (script.includes('RPUSH')) return args[2];
    return [JSON.stringify({ ...message, privateExtra: 'stripped' }), 'bad JSON'];
  });
});
describe('administrator guild oversight', () => {
  it('requires the exact current administrator for every admin read and message write', async () => {
    for (const who of [
      null,
      { ...admin(), user: { id: 'other' } },
      { ...admin(), roleIds: [] },
      { ...admin(), guildId: 'wrong' },
      { ...admin(), expiresAt: 1 },
    ]) {
      session.mockResolvedValue(who);
      for (const handler of [GET, MESSAGES, ADMIN_GET])
        await expect(handler(req(), {})).rejects.toMatchObject({
          statusCode: who && who.expiresAt > Date.now() ? 403 : 401,
        });
      await expect(ADMIN_POST(req({ text: 'Hi', clientMessageId: generation }), {})).rejects.toMatchObject({
        statusCode: who && who.expiresAt > Date.now() ? 403 : 401,
      });
    }
    expect(redis.eval).not.toHaveBeenCalled();
  });
  it('returns at most 20 normalized applications and rejects invalid paging or targets', async () => {
    const response = await GET(req(undefined, { page: '1' }), {});
    expect(JSON.parse(response.body).data).toEqual({
      rows: Array.from({ length: 20 }, () => application),
      hasMore: true,
      listing: null,
    });
    expect(redis.eval).toHaveBeenCalledWith(
      expect.stringContaining('ZRANGE'),
      ['arrakis:guild-applications:2', 'arrakis:guild-applications-index:2'],
      [20, 40],
    );
    await expect(GET(req(undefined, { page: '10' }), {})).rejects.toMatchObject({ statusCode: 400 });
    await expect(GET(req(undefined, { guildId: '../bad' }), {})).rejects.toMatchObject({ statusCode: 400 });
  });
  it('inspects only the current conversation without writing applicant read receipts', async () => {
    const response = await MESSAGES(req(), {});
    expect(JSON.parse(response.body).data.messages).toEqual([message]);
    expect(redis.eval).toHaveBeenLastCalledWith(
      expect.stringContaining('~= ARGV[2]'),
      ['arrakis:guild-applications:2', `arrakis:guild-chat:2:${id}:${generation}`],
      [id, generation],
    );
    expect(redis.eval.mock.calls.every(([script]) => !script.includes("redis.call('SET'"))).toBe(true);
    redis.eval.mockResolvedValueOnce(JSON.stringify(application)).mockResolvedValueOnce(null);
    await expect(MESSAGES(req(), {})).rejects.toMatchObject({ statusCode: 404 });
    await expect(MESSAGES(req(undefined, { applicationId: '../bad' }), {})).rejects.toMatchObject({ statusCode: 400 });
  });
});
describe('guild leader administrator support chat', () => {
  it('uses server-owned sender identity, bounded deduplicated storage and separate guild keys', async () => {
    const response = await ADMIN_POST(
      req({ text: ' Welcome ', clientMessageId: generation, senderId: 'forged', role: 'applicant' }),
      {},
    );
    expect(JSON.parse(response.body).data).toMatchObject({
      text: 'Welcome',
      role: 'reviewer',
      senderId: admin().user.id,
      senderName: 'Admin',
    });
    expect(redis.eval).toHaveBeenCalledWith(
      expect.stringContaining("redis.call('LTRIM', KEYS[1], -100, -1)"),
      ['arrakis:guild-support:2'],
      [generation, admin().user.id, expect.any(String)],
    );
    expect(redis.eval.mock.calls[0][0]).toContain("redis.call('EXPIRE', KEYS[1], 7776000)");
    expect(request).not.toHaveBeenCalled();
    expect(JSON.parse((await ADMIN_GET(req(), {})).body).data.messages).toEqual([message]);
  });
  it('permits only the freshly verified current guild leader on member-facing routes', async () => {
    session.mockResolvedValue({ ...admin(), user: { id: 'leader', username: 'Leader' } });
    expect(JSON.parse((await LEADER_GET(req(), {})).body).data.messages).toEqual([message]);
    expect(JSON.parse((await LEADER_POST(req({ text: 'Help', clientMessageId: generation }), {})).body).data.role).toBe(
      'applicant',
    );
    request.mockResolvedValue({ rows: [{ player_id: '4', role_id: '1' }] });
    await expect(LEADER_GET(req(), {})).rejects.toMatchObject({ statusCode: 403 });
    await expect(LEADER_POST(req({ text: 'Help', clientMessageId: generation }), {})).rejects.toMatchObject({
      statusCode: 403,
    });
    request.mockResolvedValue({ rows: [{ player_id: 'another-player', role_id: '100' }] });
    await expect(LEADER_GET(req(undefined, { guildId: '3' }), {})).rejects.toMatchObject({ statusCode: 403 });
  });
  it('rejects cross-origin sends and malformed or oversized messages before storage', async () => {
    for (const handler of [ADMIN_POST, LEADER_POST]) {
      await expect(
        handler({ ...req({}), headers: { origin: 'https://other.test', host: 'dashboard.test' } }, {}),
      ).rejects.toMatchObject({ statusCode: 403 });
      await expect(handler(req({ text: 'x'.repeat(1001), clientMessageId: generation }), {})).rejects.toMatchObject({
        statusCode: 400,
      });
      await expect(handler(req({ text: 'Hello', clientMessageId: 'bad' }), {})).rejects.toMatchObject({
        statusCode: 400,
      });
    }
    expect(redis.eval).not.toHaveBeenCalled();
  });
});
