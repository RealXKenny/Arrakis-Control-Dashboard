import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  request: vi.fn(),
  ErrorType: class extends Error {
    constructor(readonly status: number) {
      super('fixture');
    }
  },
}));
vi.mock('../../../src/server/integrations/dune', () => ({
  DuneConsoleApiError: mocks.ErrorType,
  getDuneClient: () => ({ request: mocks.request }),
}));

beforeEach(() => {
  vi.resetModules();
  mocks.request.mockReset();
});

it('coalesces read-only checks and classifies permissions without exposing provider payloads', async () => {
  mocks.request.mockImplementation(async (_method: string, path: string) => {
    if (path.includes('status')) return { schemaVersion: 1, data: { summary: { serverIp: 'private' } } };
    if (path.includes('restart-queue')) throw new mocks.ErrorType(403);
    return { totalCount: 0, rows: [{ private: 'secret' }] };
  });
  const { readCapabilities } = await import('../../../src/features/monitoring/server/capabilities');
  const [first, second] = await Promise.all([readCapabilities(), readCapabilities()]);
  expect(first).toEqual(second);
  expect(first.map((item) => item.state)).toEqual(['available', 'permission', 'available']);
  expect(first[0].lastSuccessAt).toBe(first[0].checkedAt);
  expect(first[1].lastSuccessAt).toBeNull();
  expect(JSON.stringify(first)).not.toMatch(/private|secret/);
  expect(mocks.request).toHaveBeenCalledTimes(3);
  for (const args of mocks.request.mock.calls) expect(args[2]).toEqual({ timeoutMs: 5000, retryRead: false });
});

it('does not label malformed responses or outages as unsupported', async () => {
  mocks.request.mockImplementation(async (_method: string, path: string) => {
    if (path.includes('restart-queue')) throw new mocks.ErrorType(501);
    if (path.includes('status')) throw new mocks.ErrorType(503);
    return { totalCount: null };
  });
  const { readCapabilities } = await import('../../../src/features/monitoring/server/capabilities');
  const result = await readCapabilities();
  expect(result.map((item) => item.state)).toEqual(['unavailable', 'unsupported', 'unavailable']);
});
