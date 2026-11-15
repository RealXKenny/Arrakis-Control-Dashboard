import { beforeEach, expect, it, vi } from 'vitest';
import { AppError } from '../../src/lib/errors';
import { personalPortalLayout } from '../../src/features/portal/layout';
const state = vi.hoisted(() => ({ session: vi.fn(), read: vi.fn(), save: vi.fn(), limit: vi.fn() }));
vi.mock('../../src/features/auth/server/session', () => ({ currentSession: state.session }));
vi.mock('../../src/features/portal/server/layout-store', () => ({
  readPortalLayout: state.read,
  savePortalLayout: state.save,
}));
vi.mock('../../src/lib/security/rate-limit', () => ({ checkRateLimit: state.limit }));
vi.mock('../../src/lib/security/audit', () => ({ recordAudit: vi.fn() }));
import { GET, POST } from '../../src/app/api/v2/portal/layout/route';
const revision = '07acb5b6-58f3-4c18-b4b7-dbe8ed748b21';
const record = { revision, layout: personalPortalLayout() };
const request = (body: unknown, origin = 'http://localhost', type = 'application/json') =>
  new Request('http://localhost/api/v2/portal/layout', {
    method: 'POST',
    headers: { origin, 'Content-Type': type },
    body: JSON.stringify(body),
  });
beforeEach(() => {
  vi.clearAllMocks();
  state.session.mockResolvedValue({ user: { id: 'verified-account' } });
  state.read.mockResolvedValue(record);
  state.save.mockResolvedValue(record);
  state.limit.mockResolvedValue({ allowed: true });
});
it('refuses anonymous reads and writes without touching preferences', async () => {
  state.session.mockResolvedValue(null);
  expect((await GET(new Request('http://localhost/api/v2/portal/layout'))).status).toBe(401);
  expect((await POST(request(record))).status).toBe(401);
  expect(state.read).not.toHaveBeenCalled();
  expect(state.save).not.toHaveBeenCalled();
});
it('derives account ownership from the session only and keeps responses private/no-store', async () => {
  const response = await GET(new Request('http://localhost/api/v2/portal/layout?owner=foreign'));
  expect(state.read).toHaveBeenCalledWith('verified-account');
  expect(response.headers.get('cache-control')).toBe('no-store');
  expect(await response.json()).toEqual({ record });
  expect((await POST(request({ revision: null, layout: personalPortalLayout() }))).status).toBe(200);
  expect(state.save).toHaveBeenCalledWith('verified-account', null, personalPortalLayout());
});
it('rejects cross-origin mutations, caller identity fields, unsupported widgets and oversized bodies', async () => {
  expect((await POST(request(record, 'https://foreign.test'))).status).toBe(403);
  for (const value of [
    { ...record, owner: 'foreign' },
    { ...record, layout: { ...record.layout, owner: 'foreign' } },
    { ...record, layout: { ...record.layout, widgets: ['foreign'] } },
  ])
    expect((await POST(request(value))).status).toBe(400);
  expect((await POST(request({ junk: 'x'.repeat(4097) }))).status).toBe(413);
  expect((await POST(request(record, 'http://localhost', 'text/plain'))).status).toBe(415);
  expect(state.save).not.toHaveBeenCalled();
});
it('fails closed when request protection or Redis is unavailable and exposes conflicts without overwriting', async () => {
  state.limit.mockResolvedValueOnce({ allowed: true, storageUnavailable: true });
  expect((await POST(request(record))).status).toBe(503);
  expect(state.save).not.toHaveBeenCalled();
  state.limit.mockResolvedValueOnce({ allowed: false });
  expect((await POST(request(record))).status).toBe(429);
  state.save.mockRejectedValueOnce(new AppError('Reload saved layout.', 409, 'PORTAL_LAYOUT_CONFLICT', true));
  expect((await POST(request(record))).status).toBe(409);
  state.read.mockRejectedValueOnce(new AppError('Settings unavailable.', 503, 'PORTAL_LAYOUT_UNAVAILABLE', true));
  expect((await GET(new Request('http://localhost/api/v2/portal/layout'))).status).toBe(503);
});
