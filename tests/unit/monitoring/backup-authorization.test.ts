import { afterEach, expect, it, vi } from 'vitest';
import type { DashboardSession } from '../../../src/features/auth/server/session-store';

const mocks = vi.hoisted(() => ({ env: vi.fn() }));
vi.mock('../../../src/config/env', () => ({ getServerEnv: mocks.env }));
import { canViewBackupEvidence } from '../../../src/features/monitoring/server/backup-authorization';

afterEach(() => vi.unstubAllGlobals());

it('requires a current role from the separate backup-viewer list', async () => {
  const guild = '123456789012345678';
  const moderator = '234567890123456789';
  const backup = '345678901234567890';
  const session: DashboardSession = {
    user: { id: '456789012345678901' },
    guildId: guild,
    roleIds: [backup],
    expiresAt: Date.now() + 60000,
  };
  mocks.env.mockReturnValue({
    DISCORD_GUILD_ID: guild,
    MODERATOR_DISCORD_ROLE_IDS: moderator,
    BACKUP_VIEWER_DISCORD_ROLE_IDS: backup,
    DISCORD_BOT_TOKEN: 'fixture-token',
  });
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockResolvedValueOnce(Response.json({ roles: [moderator] }))
      .mockResolvedValueOnce(Response.json({ roles: [backup] }))
      .mockRejectedValueOnce(new Error('offline')),
  );
  expect(await canViewBackupEvidence(session)).toBe(false);
  expect(await canViewBackupEvidence(session)).toBe(true);
  expect(await canViewBackupEvidence(session)).toBe(false);
});
