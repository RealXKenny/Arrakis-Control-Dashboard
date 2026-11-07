/** Browser-safe view model: what the navigation may show about the signed-in member. */
export type NavIdentity = { ign: string; avatarUrl: string | null };

type IdentitySource = {
  user: { id: string; username?: string; global_name?: string; avatar?: string | null };
  linkedPlayerName?: string;
};

export function discordAvatarUrl(userId: string, avatar: string | null | undefined): string | null {
  if (!avatar || !/^\d{1,25}$/.test(userId) || !/^(a_)?[a-f0-9]{32}$/.test(avatar)) return null;
  return `https://cdn.discordapp.com/avatars/${userId}/${avatar}.png?size=64`;
}

/** IGN is the linked in-game character name; until a character is linked we fall back to the Discord name. */
export function navIdentity(session: IdentitySource): NavIdentity {
  const ign = session.linkedPlayerName || session.user.global_name || session.user.username || 'Unknown';
  return { ign, avatarUrl: discordAvatarUrl(session.user.id, session.user.avatar) };
}
