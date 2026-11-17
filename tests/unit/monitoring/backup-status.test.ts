import { expect, it } from 'vitest';
import { projectBackupStatus } from '../../../src/features/monitoring/backup-status';

it('projects only bounded schedule evidence and refuses ambiguous timestamps', () => {
  const raw = {
    ok: true,
    enabled: true,
    intervalHours: '24',
    lastRunAt: '2026-11-16T10:00:00Z',
    lastResult: 'success',
    nextRun: 'tomorrow',
    lastArchive: 'sensitive-path',
    lastMessage: 'private',
  };
  expect(projectBackupStatus({ status: raw })).toEqual({
    enabled: true,
    intervalHours: 24,
    lastRunAt: '2026-11-16T10:00:00.000Z',
    lastResult: 'success',
    nextRun: null,
  });
  expect(projectBackupStatus({ status: { ...raw, ok: false } })).toBeNull();
  expect(projectBackupStatus({ status: { ...raw, lastResult: 'invented' } })).toBeNull();
});
