import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ session: vi.fn(), rate: vi.fn(), read: vi.fn() }));
vi.mock('../../../src/features/auth/server/session', () => ({ currentSession: mocks.session }));
vi.mock('../../../src/lib/security/rate-limit', () => ({ checkRateLimit: mocks.rate }));
vi.mock('../../../src/features/map/server/hub-poi', () => ({ readHubPoi: mocks.read }));
import { GET } from '../../../src/app/api/v2/map/poi/route';

beforeEach(() => {
  vi.resetAllMocks();
  mocks.session.mockResolvedValue({ user: { id: 'member' }, guildId: 'guild' });
  mocks.rate.mockResolvedValue({ allowed: true });
  mocks.read.mockResolvedValue([{ id: 'Bank:1:2', subtype: 'Bank', x: 1, y: 2 }]);
});
const request = (map: string) => new Request(`https://dashboard.test/api/v2/map/poi?map=${map}`);

describe('hub points of interest API', () => {
  it('requires a session and only serves Harko Village', async () => {
    mocks.session.mockResolvedValueOnce(null);
    expect((await GET(request('HarkoVillage'))).status).toBe(401);
    expect((await GET(request('Arrakeen'))).status).toBe(400);
    expect(mocks.read).not.toHaveBeenCalled();
  });
  it('rate limits per account, returns no-store data and fails closed when the Console is unavailable', async () => {
    mocks.rate.mockResolvedValueOnce({ allowed: false });
    expect((await GET(request('HarkoVillage'))).status).toBe(429);
    const ok = await GET(request('HarkoVillage'));
    expect(ok.headers.get('cache-control')).toBe('no-store');
    expect((await ok.json()).points).toHaveLength(1);
    expect(mocks.rate).toHaveBeenCalledWith('map-poi:member', { limit: 30, windowMs: 60000 });
    mocks.read.mockResolvedValueOnce(null);
    expect((await GET(request('HarkoVillage'))).status).toBe(503);
  });
});
