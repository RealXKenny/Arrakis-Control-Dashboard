import { beforeEach, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ session: vi.fn(), find: vi.fn(), limit: vi.fn() }));
vi.mock('../../src/features/auth/server/session', () => ({ currentSession: state.session }));
vi.mock('../../src/features/player/server/item-finder', () => ({ findItems: state.find }));
vi.mock('../../src/lib/security/rate-limit', () => ({ checkRateLimit: state.limit }));
vi.mock('../../src/lib/security/audit', () => ({ recordAudit: vi.fn() }));
import { GET } from '../../src/app/api/v2/items/find/route';
beforeEach(() => {
  vi.clearAllMocks();
  state.session.mockResolvedValue({ user: { id: 'verified' } });
  state.limit.mockResolvedValue({ allowed: true });
  state.find.mockResolvedValue({ items: [], sources: [], limited: false });
});
it('denies anonymous requests before any source reads', async () => {
  state.session.mockResolvedValue(null);
  const response = await GET(new Request('http://localhost/api/v2/items/find?q=spice'));
  expect(response.status).toBe(401);
  expect(state.find).not.toHaveBeenCalled();
});
it('uses the session only and propagates cancellation with private no-store results', async () => {
  const request = new Request('http://localhost/api/v2/items/find?q=spice&playerId=foreign&baseId=999');
  const response = await GET(request);
  expect(response.status).toBe(200);
  expect(response.headers.get('Cache-Control')).toBe('no-store');
  expect(state.find).toHaveBeenCalledWith({ user: { id: 'verified' } }, 'spice', request.signal);
});
it('throttles the signed-in member before searching', async () => {
  state.limit.mockResolvedValue({ allowed: false, retryAfter: 15 });
  const response = await GET(new Request('http://localhost/api/v2/items/find?q=spice'));
  expect(response.status).toBe(429);
  expect(state.find).not.toHaveBeenCalled();
});
