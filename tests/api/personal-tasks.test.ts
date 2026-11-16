import { randomUUID } from 'node:crypto';
import { beforeEach, expect, it, vi } from 'vitest';
import { emptyTasks } from '../../src/features/tasks/model';
import { AppError } from '../../src/lib/errors';
const state = vi.hoisted(() => ({ session: vi.fn(), read: vi.fn(), mutate: vi.fn(), limit: vi.fn() }));
vi.mock('../../src/features/auth/server/session', () => ({ currentSession: state.session }));
vi.mock('../../src/features/tasks/server/store', () => ({
  readPersonalTasks: state.read,
  mutatePersonalTasks: state.mutate,
}));
vi.mock('../../src/lib/security/rate-limit', () => ({ checkRateLimit: state.limit }));
vi.mock('../../src/lib/security/audit', () => ({ recordAudit: vi.fn() }));
import { GET, POST } from '../../src/app/api/v2/tasks/route';
const input = () => ({
  action: 'save',
  revision: null,
  task: {
    id: randomUUID(),
    kind: 'task',
    title: 'Water',
    notes: '',
    priority: 'high',
    dueDate: null,
    target: { type: 'none' },
  },
});
const request = (body: unknown, origin = 'http://localhost', type = 'application/json') =>
  new Request('http://localhost/api/v2/tasks?owner=foreign', {
    method: 'POST',
    headers: { origin, 'Content-Type': type },
    body: JSON.stringify(body),
  });
beforeEach(() => {
  vi.clearAllMocks();
  state.session.mockResolvedValue({ user: { id: 'session-owner' } });
  state.read.mockResolvedValue(emptyTasks());
  state.mutate.mockResolvedValue(emptyTasks());
  state.limit.mockResolvedValue({ allowed: true });
});
it('requires a verified session and derives private task ownership only from it', async () => {
  state.session.mockResolvedValueOnce(null);
  expect((await GET(new Request('http://localhost'))).status).toBe(401);
  expect(state.read).not.toHaveBeenCalled();
  const data = input();
  expect((await POST(request(data))).status).toBe(200);
  expect(state.mutate).toHaveBeenCalledWith('session-owner', data);
  const response = await GET(new Request('http://localhost/api/v2/tasks?owner=foreign'));
  expect(state.read).toHaveBeenCalledWith('session-owner');
  expect(response.headers.get('cache-control')).toBe('no-store');
});
it('rejects cross-origin writes, forged ownership/timestamps, invalid targets and oversized bodies', async () => {
  expect((await POST(request(input(), 'https://foreign.test'))).status).toBe(403);
  expect((await POST(request(input(), 'http://localhost', 'text/plain'))).status).toBe(415);
  const data = input();
  for (const value of [
    { ...data, owner: 'foreign' },
    { ...data, task: { ...data.task, completedAt: '2099' } },
    { ...data, task: { ...data.task, target: { type: 'url', ref: 'https://foreign' } } },
  ])
    expect((await POST(request(value))).status).toBe(400);
  expect((await POST(request({ data: 'x'.repeat(16385) }))).status).toBe(413);
  expect(state.mutate).not.toHaveBeenCalled();
});
it('fails closed on request-protection/storage outages and exposes stale revisions without retries', async () => {
  state.limit.mockResolvedValueOnce({ allowed: true, storageUnavailable: true });
  expect((await POST(request(input()))).status).toBe(503);
  state.limit.mockResolvedValueOnce({ allowed: false });
  expect((await POST(request(input()))).status).toBe(429);
  state.mutate.mockRejectedValueOnce(new AppError('Reload the list.', 409, 'TASKS_CONFLICT', true));
  expect((await POST(request(input()))).status).toBe(409);
  state.read.mockRejectedValueOnce(new AppError('Unavailable.', 503, 'TASKS_UNAVAILABLE', true));
  expect((await GET(new Request('http://localhost'))).status).toBe(503);
});
