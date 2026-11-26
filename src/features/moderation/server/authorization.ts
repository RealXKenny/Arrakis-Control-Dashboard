import '../../../lib/assert-server';
import { getServerEnv } from '../../../config/env';
import { hasDiscordRole } from '../../auth/server/discord-roles';
import type { DashboardSession } from '../../auth/server/session-store';

/** Moderator roles do not confer any access outside moderation. */
export async function isModerator(session: DashboardSession): Promise<boolean> {
  try {
    return await hasDiscordRole(session, getServerEnv().MODERATOR_DISCORD_ROLE_IDS);
  } catch {
    return false;
  }
}
