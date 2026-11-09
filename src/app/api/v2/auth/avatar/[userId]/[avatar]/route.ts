import { requireApiSession, route } from '../../../../../../../server/http';
import { serveDiscordAvatar } from '../../../../../../../features/auth/server/avatar';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export const GET = route(async (request: Request, context: { params: Promise<{ userId: string; avatar: string }> }) => {
  const session = await requireApiSession();
  const { userId, avatar } = await context.params;
  return serveDiscordAvatar(request, userId, avatar, session.user.id);
});
