import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock('../../../src/server/integrations/dune', () => ({ getDuneClient: () => ({ request: mocks.request }) }));

describe('restart queue reads', () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.request.mockReset();
  });
  it('coalesces concurrent reads and uses bounded read-only requests', async () => {
    mocks.request.mockResolvedValue({ state: { entries: [] } });
    const { readRestartQueue } = await import('../../../src/features/monitoring/server/restart-queue');
    const [one, two] = await Promise.all([readRestartQueue(), readRestartQueue()]);
    expect(one).toEqual(two);
    expect(mocks.request).toHaveBeenCalledOnce();
    expect(mocks.request).toHaveBeenCalledWith('GET', '/api/server/restart-queue', {
      timeoutMs: 5000,
      retryRead: false,
    });
  });
  it('does not cache a malformed or unavailable reading as an empty queue', async () => {
    mocks.request
      .mockResolvedValueOnce({ state: { entries: 'invalid' } })
      .mockResolvedValueOnce({ state: { entries: [] } });
    const { readRestartQueue } = await import('../../../src/features/monitoring/server/restart-queue');
    await expect(readRestartQueue()).rejects.toThrow();
    await expect(readRestartQueue()).resolves.toMatchObject({ entries: [] });
    expect(mocks.request).toHaveBeenCalledTimes(2);
  });
});
