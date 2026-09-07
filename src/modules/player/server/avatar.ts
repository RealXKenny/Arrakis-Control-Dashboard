import '../../../lib/assert-server';
export function discordAvatar(user: { id: string; avatar?: string | null }): string | null {
  if (!/^\d{1,25}$/.test(user.id) || !/^(a_)?[a-f0-9]{32}$/.test(user.avatar ?? '')) return null;
  return `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=128`;
}
