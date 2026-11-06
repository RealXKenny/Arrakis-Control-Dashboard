import '../../../lib/assert-server';
import { AppError } from '../../../lib/errors';
import { getDuneClient } from '../../../infrastructure/dune';
import { getLinkedPlayer } from '../../player/server/linked-player';
import { getGuildSession } from './common';

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

export async function isGuildLeader(session, guildId: string, response: unknown): Promise<boolean> {
  let player;
  try {
    player = await getLinkedPlayer({
      guildId: session.guildId,
      channelId: 'dashboard',
      userId: session.user.id,
      username: session.user.username,
      roleIds: session.roleIds,
      interactionId: 'guild-settings-' + guildId,
      commandName: 'portal',
    });
  } catch {
    throw new AppError(
      'Your linked character could not be verified right now. Refresh the dashboard and try again.',
      503,
      'PLAYER_VERIFICATION_UNAVAILABLE',
      true,
    );
  }
  if (!player.linked) return false;
  // Dev note: the pawn and controller share a player, but they did not share an ID badge.
  const ids = new Set([player.pawnId, player.controllerId].filter((id) => id != null && String(id) !== '').map(String));
  const data = record(response);
  const rows = Array.isArray(response)
    ? response
    : Array.isArray(data.rows)
      ? data.rows
      : Array.isArray(data.data)
        ? data.data
        : [];
  return rows.some((value: unknown) => {
    const member = record(value);
    const memberIds = [
      member.player_id,
      member.playerId,
      member.pawnId,
      member.pawn_id,
      member.controllerId,
      member.controller_id,
    ];
    return (
      String(member.role_id ?? member.roleId) === '100' && memberIds.some((id) => id != null && ids.has(String(id)))
    );
  });
}

export async function requireGuildLeader(req, res, guildId: string) {
  const session = await getGuildSession(req, res);
  if (!session) throw new AppError('Unauthorized', 401, 'UNAUTHORIZED', true);
  const response = await getDuneClient().request('GET', '/api/guilds/' + encodeURIComponent(guildId) + '/members');
  if (!(await isGuildLeader(session, guildId, response)))
    throw new AppError('Only the guild leader can change guild settings.', 403, 'GUILD_LEADER_REQUIRED', true);
  return response;
}
