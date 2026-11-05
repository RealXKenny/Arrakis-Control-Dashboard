import '../../../lib/assert-server';
import { AppError } from '../../../lib/errors';
import { getDuneClient } from '../../../infrastructure/dune';
import { getLinkedPlayer } from '../../player/server/linked-player';
import { getGuildSession } from './common';

export async function requireGuildLeader(req, res, guildId: string) {
  const session = await getGuildSession(req, res);
  if (!session) throw new AppError('Unauthorized', 401, 'UNAUTHORIZED', true);
  let playerId = session.linkedPlayerId;
  if (!playerId) {
    try {
      const player = await getLinkedPlayer({
        guildId: session.guildId,
        channelId: 'dashboard',
        userId: session.user.id,
        username: session.user.username,
        roleIds: session.roleIds,
        interactionId: `guild-logo-${guildId}`,
        commandName: 'portal',
      });
      playerId = player.linked ? String(player.pawnId ?? player.controllerId ?? '') : '';
    } catch {
      throw new AppError(
        'Your linked character could not be verified right now. Refresh the dashboard and try again.',
        503,
        'PLAYER_VERIFICATION_UNAVAILABLE',
        true,
      );
    }
  }
  if (!playerId) throw new AppError('Link your character first.', 403, 'GUILD_LEADER_REQUIRED', true);
  const response = await getDuneClient().request('GET', `/api/guilds/${encodeURIComponent(guildId)}/members`);
  const responseRecord = response && typeof response === 'object' ? (response as { rows?: unknown }) : null;
  const rows = Array.isArray(response) ? response : Array.isArray(responseRecord?.rows) ? responseRecord.rows : [];
  const member = rows.find((entry) => {
    const memberId =
      entry?.player_id ??
      entry?.playerId ??
      entry?.pawnId ??
      entry?.pawn_id ??
      entry?.controllerId ??
      entry?.controller_id;
    return String(memberId ?? '') === String(playerId);
  });
  if (!member || String(member.role_id ?? member.roleId) !== '100')
    throw new AppError('Only the guild leader can change guild settings.', 403, 'GUILD_LEADER_REQUIRED', true);
}
