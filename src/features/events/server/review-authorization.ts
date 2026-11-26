import '../../../lib/assert-server';
import { getServerEnv } from '../../../config/env';
import { hasDiscordRole } from '../../auth/server/discord-roles';
import type { DashboardSession } from '../../auth/server/session-store';

/** Event review is independent of moderation, backup evidence and guild leadership. */
export async function canReviewEventSubmissions(session: DashboardSession): Promise<boolean> {
  try {
    return await hasDiscordRole(session, getServerEnv().EVENT_REVIEWER_DISCORD_ROLE_IDS);
  } catch {
    return false;
  }
}
