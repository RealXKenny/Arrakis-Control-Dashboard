import { expect, it } from 'vitest';
import { projectDatabaseBackups, projectSystemBackups } from '../../../src/features/monitoring/backup-evidence';

it('projects bounded archive presence without names, paths or privileged metadata', () => {
  const database = projectDatabaseBackups({
    rows: [
      {
        name: 'private.backup',
        created: '2026-11-16 10:00:00',
        type: 'Automatic Backup',
        source: 'private-host',
        currentBattlegroupId: 'private',
      },
    ],
  });
  expect(database).toEqual([
    { createdAt: null, reportedCreated: '2026-11-16 10:00:00', automatic: true, kind: 'database' },
  ]);
  expect(JSON.stringify(database)).not.toMatch(/private/);
  const system = projectSystemBackups({
    rows: [{ name: 'private.tar.gz.enc', createdAt: '2026-11-16T10:00:00Z', automatic: false, passphrase: 'secret' }],
  });
  expect(system).toEqual([
    { createdAt: '2026-11-16T10:00:00.000Z', reportedCreated: null, automatic: false, kind: 'system' },
  ]);
  expect(JSON.stringify(system)).not.toMatch(/private|secret/);
  expect(projectSystemBackups({ rows: [{ createdAt: 'not-a-date' }] })).toBeNull();
});
