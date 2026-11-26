import { beforeEach, expect, it, vi } from 'vitest';
import { emptyPrivacy } from '../../src/features/privacy/model';
import { AppError } from '../../src/lib/errors';
const state = vi.hoisted(() => ({
  session: vi.fn(),
  read: vi.fn(),
  mutate: vi.fn(),
  shared: vi.fn(),
  limit: vi.fn(),
  audit: vi.fn(),
}));
vi.mock('../../src/features/auth/server/session', () => ({ currentSession: state.session }));
vi.mock('../../src/features/privacy/server/store', () => ({
  readPrivacy: state.read,
  mutatePrivacy: state.mutate,
  readSharedPrivacy: state.shared,
}));
vi.mock('../../src/lib/security/rate-limit', () => ({ checkRateLimit: state.limit }));
vi.mock('../../src/lib/security/audit', () => ({ recordAudit: state.audit }));
import { GET, POST } from '../../src/app/api/v2/privacy/route';
import { GET as SHARED } from '../../src/app/api/v2/privacy/shared/[shareId]/route';
const req = (body: unknown, origin = 'http://localhost', type = 'application/json') =>
  new Request('http://localhost/api/v2/privacy?owner=foreign', {
    method: 'POST',
    headers: { origin, 'Content-Type': type },
    body: JSON.stringify(body),
  });
const input = {
  action: 'publish',
  revision: null,
  card: { category: 'profile', data: { displayName: 'Shared name', about: '' } },
  hours: 24,
  confirmed: true,
};
const context = { params: Promise.resolve({ shareId: 'a'.repeat(64) }) };
beforeEach(() => {
  vi.clearAllMocks();
  state.session.mockResolvedValue({ user: { id: 'session-owner' } });
  state.limit.mockResolvedValue({ allowed: true });
  state.read.mockResolvedValue(emptyPrivacy());
  state.mutate.mockResolvedValue(emptyPrivacy());
  state.shared.mockResolvedValue({ cards: [] });
});
it('requires verified sessions for private and member views, never treating a link as anonymous access', async () => {
  state.session.mockResolvedValue(null);
  expect((await GET(new Request('http://localhost'))).status).toBe(401);
  expect((await SHARED(new Request('http://localhost'), context)).status).toBe(401);
  expect((await POST(req(input))).status).toBe(401);
  expect(state.read).not.toHaveBeenCalled();
  expect(state.shared).not.toHaveBeenCalled();
  expect(state.mutate).not.toHaveBeenCalled();
});
it('derives owner identity only from the session and records action metadata without content or share URLs', async () => {
  const response = await GET(new Request('http://localhost/api/v2/privacy?owner=foreign'));
  expect(state.read).toHaveBeenCalledWith('session-owner');
  expect(response.headers.get('cache-control')).toBe('no-store');
  expect((await POST(req(input))).status).toBe(200);
  expect(state.mutate).toHaveBeenCalledWith('session-owner', input);
  expect(state.audit).toHaveBeenCalledWith({
    event: 'privacy.publish',
    outcome: 'success',
    actor: 'session-owner',
    data: { category: 'profile' },
  });
  expect(JSON.stringify(state.audit.mock.calls)).not.toContain('Shared name');
});
it('rejects cross-origin, oversized, false-consent and caller-owned publication fields', async () => {
  expect((await POST(req(input, 'https://foreign.test'))).status).toBe(403);
  expect((await POST(req(input, 'http://localhost', 'text/plain'))).status).toBe(415);
  for (const raw of [
    { ...input, owner: 'foreign' },
    { ...input, confirmed: false },
    { ...input, publishedAt: '2099' },
    { ...input, hours: 99999 },
  ])
    expect((await POST(req(raw))).status).toBe(400);
  expect((await POST(req({ data: 'x'.repeat(16385) }))).status).toBe(413);
  expect(state.mutate).not.toHaveBeenCalled();
});
it('fails closed on rate-limit/storage outages and preserves stale-revision/revoked-link errors', async () => {
  state.limit.mockResolvedValueOnce({ allowed: true, storageUnavailable: true });
  expect((await POST(req(input))).status).toBe(503);
  expect(state.mutate).not.toHaveBeenCalled();
  state.limit.mockResolvedValueOnce({ allowed: false });
  expect((await SHARED(new Request('http://localhost'), context)).status).toBe(429);
  state.mutate.mockRejectedValueOnce(new AppError('Reload privacy settings.', 409, 'PRIVACY_CONFLICT', true));
  expect((await POST(req(input))).status).toBe(409);
  state.shared.mockRejectedValueOnce(new AppError('No longer shared.', 404, 'SHARE_NOT_FOUND', true));
  const response = await SHARED(new Request('http://localhost'), context);
  expect(response.status).toBe(404);
  expect(response.headers.get('cache-control')).toBe('no-store');
});
