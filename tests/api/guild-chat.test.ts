import { createHash } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GET, POST, READ } from '../../src/modules/guilds/server/chat';

const { session, linkedPlayer, request, redis } = vi.hoisted(() => ({
  session: vi.fn(),
  linkedPlayer: vi.fn(),
  request: vi.fn(),
  redis: { eval: vi.fn() },
}));
vi.mock('../../src/lib/security/session-store', () => ({ getSession: session }));
vi.mock('../../src/modules/player/server/linked-player', () => ({ getLinkedPlayer: linkedPlayer }));
vi.mock('../../src/infrastructure/dune', () => ({ getDuneClient: () => ({ request }) }));
vi.mock('../../src/lib/redis/client', () => ({ getRedisClient: () => redis }));
const id = createHash('sha256').update('2:discord-user').digest('hex');
const generation = 'a62f594e-7a04-47d7-b3f9-94f9abf8aaab';
const messageId = 'b62f594e-7a04-47d7-b3f9-94f9abf8aaab';
const application = {
  playStyle: 'Both',
  timezone: 'Eastern',
  availability: 'Evenings',
  experience: 'Builder',
  message: 'Hello',
  id,
  discordId: 'discord-user',
  discordName: 'Survivor',
  characterName: 'Explorer',
  submittedAt: 123456789,
  status: 'pending',
  conversationId: generation,
};
const message = {
  id: messageId,
  text: 'Hello reviewer',
  senderId: 'discord-user',
  senderName: 'Survivor',
  role: 'applicant',
  sentAt: 123456789,
};
const req = (body?: unknown, query = {}) => ({
  url: `/api/guilds/2/applications/${id}/messages`,
  query: { guildId: '2', applicationId: id, ...query },
  headers: { cookie: 'dashboard_session=test', origin: 'http://localhost', host: 'localhost' },
  body,
});
beforeEach(() => {
  vi.resetAllMocks();
  session.mockResolvedValue({
    user: { id: 'discord-user', username: 'Survivor' },
    guildId: 'discord-guild',
    roleIds: [],
    expiresAt: Date.now() + 60000,
  });
  linkedPlayer.mockResolvedValue({ linked: true, pawnId: '4', characterName: 'Explorer' });
  request.mockResolvedValue({ rows: [{ player_id: '4', role_id: '100' }] });
  redis.eval.mockImplementation(async (script: string, _keys, args) => {
    if (script === "return redis.call('HGET', KEYS[1], ARGV[1])") return JSON.stringify(application);
    if (script.includes("redis.call('SET', KEYS[2] .. ':seen'")) return 1;
    if (script.includes('RPUSH')) return args[4];
    return [JSON.stringify({ ...message, secret: 'omitted' }), 'invalid JSON'];
  });
});

describe('private application chat', () => {
  it('allows applicants to read only their own bounded, normalized conversation', async () => {
    const response = await GET(req(), {});
    expect(JSON.parse(response.body).data.messages).toEqual([message]);
    expect(request).not.toHaveBeenCalled();
    expect(redis.eval).toHaveBeenLastCalledWith(
      expect.stringContaining("'LRANGE', KEYS[2], -100, -1"),
      ['arrakis:guild-applications:2', `arrakis:guild-chat:2:${id}:${generation}`],
      [id, generation],
    );
  });

  it('requires a session and rejects other members or leaders of a different guild', async () => {
    session.mockResolvedValue(null);
    await expect(GET(req(), {})).rejects.toMatchObject({ statusCode: 401 });
    session.mockResolvedValue({
      user: { id: 'intruder', username: 'Intruder' },
      guildId: 'discord-guild',
      roleIds: [],
      expiresAt: Date.now() + 60000,
    });
    request.mockResolvedValue({ rows: [{ player_id: 'another-player', role_id: '100' }] });
    await expect(GET(req(), {})).rejects.toMatchObject({ statusCode: 403 });
    await expect(POST(req({ text: 'forbidden', clientMessageId: messageId }), {})).rejects.toMatchObject({
      statusCode: 403,
    });
    expect(redis.eval).not.toHaveBeenCalled();
  });

  it('verifies the current leader for reviewer reads and writes, using server-side sender identity', async () => {
    session.mockResolvedValue({
      user: { id: 'reviewer', username: 'Guild Leader' },
      guildId: 'discord-guild',
      roleIds: [],
      expiresAt: Date.now() + 60000,
    });
    await GET(req(), {});
    const response = await POST(
      req({ text: ' Welcome ', clientMessageId: messageId, role: 'applicant', senderId: 'forged' }),
      {},
    );
    expect(JSON.parse(response.body).data).toMatchObject({
      text: 'Welcome',
      senderId: 'reviewer',
      senderName: 'Guild Leader',
      role: 'reviewer',
    });
    expect(request).toHaveBeenCalledTimes(2);
    expect(request).toHaveBeenCalledWith('GET', '/api/guilds/2/members');
    request.mockResolvedValue({ rows: [{ player_id: '4', role_id: '1' }] });
    await expect(GET(req(), {})).rejects.toMatchObject({ statusCode: 403 });
  });

  it('rejects oversized, blank, malformed, or cross-site messages', async () => {
    for (const body of [
      { text: ' ', clientMessageId: messageId },
      { text: 'x'.repeat(1001), clientMessageId: messageId },
      { text: 'Hello', clientMessageId: 'invalid' },
    ])
      await expect(POST(req(body), {})).rejects.toMatchObject({ statusCode: 400 });
    const crossSite = {
      ...req({ text: 'Hello', clientMessageId: messageId }),
      headers: { cookie: 'dashboard_session=test', host: 'localhost', origin: 'https://other.example' },
    };
    await expect(POST(crossSite, {})).rejects.toMatchObject({ statusCode: 403, code: 'INVALID_ORIGIN' });
    await expect(GET(req(undefined, { applicationId: '../bad' }), {})).rejects.toMatchObject({ statusCode: 400 });
    expect(redis.eval).not.toHaveBeenCalled();
  });

  it('guards against removed or replaced applications and expires bounded, deduplicated message history', async () => {
    await POST(req({ text: 'Hello reviewer', clientMessageId: messageId }), {});
    const [script, keys, args] = redis.eval.mock.calls[1];
    expect(script).toContain("redis.call('TTL', KEYS[1])");
    expect(script).toContain("redis.call('LTRIM', KEYS[2], -100, -1)");
    expect(script).toContain('existing.id == ARGV[3] and existing.senderId == ARGV[4]');
    expect(script).toContain("redis.call('EXPIRE', KEYS[2], ttl)");
    expect(keys[1]).toBe(`arrakis:guild-chat:2:${id}:${generation}`);
    expect(args.slice(0, 4)).toEqual([id, generation, messageId, 'discord-user']);
    redis.eval.mockImplementation(async (nextScript: string) =>
      nextScript === "return redis.call('HGET', KEYS[1], ARGV[1])" ? JSON.stringify(application) : null,
    );
    await expect(GET(req(), {})).rejects.toMatchObject({ statusCode: 404 });
    await expect(POST(req({ text: 'Too late', clientMessageId: messageId }), {})).rejects.toMatchObject({
      statusCode: 404,
    });
    redis.eval.mockResolvedValue(null);
    await expect(GET(req(), {})).rejects.toMatchObject({ statusCode: 404 });
  });
});

describe('applicant read receipts', () => {
  it('acknowledges only specified reviewer messages in the current submission and returns remaining unread messages', async () => {
    const response = await READ(req({ messages: [{ id: messageId, senderId: 'leader' }] }), {});
    expect(JSON.parse(response.body).data).toEqual({ unreadCount: 1 });
    const [script, keys, args] = redis.eval.mock.calls[1];
    expect(keys).toEqual(['arrakis:guild-applications:2', `arrakis:guild-chat:2:${id}:${generation}`]);
    expect(args).toEqual([id, generation, JSON.stringify(['leader:' + messageId])]);
    expect(script).toContain('if seen[key] then table.insert(retained, key) end');
    expect(script).toContain("'EX', ttl");
  });
  it('rejects foreign origins, oversized receipts, reviewers and replaced submissions', async () => {
    await expect(
      READ({ ...req({ messages: [] }), headers: { origin: 'https://evil.example', host: 'localhost' } }, {}),
    ).rejects.toMatchObject({ statusCode: 403 });
    await expect(
      READ(req({ messages: Array.from({ length: 101 }, () => ({ id: messageId, senderId: 'leader' })) }), {}),
    ).rejects.toMatchObject({ statusCode: 400 });
    session.mockResolvedValue({ user: { id: 'reviewer' }, expiresAt: Date.now() + 60000 });
    await expect(READ(req({ messages: [] }), {})).rejects.toMatchObject({ statusCode: 403 });
    session.mockResolvedValue({ user: { id: 'discord-user' }, expiresAt: Date.now() + 60000 });
    redis.eval.mockImplementation(async (script) =>
      script === "return redis.call('HGET', KEYS[1], ARGV[1])" ? JSON.stringify(application) : null,
    );
    await expect(READ(req({ messages: [] }), {})).rejects.toMatchObject({ statusCode: 404 });
  });
});
