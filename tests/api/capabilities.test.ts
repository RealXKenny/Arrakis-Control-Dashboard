import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ session: vi.fn(), limit: vi.fn(), read: vi.fn() }));
vi.mock('../../src/features/auth/server/session', () => ({ currentSession: mocks.session }));
vi.mock('../../src/lib/security/rate-limit', () => ({ checkRateLimit: mocks.limit }));
vi.mock('../../src/features/monitoring/server/capabilities', () => ({ readCapabilities: mocks.read }));
import { GET } from '../../src/app/api/v2/monitoring/capabilities/route';

beforeEach(() => {
  mocks.session.mockReset();
  mocks.limit.mockReset();
  mocks.read.mockReset();
});

it('requires a session and fails closed when rate-limit storage is unavailable', async () => {
  mocks.session.mockResolvedValueOnce(null).mockResolvedValue({ user: { id: 'member' } });
  const request = () => new Request('http://localhost/api/v2/monitoring/capabilities');
  expect((await GET(request())).status).toBe(401);
  mocks.limit.mockResolvedValue({ allowed: false, storageUnavailable: true });
  const response = await GET(request());
  expect(response.status).toBe(503);
  expect(response.headers.get('cache-control')).toBe('no-store');
  expect(mocks.read).not.toHaveBeenCalled();
});
