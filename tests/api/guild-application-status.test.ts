import { createHash } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GET } from '../../src/features/guilds/server/application-status';
const { session, redis } = vi.hoisted(() => ({ session: vi.fn(), redis: { eval: vi.fn() } }));
vi.mock('../../src/features/auth/server/session', () => {
  const getSession = session;
  return { getSession, currentSession: () => getSession() };
});
vi.mock('../../src/lib/redis/client', () => ({ getRedisClient: () => redis }));
const id = createHash('sha256').update('2:user').digest('hex');
const req = (guildIds = '2,3') => ({ query: { guildIds }, headers: { cookie: 'dashboard_session=test' } });
beforeEach(() => {
  vi.resetAllMocks();
  session.mockResolvedValue({ user: { id: 'user' }, expiresAt: Date.now() + 60000 });
  redis.eval.mockImplementation(async (_script, keys) => (keys[0].endsWith(':2') ? [id, 'pending', 2] : null));
});
describe('own application card summaries', () => {
  it('returns only own status and unread count, including guilds without an application', async () => {
    const response = await GET(req(), {});
    expect(JSON.parse(response.body).data).toEqual({
      applications: { '2': { id, status: 'pending', unreadCount: 2 }, '3': null },
    });
    expect(redis.eval).toHaveBeenCalledWith(
      expect.stringContaining('application.discordId ~= ARGV[2]'),
      ['arrakis:{guilds}:applications:2'],
      [id, 'user', `arrakis:{guilds}:chat:2:${id}:`],
    );
  });
  it('requires authentication and bounds distinct guild IDs before storage access', async () => {
    session.mockResolvedValueOnce(null);
    await expect(GET(req(), {})).rejects.toMatchObject({ statusCode: 401 });
    for (const ids of ['', '2,2', '../bad', 'a'.repeat(129), Array.from({ length: 21 }, (_, i) => String(i)).join(',')])
      await expect(GET(req(ids), {})).rejects.toMatchObject({ statusCode: 400 });
    expect(redis.eval).not.toHaveBeenCalled();
  });
});
