import { beforeEach, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({
  session: vi.fn(),
  summary: vi.fn(),
  export: vi.fn(),
  erase: vi.fn(),
  limit: vi.fn(),
  audit: vi.fn(),
}));
vi.mock('../../src/features/auth/server/session', () => ({ currentSession: state.session }));
vi.mock('../../src/features/personal-data/server/service', () => ({
  summarizePersonalData: state.summary,
  exportPersonalData: state.export,
  erasePersonalData: state.erase,
}));
vi.mock('../../src/lib/security/rate-limit', () => ({ checkRateLimit: state.limit }));
vi.mock('../../src/lib/security/audit', () => ({ recordAudit: state.audit }));
import { GET } from '../../src/app/api/v2/personal-data/route';
import { POST as EXPORT } from '../../src/app/api/v2/personal-data/export/route';
import { POST as ERASE } from '../../src/app/api/v2/personal-data/delete/route';
const request = (body: unknown, origin = 'http://localhost', type = 'application/json') =>
  new Request('http://localhost/api/v2/personal-data/delete?owner=foreign', {
    method: 'POST',
    headers: { origin, 'Content-Type': type },
    body: JSON.stringify(body),
  });
beforeEach(() => {
  vi.clearAllMocks();
  state.session.mockResolvedValue({ user: { id: 'verified-owner' } });
  state.limit.mockResolvedValue({ allowed: true });
  state.summary.mockResolvedValue({ scopes: [] });
  state.export.mockResolvedValue({ records: [] });
  state.erase.mockResolvedValue({ scope: 'tasks', revision: null, entries: 0, snapshots: 0 });
});
it('derives all scope ownership from the verified session and sends bounded no-store JSON attachments', async () => {
  expect((await GET(new Request('http://localhost/api/v2/personal-data?owner=foreign'))).status).toBe(200);
  expect(state.summary).toHaveBeenCalledWith('verified-owner');
  const response = await EXPORT(request({ selection: [{ scope: 'tasks', revision: null }] }));
  expect(response.headers.get('cache-control')).toBe('no-store');
  expect(response.headers.get('content-disposition')).toContain('attachment');
  expect(state.export).toHaveBeenCalledWith('verified-owner', [{ scope: 'tasks', revision: null }]);
  expect((await ERASE(request({ scope: 'tasks', revision: null, confirmation: 'DELETE MY DATA' }))).status).toBe(200);
  expect(state.erase).toHaveBeenCalledWith('verified-owner', 'tasks', null);
  expect(state.audit).toHaveBeenLastCalledWith({
    event: 'personal_data.erase',
    outcome: 'success',
    actor: 'verified-owner',
    data: { scope: 'tasks' },
  });
});
it('rejects anonymous users, foreign origins, missing consent, owner selectors and unbounded bodies', async () => {
  state.session.mockResolvedValueOnce(null);
  expect((await GET(new Request('http://localhost/api/v2/personal-data'))).status).toBe(401);
  const valid = { scope: 'tasks', revision: null, confirmation: 'DELETE MY DATA' };
  expect((await ERASE(request(valid, 'https://foreign.test'))).status).toBe(403);
  expect((await ERASE(request(valid, 'http://localhost', 'text/plain'))).status).toBe(415);
  for (const body of [
    { ...valid, owner: 'foreign' },
    { ...valid, confirmation: '' },
    { scope: 'tasks' },
    { ...valid, scope: 'account' },
  ])
    expect((await ERASE(request(body))).status).toBe(400);
  expect((await ERASE(request({ data: 'x'.repeat(8193) }))).status).toBe(413);
  expect(
    (
      await EXPORT(
        request({
          selection: [
            { scope: 'tasks', revision: null },
            { scope: 'tasks', revision: null },
          ],
        }),
      )
    ).status,
  ).toBe(400);
  expect(state.erase).not.toHaveBeenCalled();
  expect(state.export).not.toHaveBeenCalled();
});
it('fails closed when request protection fails and never calls erasure after a rejected request', async () => {
  state.limit.mockResolvedValueOnce({ allowed: true, storageUnavailable: true });
  expect((await GET(new Request('http://localhost/api/v2/personal-data'))).status).toBe(503);
  state.limit.mockResolvedValueOnce({ allowed: false });
  expect((await ERASE(request({ scope: 'tasks', revision: null, confirmation: 'DELETE MY DATA' }))).status).toBe(429);
  expect(state.summary).not.toHaveBeenCalled();
  expect(state.erase).not.toHaveBeenCalled();
});
