import { beforeEach, expect, it, vi } from 'vitest';
import { AppError } from '../../src/lib/errors';
import { defaultNotifications } from '../../src/features/inbox/preferences';
const state = vi.hoisted(() => ({ session: vi.fn(), read: vi.fn(), mutate: vi.fn(), limit: vi.fn() }));
vi.mock('../../src/features/auth/server/session', () => ({ currentSession: state.session }));
vi.mock('../../src/features/inbox/server/preferences-store', () => ({
  readNotifications: state.read,
  mutateNotifications: state.mutate,
}));
vi.mock('../../src/lib/security/rate-limit', () => ({ checkRateLimit: state.limit }));
vi.mock('../../src/lib/security/audit', () => ({ recordAudit: vi.fn() }));
import { GET, POST } from '../../src/app/api/v2/inbox/preferences/route';
const request = (body: unknown, origin = 'http://localhost', type = 'application/json') =>
  new Request('http://localhost/api/v2/inbox/preferences?owner=foreign', {
    method: 'POST',
    headers: { origin, 'Content-Type': type },
    body: JSON.stringify(body),
  });
const input = () => ({ action: 'configure', revision: null, config: defaultNotifications().config });
beforeEach(() => {
  vi.clearAllMocks();
  state.session.mockResolvedValue({ user: { id: 'session-owner' } });
  state.limit.mockResolvedValue({ allowed: true });
  state.read.mockResolvedValue(defaultNotifications());
  state.mutate.mockResolvedValue(defaultNotifications());
});
it('requires authentication and derives ownership from the session', async () => {
  state.session.mockResolvedValueOnce(null);
  expect((await GET(new Request('http://localhost'))).status).toBe(401);
  expect(state.read).not.toHaveBeenCalled();
  expect((await POST(request(input()))).status).toBe(200);
  expect(state.mutate).toHaveBeenCalledWith('session-owner', input());
  const response = await GET(new Request('http://localhost?owner=foreign'));
  expect(state.read).toHaveBeenCalledWith('session-owner');
  expect(response.headers.get('cache-control')).toBe('no-store');
});
it('rejects cross-origin, forged timestamps/owners, invalid zones, unsupported durations and oversized requests', async () => {
  expect((await POST(request(input(), 'https://foreign.test'))).status).toBe(403);
  expect((await POST(request(input(), 'http://localhost', 'text/plain'))).status).toBe(415);
  for (const value of [
    { ...input(), owner: 'foreign' },
    { action: 'snooze', revision: null, id: 'a'.repeat(64), minutes: 60, snoozedUntil: '2099' },
    { ...input(), config: { ...input().config, quiet: { ...input().config.quiet, timeZone: 'Bogus' } } },
  ])
    expect((await POST(request(value))).status).toBe(400);
  expect((await POST(request({ data: 'x'.repeat(8193) }))).status).toBe(413);
  expect(state.mutate).not.toHaveBeenCalled();
});
it('fails closed on unavailable protection or storage and preserves revision conflicts', async () => {
  state.limit.mockResolvedValueOnce({ allowed: true, storageUnavailable: true });
  expect((await POST(request(input()))).status).toBe(503);
  state.limit.mockResolvedValueOnce({ allowed: false });
  expect((await POST(request(input()))).status).toBe(429);
  state.mutate.mockRejectedValueOnce(new AppError('Reload settings.', 409, 'NOTIFICATIONS_CONFLICT', true));
  expect((await POST(request(input()))).status).toBe(409);
  state.read.mockRejectedValueOnce(new AppError('Unavailable.', 503, 'NOTIFICATIONS_UNAVAILABLE', true));
  expect((await GET(new Request('http://localhost'))).status).toBe(503);
});
