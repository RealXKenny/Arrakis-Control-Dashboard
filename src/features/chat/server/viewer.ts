import '../../../lib/assert-server';
import type { DashboardSession } from '../../auth/server/session-store';
import { getLinkedPlayer } from '../../player/server/linked-player';
import type { ChatViewer } from '../viewer';

export async function loadChatViewer(session: DashboardSession): Promise<ChatViewer> {
  let gameName = session.linkedPlayerName;
  try {
    const player = await getLinkedPlayer(
      {
        guildId: session.guildId,
        channelId: 'dashboard',
        userId: session.user.id,
        username: session.user.username,
        roleIds: session.roleIds,
        interactionId: `chat-viewer-${Date.now()}`,
        commandName: 'chat',
      },
      { timeout: 1_500 },
    );
    // An explicit unlink must not keep treating the old character's messages as yours.
    gameName = player.linked ? player.characterName : undefined;
  } catch {
    // Chat remains available during a Console outage; cached names are cosmetic, never authority.
  }
  return {
    userId: session.user.id,
    names: [
      ...new Set(
        [gameName, session.user.username, session.user.global_name, session.user.guild_nickname]
          .filter((name): name is string => typeof name === 'string' && Boolean(name.trim()))
          .map((name) => name.trim().slice(0, 200)),
      ),
    ],
  };
}
