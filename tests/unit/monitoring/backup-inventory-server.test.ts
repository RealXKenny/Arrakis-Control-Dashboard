import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ request: vi.fn(), secure: vi.fn() }));
vi.mock('../../../src/config/env', () => ({ getServerEnv: () => ({ DUNE_API_URL: 'https://console.test' }) }));
vi.mock('../../../src/server/integrations/dune', () => ({ getDuneClient: () => ({ request: mocks.request }) }));
vi.mock('../../../src/server/integrations/console-origin', () => ({ isSecureConsoleOrigin: mocks.secure }));

beforeEach(() => {
  vi.resetModules();
  mocks.request.mockReset();
  mocks.secure.mockReset();
});

it('keeps database and system inventory failures independent and coalesces reads', async () => {
  mocks.secure.mockReturnValue(true);
  mocks.request.mockImplementation(async (_method: string, path: string) => {
    if (path === '/api/backups') throw new Error('offline');
    return { rows: [{ createdAt: '2026-11-16T10:00:00Z', automatic: true, name: 'private' }] };
  });
  const { readBackupInventory } = await import('../../../src/features/monitoring/server/backup-inventory');
  const [first, second] = await Promise.all([readBackupInventory(), readBackupInventory()]);
  expect(first).toEqual(second);
  expect(first.database).toBeNull();
  expect(first.system).toHaveLength(1);
  expect(JSON.stringify(first)).not.toContain('private');
  expect(mocks.request).toHaveBeenCalledTimes(2);
});

it('refuses insecure Console transport before any backup read', async () => {
  mocks.secure.mockReturnValue(false);
  const { readBackupInventory } = await import('../../../src/features/monitoring/server/backup-inventory');
  expect(() => readBackupInventory()).toThrow();
  expect(mocks.request).not.toHaveBeenCalled();
});
