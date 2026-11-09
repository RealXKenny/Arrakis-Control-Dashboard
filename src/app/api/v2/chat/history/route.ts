import { AppError } from '../../../../../lib/errors';
import { requireApiSession, json, route } from '../../../../../server/http';
import { getChatConfig, getChatServer } from '../../../../../features/chat/server/config';
import { readChatHistory } from '../../../../../features/chat/server/history';

export const dynamic = 'force-dynamic';

export const GET = route(async (request: Request) => {
  await requireApiSession();
  const url = new URL(request.url);
  const serverId = url.searchParams.get('server') ?? '';
  const config = getChatConfig();
  if (!config || !getChatServer(serverId, config))
    throw new AppError('This chat destination is unavailable.', 404, 'CHAT_SERVER_NOT_FOUND', true);
  const before = url.searchParams.get('before') ?? undefined;
  try {
    const history = await readChatHistory(serverId, { before });
    return json({ ok: true, ...history }, 200, { 'Cache-Control': 'private, no-store' });
  } catch (error) {
    if (error instanceof Error && error.message === 'Invalid chat history cursor.')
      throw new AppError(error.message, 400, 'INVALID_CHAT_CURSOR', true);
    throw error;
  }
});
