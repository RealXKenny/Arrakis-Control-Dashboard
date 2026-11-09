import { AppError } from '../../../../../lib/errors';
import { currentSession, currentSessionId } from '../../../../../features/auth/server/session';
import { createChatGateway } from '../../../../../features/chat/server/gateway';
import { route } from '../../../../../server/http';

export const dynamic = 'force-dynamic';

export const GET = route(async (request: Request) => {
  const [session, sessionId] = await Promise.all([currentSession(), currentSessionId()]);
  if (!session || !sessionId) throw new AppError('Sign in to view live chat.', 401, 'UNAUTHORIZED', true);
  return createChatGateway(request, sessionId);
});
