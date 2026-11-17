import { afterEach, beforeEach, expect, it, vi } from 'vitest';

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
  vi.useFakeTimers();
  vi.setSystemTime('2026-11-16T00:00:00Z');
  mocks.request.mockReset();
});
afterEach(() => {
  vi.useRealTimers();
});

function valid(path: string) {
  if (path === '/api/server/status?raw=0') return { schemaVersion: 1, data: { summary: { serverIp: 'private' } } };
  if (path === '/api/server/readiness') return { status: 'ready', checks: [], stdout: 'private' };
  if (path === '/api/server/services') return { operation: 'services', exitCode: 0, stdout: 'private' };
  if (path === '/api/server/performance') return { cpu: { private: true } };
  if (path === '/api/server/restart-queue') return { state: { entries: [] }, private: true };
  if (path === '/api/server/restart-history') return { rows: [], private: true };
  if (path === '/api/server/restart-schedule')
    return { operation: 'restartScheduleStatus', exitCode: 0, stdout: 'private' };
  if (path === '/api/server/ip-change-restart')
    return { operation: 'ipChangeRestartStatus', exitCode: 0, stdout: 'private' };
  if (path === '/api/backups/system/auto')
    return { status: { ok: true, enabled: false, intervalHours: '', lastRunAt: '', lastResult: '', nextRun: '' } };
  if (path === '/api/backups/auto') return { status: { ok: true, enabled: false, private: true } };
  if (path === '/api/backups' || path === '/api/backups/system') return { rows: [], private: true };
  return { totalCount: 0, rows: [{ private: 'secret' }] };
}

it('coalesces all read-only checks and classifies permissions without exposing provider payloads', async () => {
  mocks.request.mockImplementation(async (_method: string, path: string) => {
    if (path === '/api/server/restart-queue') throw new mocks.ErrorType(403);
    return valid(path);
  });
  const { readCapabilities } = await import('../../../src/features/monitoring/server/capabilities');
  const [first, second] = await Promise.all([readCapabilities(), readCapabilities()]);
  expect(first).toEqual(second);
  expect(first).toHaveLength(13);
  expect(first.find((item) => item.id === 'restart-queue')?.state).toBe('permission');
  expect(first.filter((item) => item.state === 'available')).toHaveLength(12);
  expect(first.every((item) => !item.stale)).toBe(true);
  expect(JSON.stringify(first)).not.toMatch(/private|secret/);
  expect(mocks.request).toHaveBeenCalledTimes(13);
  for (const args of mocks.request.mock.calls) expect(args[2]).toEqual({ timeoutMs: 5000, retryRead: false });
});

it('does not label malformed responses or outages as unsupported', async () => {
  mocks.request.mockImplementation(async (_method: string, path: string) => {
    if (path === '/api/server/restart-queue') throw new mocks.ErrorType(501);
    if (path === '/api/server/status?raw=0') throw new mocks.ErrorType(503);
    return { totalCount: null };
  });
  const { readCapabilities } = await import('../../../src/features/monitoring/server/capabilities');
  const result = await readCapabilities();
  expect(result.find((item) => item.id === 'server-status')?.state).toBe('unavailable');
  expect(result.find((item) => item.id === 'restart-queue')?.state).toBe('unsupported');
  expect(result.find((item) => item.id === 'population')?.state).toBe('unavailable');
});

it('marks an old last success stale after a later provider failure', async () => {
  mocks.request.mockImplementation(async (_method: string, path: string) => valid(path));
  const { readCapabilities } = await import('../../../src/features/monitoring/server/capabilities');
  await readCapabilities();
  vi.setSystemTime('2026-11-16T00:16:01Z');
  mocks.request.mockRejectedValue(new Error('offline'));
  const result = await readCapabilities();
  expect(result.every((item) => item.stale)).toBe(true);
  expect(JSON.stringify(result)).not.toContain('offline');
});
