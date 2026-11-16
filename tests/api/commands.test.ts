import { beforeEach, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ session: vi.fn(), lookup: vi.fn(), limit: vi.fn() }));
vi.mock('../../src/features/auth/server/session', () => ({ currentSession: state.session }));
vi.mock('../../src/features/commands/server/lookup', () => ({ lookupAssets: state.lookup }));
vi.mock('../../src/lib/security/rate-limit', () => ({ checkRateLimit: state.limit }));
import { GET } from '../../src/app/api/v2/commands/assets/route';
const request = (params = 'q=shelter') => new Request(`http://localhost/api/v2/commands/assets?${params}`);
beforeEach(() => {
  vi.clearAllMocks();
  state.session.mockResolvedValue({ user: { id: 'session-owner' } });
  state.limit.mockResolvedValue({ allowed: true });
  state.lookup.mockResolvedValue({ assets: [], partial: false, checkedAt: new Date().toISOString() });
});
it('requires verified sessions and keeps asset results no-store', async () => {
  expect((await GET(request())).headers.get('cache-control')).toBe('no-store');
  expect(state.lookup).toHaveBeenCalledWith({ user: { id: 'session-owner' } }, 'shelter', expect.any(AbortSignal));
  state.session.mockResolvedValue(null);
  state.lookup.mockClear();
  expect((await GET(request())).status).toBe(401);
  expect(state.lookup).not.toHaveBeenCalled();
});
it('rejects caller identity, provider URLs, missing and repeated query fields', async () => {
  for (const params of ['owner=foreign&q=shelter', 'url=https://provider&q=a', '', 'q=a&q=b'])
    expect((await GET(request(params))).status).toBe(400);
  expect(state.lookup).not.toHaveBeenCalled();
});
it('fails closed on missing rate protection and quota exhaustion', async () => {
  state.limit.mockResolvedValueOnce({ allowed: true, storageUnavailable: true });
  expect((await GET(request())).status).toBe(503);
  state.limit.mockResolvedValueOnce({ allowed: false });
  expect((await GET(request())).status).toBe(429);
  expect(state.lookup).not.toHaveBeenCalled();
});
