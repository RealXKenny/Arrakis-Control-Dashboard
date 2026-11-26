import { beforeEach, expect, it, vi } from 'vitest';
import { defaultActivity, emptyActivities } from '../../src/features/activity-views/model';
const state = vi.hoisted(() => ({
  session: vi.fn(),
  read: vi.fn(),
  mutate: vi.fn(),
  tasks: vi.fn(),
  limit: vi.fn(),
  audit: vi.fn(),
}));
vi.mock('../../src/features/auth/server/session', () => ({ currentSession: state.session }));
vi.mock('../../src/features/activity-views/server/store', () => ({
  readActivityViews: state.read,
  mutateActivityViews: state.mutate,
}));
vi.mock('../../src/features/tasks/server/store', () => ({ readPersonalTasks: state.tasks }));
vi.mock('../../src/lib/security/rate-limit', () => ({ checkRateLimit: state.limit }));
vi.mock('../../src/lib/security/audit', () => ({ recordAudit: state.audit }));
import { GET, POST } from '../../src/app/api/v2/activity-views/route';
const id = '9958525b-f110-4569-8657-654436287abe';
const input = () => ({ action: 'save', revision: null, view: { ...defaultActivity(), name: 'Building', id } });
const request = (body: unknown, origin = 'http://localhost', type = 'application/json') =>
  new Request('http://localhost/api/v2/activity-views?owner=foreign', {
    method: 'POST',
    headers: { Origin: origin, 'Content-Type': type },
    body: JSON.stringify(body),
  });
beforeEach(() => {
  vi.clearAllMocks();
  state.session.mockResolvedValue({ user: { id: 'verified-owner' } });
  state.limit.mockResolvedValue({ allowed: true });
  state.read.mockResolvedValue(emptyActivities());
  state.mutate.mockResolvedValue({ ...emptyActivities(), revision: id });
  state.tasks.mockResolvedValue({
    tasks: [
      { id, kind: 'project', title: 'Private project', notes: 'Never project this note' },
      { id, kind: 'task', title: 'Not an option' },
    ],
  });
});
it('uses verified session ownership and projects only minimal own planning options', async () => {
  const response = await GET(new Request('http://localhost/api/v2/activity-views?owner=foreign'));
  expect(response.headers.get('cache-control')).toBe('no-store');
  expect(await response.json()).toEqual({
    record: emptyActivities(),
    plans: [{ id, kind: 'project', title: 'Private project' }],
    planningAvailable: true,
  });
  expect(state.read).toHaveBeenCalledWith('verified-owner');
  expect((await POST(request(input()))).status).toBe(200);
  expect(state.mutate).toHaveBeenCalledWith('verified-owner', input());
  expect(state.audit).toHaveBeenCalledWith({
    event: 'activity_view.change',
    actor: 'verified-owner',
    outcome: 'success',
    data: { action: 'save' },
  });
});
it('rejects foreign origins, owner selectors, unsafe definitions, missing delete confirmation and unbounded bodies', async () => {
  expect((await POST(request(input(), 'https://foreign.test'))).status).toBe(403);
  expect((await POST(request(input(), 'http://localhost', 'text/plain'))).status).toBe(415);
  for (const body of [
    { ...input(), owner: 'foreign' },
    { ...input(), view: { ...input().view, href: '/admin' } },
    { action: 'delete', revision: id, id },
    { action: 'delete', revision: id, id, confirmed: false },
  ])
    expect((await POST(request(body))).status).toBe(400);
  expect((await POST(request({ data: 'x'.repeat(8193) }))).status).toBe(413);
  expect(state.mutate).not.toHaveBeenCalled();
});
it('fails closed on session/rate-limit failures but permits settings reads when planning options are unavailable', async () => {
  state.session.mockResolvedValueOnce(null);
  expect((await GET(new Request('http://localhost/api/v2/activity-views'))).status).toBe(401);
  state.limit.mockResolvedValueOnce({ allowed: false });
  expect((await POST(request(input()))).status).toBe(429);
  state.limit.mockResolvedValueOnce({ allowed: true, storageUnavailable: true });
  expect((await GET(new Request('http://localhost/api/v2/activity-views'))).status).toBe(503);
  state.tasks.mockRejectedValue(new Error('private failure'));
  expect(await (await GET(new Request('http://localhost/api/v2/activity-views'))).json()).toMatchObject({
    plans: [],
    planningAvailable: false,
  });
  expect(state.mutate).not.toHaveBeenCalled();
});
