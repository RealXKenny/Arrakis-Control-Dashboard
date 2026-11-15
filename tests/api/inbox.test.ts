import { beforeEach, expect, it, vi } from 'vitest';
import { defaultNotifications } from '../../src/features/inbox/preferences';
const state = vi.hoisted(() => ({
  preferences: vi.fn(),
  session: vi.fn(),
  limit: vi.fn(),
  profile: vi.fn(),
  member: vi.fn(),
  supply: vi.fn(),
  operations: vi.fn(),
}));
vi.mock('../../src/features/inbox/server/preferences-store', () => ({ readNotifications: state.preferences }));
vi.mock('../../src/features/auth/server/session', () => ({ currentSession: state.session }));
vi.mock('../../src/lib/security/rate-limit', () => ({ checkRateLimit: state.limit }));
vi.mock('../../src/lib/security/audit', () => ({ recordAudit: vi.fn() }));
vi.mock('../../src/features/portal/server/load', () => ({ loadPortalProfile: state.profile }));
vi.mock('../../src/features/guilds/server/member-access', () => ({ requireGuildMember: state.member }));
vi.mock('../../src/features/guilds/server/operations-store', () => ({ readGuildOperations: state.operations }));
vi.mock('../../src/features/guilds/server/resource-requests-store', () => ({ readResourceRequests: state.supply }));
import { GET } from '../../src/app/api/v2/inbox/route';
import { buildPortalProfile } from '../../src/features/portal/view-model';
const req = () => new Request('http://localhost/api/v2/inbox?guildId=foreign&owner=foreign');
const session = { user: { id: 'self' } };
beforeEach(() => {
  vi.clearAllMocks();
  state.preferences.mockResolvedValue(defaultNotifications());
  state.session.mockResolvedValue(session);
  state.limit.mockResolvedValue({ allowed: true });
  state.profile.mockResolvedValue({
    status: 'ok',
    profile: buildPortalProfile({ details: { guild: { id: 'verified-guild', name: 'Guild' } } }),
  });
  state.member.mockResolvedValue({ memberId: 'canonical-self', canEdit: false });
  state.supply.mockResolvedValue([]);
  state.operations.mockResolvedValue([]);
});
it('does not bypass stored controls or load private sources during a notification storage outage', async () => {
  state.preferences.mockRejectedValueOnce(new Error('private Redis failure'));
  const response = await GET(req());
  expect(response.status).toBe(500);
  expect(state.profile).not.toHaveBeenCalled();
  expect(JSON.stringify(await response.json())).not.toContain('private Redis failure');
});
it('requires a session and fails closed on unavailable request protection', async () => {
  state.session.mockResolvedValueOnce(null);
  expect((await GET(req())).status).toBe(401);
  expect(state.profile).not.toHaveBeenCalled();
  state.limit.mockResolvedValueOnce({ allowed: true, storageUnavailable: true });
  expect((await GET(req())).status).toBe(503);
  state.limit.mockResolvedValueOnce({ allowed: false });
  expect((await GET(req())).status).toBe(429);
  expect(state.profile).not.toHaveBeenCalled();
});
it('uses only session identity and verifies the reported guild before private reads', async () => {
  const response = await GET(req());
  expect(response.headers.get('cache-control')).toBe('no-store');
  expect(state.profile).toHaveBeenCalledWith(session);
  expect(state.member).toHaveBeenCalledWith(session, 'verified-guild');
  expect(state.supply).toHaveBeenCalledWith('verified-guild');
  const { data } = await response.json();
  expect(data.sources.find((s: { category: string }) => s.category === 'market').status).toBe('unsupported');
});
it('does not read guild records after membership refusal, missing canonical ID or unlinked profile', async () => {
  for (const failure of ['refusal', 'missing', 'unlinked']) {
    if (failure === 'refusal') state.member.mockRejectedValueOnce(new Error('secret provider detail'));
    if (failure === 'missing') state.member.mockResolvedValueOnce({ memberId: null });
    if (failure === 'unlinked') state.profile.mockResolvedValueOnce({ status: 'unlinked' });
    const body = JSON.stringify(await (await GET(req())).json());
    expect(body).not.toContain('secret provider detail');
    expect(state.supply).not.toHaveBeenCalled();
    expect(state.operations).not.toHaveBeenCalled();
  }
});
it('isolates source failures and removes member IDs from actionable operation summaries', async () => {
  state.supply.mockRejectedValueOnce(new Error('Redis secret'));
  state.operations.mockResolvedValueOnce([
    {
      id: 'opaque-operation',
      title: 'Upcoming trip',
      status: 'scheduled',
      startsAt: new Date(Date.now() + 1000).toISOString(),
      endsAt: new Date(Date.now() + 60000).toISOString(),
      signups: [{ memberId: 'canonical-self' }],
    },
  ]);
  const { data } = await (await GET(req())).json();
  expect(data.sources[1].status).toBe('unavailable');
  expect(data.sources[3].status).toBe('checked');
  expect(data.alerts[0]).toMatchObject({ id: expect.stringMatching(/^[a-f0-9]{64}$/), href: '/guild?tab=operations' });
  expect(JSON.stringify(data)).not.toContain('canonical-self');
  expect(JSON.stringify(data)).not.toContain('Redis secret');
});
