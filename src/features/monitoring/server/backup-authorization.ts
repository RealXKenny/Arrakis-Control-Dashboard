import '../../../lib/assert-server';
import { getServerEnv } from '../../../config/env';
import { hasDiscordRole } from '../../auth/server/discord-roles';
import type { DashboardSession } from '../../auth/server/session-store';

/** Backup viewing is distinct from moderator and guild-leader authorization. */
export async function canViewBackupEvidence(session: DashboardSession): Promise<boolean> {
  try {
    return await hasDiscordRole(session, getServerEnv().BACKUP_VIEWER_DISCORD_ROLE_IDS);
  } catch {
    return false;
  }
}
