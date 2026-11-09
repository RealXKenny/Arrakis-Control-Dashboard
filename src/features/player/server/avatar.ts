import '../../../lib/assert-server';
import { discordAvatarUrl } from '../../auth/identity';
export function discordAvatar(user: { id: string; avatar?: string | null }): string | null {
  return discordAvatarUrl(user.id, user.avatar);
}
