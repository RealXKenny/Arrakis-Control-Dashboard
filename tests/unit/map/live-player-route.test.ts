import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ session: vi.fn(), rate: vi.fn(), read: vi.fn() }));
vi.mock('../../../src/features/auth/server/session', () => ({ currentSession: mocks.session }));
vi.mock('../../../src/lib/security/rate-limit', () => ({ checkRateLimit: mocks.rate }));
vi.mock('../../../src/features/map/server/live-player', () => ({ readLivePlayer: mocks.read }));
import { GET } from '../../../src/app/api/v2/map/player-live/route';

beforeEach(() => {
  vi.resetAllMocks();
  mocks.session.mockResolvedValue({ user: { id: 'member' }, guildId: 'guild' });
  mocks.rate.mockResolvedValue({ allowed: true });
  mocks.read.mockResolvedValue(null);
});
const request = (map: string) => new Request(`https://dashboard.test/api/v2/map/player-live?map=${map}`);

describe('live player API', () => {
  it('requires a session and rejects unknown maps', async () => {
    mocks.session.mockResolvedValueOnce(null);
    expect((await GET(request('Arrakeen'))).status).toBe(401);
    expect((await GET(request('unknown'))).status).toBe(400);
    expect(mocks.read).not.toHaveBeenCalled();
  });
  it('enforces the per-account rate limit and no-store responses', async () => {
    mocks.rate.mockResolvedValueOnce({ allowed: false });
    expect((await GET(request('Arrakeen'))).status).toBe(429);
    expect(mocks.read).not.toHaveBeenCalled();
    const response = await GET(request('Arrakeen'));
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.json()).toEqual({ ok: true, position: null });
    expect(mocks.rate).toHaveBeenCalledWith('map-live:member', { limit: 60, windowMs: 60000 });
  });
});
