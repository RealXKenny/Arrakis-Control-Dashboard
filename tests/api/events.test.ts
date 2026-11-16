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
    DISCORD_GUILD_ID: 'guild',
    VERIFIED_MEMBER_ROLE_ID: 'member',
  }),
}));
import { GET as PUBLIC } from '../../src/app/api/v2/events/route';
const seed = firstCommunityEvent();
const session = {
  user: { id: '456084885220884480' },
  guildId: 'guild',
  roleIds: ['member'],
  authenticatedAt: Date.now(),
  expiresAt: Date.now() + 60000,
};
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
  it('lets members read published events without accepting an include-drafts query', async () => {
    mocks.session.mockResolvedValue({ ...session, user: { id: 'member' } });
    const response = await PUBLIC(new Request('https://dashboard.test/api/v2/events?includeDrafts=true'));
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(mocks.list).toHaveBeenCalledWith();
  });
});
