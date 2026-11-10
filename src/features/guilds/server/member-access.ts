import '../../../lib/assert-server';
import type { DashboardSession } from '../../auth/server/session-store';
import { getLinkedPlayer } from '../../player/server/linked-player';
import { getDuneClient } from '../../../server/integrations/dune';
import { AppError } from '../../../lib/errors';
import { memberRows } from '../members';
import { guildMemberId, guildMemberName, guildMemberRole } from '../member-identity';

/** Private guild data requires fresh identity and roster IDs, never a cached guild or display-name match. */
export async function requireGuildMember(session: DashboardSession, guildId: string) {
  try {
    const player = await getLinkedPlayer({
      guildId: session.guildId,
      channelId: 'dashboard',
      userId: session.user.id,
      username: session.user.username,
      roleIds: session.roleIds,
      interactionId: `guild-membership-${guildId}`,
      commandName: 'portal',
    });
    if (player.linked) {
      const ids = new Set(
        [player.pawnId, player.controllerId]
          .filter((id) => id != null && /^[a-zA-Z0-9_-]{1,128}$/.test(String(id)))
          .map(String),
      );
      const roster = await getDuneClient().request('GET', `/api/guilds/${encodeURIComponent(guildId)}/members`, {
        retryRead: false,
      });
      const self = memberRows(roster).find((row) =>
        [row.player_id, row.playerId, row.pawnId, row.pawn_id, row.controllerId, row.controller_id].some(
          (id) =>
            (typeof id === 'string' || (typeof id === 'number' && Number.isSafeInteger(id))) && ids.has(String(id)),
        ),
      );
      if (self && guildMemberRole(self) !== null)
        return {
          canEdit: guildMemberRole(self) === 100,
          authorName: guildMemberName(self),
          memberId: guildMemberId(self),
        };
    }
  } catch {
    throw new AppError(
      'Your guild membership could not be verified. Try again shortly.',
      503,
      'GUILD_VERIFICATION_UNAVAILABLE',
      true,
    );
  }
  throw new AppError('Only current members can access this guild workspace.', 403, 'GUILD_MEMBER_REQUIRED', true);
}
