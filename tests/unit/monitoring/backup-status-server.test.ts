import { beforeEach, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { DashboardSession } from '../../../src/features/auth/server/session-store';

const mocks = vi.hoisted(() => ({
  env: vi.fn(),
  secure: vi.fn(),
  request: vi.fn(),
  authorized: vi.fn(),
  read: vi.fn(),
}));
vi.mock('../../../src/config/env', () => ({ getServerEnv: mocks.env }));
vi.mock('../../../src/server/integrations/dune', () => ({
  getDuneClient: () => ({ request: mocks.request }),
}));
vi.mock('../../../src/server/integrations/console-origin', () => ({ isSecureConsoleOrigin: mocks.secure }));
vi.mock('../../../src/features/monitoring/server/backup-authorization', () => ({
  canViewBackupEvidence: mocks.authorized,
}));

beforeEach(() => {
  vi.resetModules();
  mocks.env.mockReset();
  mocks.secure.mockReset();
  mocks.request.mockReset();
  mocks.authorized.mockReset();
});

it('does not read backup evidence when the viewer is unauthorized', async () => {
  mocks.authorized.mockResolvedValue(false);
  const { BackupConfidence } = await import('../../../src/features/monitoring/components/backup-confidence');
  expect(await BackupConfidence({ session: {} as DashboardSession })).toBeNull();
  expect(mocks.request).not.toHaveBeenCalled();
});

it('requires secure transport and coalesces bounded read-only calls', async () => {
  mocks.env.mockReturnValue({ DUNE_API_URL: 'http://example.test' });
  mocks.secure.mockReturnValue(false);
  const { readBackupStatus } = await import('../../../src/features/monitoring/server/backup-status');
  expect(() => readBackupStatus()).toThrow();
  expect(mocks.request).not.toHaveBeenCalled();
  mocks.secure.mockReturnValue(true);
  mocks.request.mockResolvedValue({
    status: {
      ok: true,
      enabled: true,
      intervalHours: '24',
      lastRunAt: '',
      lastResult: '',
      nextRun: '',
    },
  });
  const [a, b] = await Promise.all([readBackupStatus(), readBackupStatus()]);
  expect(a).toEqual(b);
  expect(mocks.request).toHaveBeenCalledOnce();
  expect(mocks.request).toHaveBeenCalledWith('GET', '/api/backups/system/auto', { timeoutMs: 5000, retryRead: false });
});

it('shows authorized viewers sanitized evidence without claiming recoverability', async () => {
  mocks.authorized.mockResolvedValue(true);
  mocks.env.mockReturnValue({ DUNE_API_URL: 'https://console.test' });
  mocks.secure.mockReturnValue(true);
  mocks.request.mockResolvedValue({
    status: {
      ok: true,
      enabled: true,
      intervalHours: '24',
      lastRunAt: '2026-11-16T00:00:00Z',
      lastResult: 'success',
      nextRun: '',
      lastArchive: 'private-name',
    },
  });
  const { BackupConfidence } = await import('../../../src/features/monitoring/components/backup-confidence');
  const element = await BackupConfidence({ session: {} as DashboardSession });
  expect(element).not.toBeNull();
  const html = renderToStaticMarkup(element!);
  expect(html).toContain('success');
  expect(html).toContain('does not prove a successful run or recoverability');
  expect(html).not.toContain('private-name');
});
