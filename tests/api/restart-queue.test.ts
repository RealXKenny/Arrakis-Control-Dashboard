import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ session: vi.fn(), read: vi.fn() }));
vi.mock('../../src/features/auth/server/session', () => ({ currentSession: mocks.session }));
vi.mock('../../src/features/monitoring/server/restart-queue', () => ({ readRestartQueue: mocks.read }));

import { GET } from '../../src/app/api/v2/monitoring/restart-queue/route';

beforeEach(() => {
  mocks.session.mockReset();
  mocks.read.mockReset();
});

it('requires a session before reading restart data', async () => {
  mocks.session.mockResolvedValue(null);
  const response = await GET(new Request('http://localhost/api/v2/monitoring/restart-queue'));
  expect(response.status).toBe(401);
  expect(mocks.read).not.toHaveBeenCalled();
  expect(response.headers.get('cache-control')).toBe('no-store');
});

it('returns a sanitized unavailable response on provider errors', async () => {
  mocks.session.mockResolvedValue({ user: { id: 'member' } });
  mocks.read.mockRejectedValue(new Error('private provider detail'));
  const response = await GET(new Request('http://localhost/api/v2/monitoring/restart-queue'));
  expect(response.status).toBe(503);
  expect(await response.text()).not.toContain('private provider detail');
});
