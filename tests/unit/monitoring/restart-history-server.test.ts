import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock('../../../src/server/integrations/dune', () => ({ getDuneClient: () => ({ request: mocks.request }) }));

beforeEach(() => {
  vi.resetModules();
  mocks.request.mockReset();
});

it('coalesces bounded read-only history requests and rejects malformed data', async () => {
  mocks.request.mockResolvedValueOnce({ rows: 'invalid' }).mockResolvedValueOnce({ rows: [] });
  const { readRestartHistory } = await import('../../../src/features/monitoring/server/restart-history');
  await expect(readRestartHistory()).rejects.toThrow();
  const [a, b] = await Promise.all([readRestartHistory(), readRestartHistory()]);
  expect(a).toEqual([]);
  expect(b).toEqual([]);
  expect(mocks.request).toHaveBeenCalledTimes(2);
  expect(mocks.request).toHaveBeenCalledWith('GET', '/api/server/restart-history', {
    timeoutMs: 5000,
    retryRead: false,
  });
});
