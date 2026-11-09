import { beforeEach, describe, expect, it, vi } from 'vitest';
import { firstCommunityEvent } from '../../src/features/events/contracts';
const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  list: vi.fn(),
  save: vi.fn(),
  remove: vi.fn(),
  limit: vi.fn(),
  sync: vi.fn(),
  withdraw: vi.fn(),
}));
vi.mock('../../src/features/events/server/announce', () => ({
  syncCommunityEvent: mocks.sync,
  withdrawCommunityEvent: mocks.withdraw,
}));
vi.mock('../../src/features/auth/server/session', () => ({ currentSession: mocks.session }));
vi.mock('../../src/features/events/server/store', () => ({
  listCommunityEvents: mocks.list,
  saveCommunityEvent: mocks.save,
  deleteCommunityEvent: mocks.remove,
}));
vi.mock('../../src/lib/security/rate-limit', () => ({ checkRateLimit: mocks.limit }));
vi.mock('../../src/config/env', () => ({
  getServerEnv: () => ({
    NODE_ENV: 'test',
    LOG_LEVEL: 'FATAL',
    APP_URL: 'https://dashboard.test',
    ADMIN_DISCORD_IDS: '456084885220884480',
    DISCORD_GUILD_ID: 'guild',
    VERIFIED_MEMBER_ROLE_ID: 'member',
  }),
}));
import { GET, POST, PATCH, DELETE } from '../../src/app/api/v2/admin/events/route';
import { GET as PUBLIC } from '../../src/app/api/v2/events/route';
const seed = firstCommunityEvent();
const session = {
  user: { id: '456084885220884480' },
  guildId: 'guild',
  roleIds: ['member'],
  authenticatedAt: Date.now(),
  expiresAt: Date.now() + 60000,
};
const call = (method: string, body: unknown, origin = 'https://dashboard.test') =>
  ({ POST, PATCH, DELETE })[method]!(
    new Request('https://dashboard.test/api/v2/admin/events', {
      method,
      headers: { origin, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  );
beforeEach(() => {
  vi.clearAllMocks();
  mocks.session.mockResolvedValue(session);
  mocks.list.mockResolvedValue([seed]);
  mocks.save.mockResolvedValue(seed);
  mocks.remove.mockResolvedValue(undefined);
  mocks.limit.mockResolvedValue({ allowed: true });
  mocks.sync.mockResolvedValue({ status: 'sent' });
  mocks.withdraw.mockResolvedValue({ status: 'unchanged' });
});
describe('event access and publication', () => {
  it('announces after publication is saved, withdraws drafts, and preserves a save when Discord fails', async () => {
    const response = await call('PATCH', seed);
    expect((await response.json()).discord).toEqual({ status: 'sent' });
    expect(mocks.sync).toHaveBeenCalledWith(seed.id);
    expect(mocks.save.mock.invocationCallOrder[0]).toBeLessThan(mocks.sync.mock.invocationCallOrder[0]);
    mocks.sync.mockRejectedValue(new Error('provider unavailable'));
    const failed = await call('PATCH', seed);
    expect(failed.status).toBe(200);
    expect((await failed.json()).discord.status).toBe('failed');
    mocks.save.mockResolvedValue({ ...seed, visibility: 'draft' });
    await call('PATCH', { ...seed, visibility: 'draft' });
    expect(mocks.withdraw).toHaveBeenCalledWith(seed.id);
  });
  it('lets members read published events without accepting an include-drafts query', async () => {
    mocks.session.mockResolvedValue({ ...session, user: { id: 'member' } });
    const response = await PUBLIC(new Request('https://dashboard.test/api/v2/events?includeDrafts=true'));
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(mocks.list).toHaveBeenCalledWith();
    expect((await GET(new Request('https://dashboard.test/api/v2/admin/events'))).status).toBe(403);
  });
  it('requires authentication independently for both reads and administrator writes', async () => {
    mocks.session.mockResolvedValue(null);
    expect((await PUBLIC(new Request('https://dashboard.test/api/v2/events'))).status).toBe(401);
    expect((await call('POST', seed)).status).toBe(401);
    expect(mocks.save).not.toHaveBeenCalled();
  });
  it('checks administrator ID, guild and role for mutations', async () => {
    for (const bad of [
      { ...session, user: { id: 'ordinary' } },
      { ...session, guildId: 'wrong' },
      { ...session, roleIds: [] },
    ]) {
      mocks.session.mockResolvedValue(bad);
      expect((await call('PATCH', seed)).status).toBe(403);
    }
    expect(mocks.save).not.toHaveBeenCalled();
  });
  it('refuses cross-origin changes, stale sign-ins and oversized or malformed bodies', async () => {
    expect((await call('PATCH', seed, 'https://evil.test')).status).toBe(403);
    mocks.session.mockResolvedValue({ ...session, authenticatedAt: Date.now() - 2 * 3600000 });
    expect((await call('PATCH', seed)).status).toBe(403);
    mocks.session.mockResolvedValue(session);
    expect((await call('POST', { ...seed, description: 'x'.repeat(25000) })).status).toBe(413);
    expect((await call('PATCH', { ...seed, prizeSolaris: -1 })).status).toBe(400);
    expect(mocks.save).not.toHaveBeenCalled();
  });
  it('creates a bounded event, strips forged metadata, and requires a revision for edits and deletion', async () => {
    const id = '56bf9d52-01b2-403a-b098-06d4ddfe1ea1';
    expect((await call('POST', { ...seed, id, revision: 0, createdAt: 'forged', createdBy: 'someone' })).status).toBe(
      201,
    );
    expect(mocks.save).toHaveBeenCalledWith(id, expect.objectContaining({ prizeSolaris: 500000 }), 0);
    expect(mocks.save.mock.calls[0][1]).not.toHaveProperty('createdBy');
    expect(mocks.save.mock.calls[0][1]).not.toHaveProperty('createdAt');
    expect((await call('PATCH', seed)).status).toBe(200);
    expect((await call('DELETE', { id: seed.id, revision: 1 })).status).toBe(200);
    expect(mocks.remove).toHaveBeenCalledWith(seed.id, 1);
    expect((await call('DELETE', { id: seed.id })).status).toBe(400);
  });
});
