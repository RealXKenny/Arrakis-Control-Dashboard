import '../../../lib/assert-server';
import { AppError } from '../../../lib/errors';
import { getDuneClient } from '../../../infrastructure/dune';
import { DuneConsoleApiError } from '../../../infrastructure/dunedocker/transport';
import { getLinkedPlayer } from '../../player/server/linked-player';
import type { GuildApplication } from '../applications';

export function linkedGuildPlayerIds(player: {
  linked: boolean;
  pawnId?: string | number | null;
  controllerId?: string | number | null;
}) {
  return player.linked
    ? [player.pawnId, player.controllerId]
        .filter((id) => id != null)
        .map(String)
        .filter((id) => /^[a-zA-Z0-9_-]{1,128}$/.test(id))
    : [];
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

export async function addAcceptedApplicant(
  session,
  guildId: string,
  application: GuildApplication,
  roster: unknown,
  assertCurrent: () => Promise<void>,
) {
  const player = await getLinkedPlayer({
    guildId: session.guildId,
    channelId: 'dashboard',
    userId: application.discordId,
    username: application.discordName,
    roleIds: [],
    interactionId: `guild-accept-${guildId}`,
    commandName: 'portal',
  }).catch(() => {
    throw new AppError(
      'The applicant’s linked character could not be verified. Try again shortly.',
      503,
      'PLAYER_VERIFICATION_UNAVAILABLE',
      true,
    );
  });
  const ids = linkedGuildPlayerIds(player);
  if (!ids.length)
    throw new AppError(
      'The applicant must link their character before they can join.',
      409,
      'LINKED_PLAYER_REQUIRED',
      true,
    );
  if (application.playerId && !ids.includes(application.playerId))
    throw new AppError(
      'The applicant’s linked character changed. Ask them to submit a new application.',
      409,
      'GUILD_APPLICANT_CHANGED',
      true,
    );
  const playerId = application.playerId ?? ids[0];
  const data = record(roster);
  const rows = Array.isArray(roster)
    ? roster
    : Array.isArray(data.rows)
      ? data.rows
      : Array.isArray(data.data)
        ? data.data
        : [];
  // Dev note: a lost response should not give the same survivor a second seat in the sietch.
  if (
    rows.some((value: unknown) => {
      const member = record(value);
      return [
        member.player_id,
        member.playerId,
        member.pawnId,
        member.pawn_id,
        member.controllerId,
        member.controller_id,
      ].some((id) => id != null && ids.includes(String(id)));
    })
  )
    return;
  await assertCurrent();
  try {
    await getDuneClient().request('POST', `/api/guilds/${encodeURIComponent(guildId)}/members`, {
      body: { playerId, roleId: 1 },
      retryRead: false,
    });
  } catch (error) {
    if (error instanceof DuneConsoleApiError && [400, 409].includes(error.status))
      throw new AppError(
        'The applicant could not join. Check that they are guildless, faction compatible, and the guild has room. The application was not accepted.',
        409,
        'GUILD_CHANGE_REFUSED',
        true,
      );
    if (error instanceof DuneConsoleApiError && error.status === 403)
      throw new AppError(
        'The Console API key does not permit adding guild members.',
        403,
        'GUILD_CONSOLE_FORBIDDEN',
        true,
      );
    throw new AppError(
      'Unable to confirm whether the applicant joined. Refresh the guild before accepting again; their application has not been marked accepted.',
      502,
      'GUILD_CHANGE_UNAVAILABLE',
      true,
    );
  }
}
