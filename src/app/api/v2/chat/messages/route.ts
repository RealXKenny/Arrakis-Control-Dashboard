import { z } from 'zod';
import { AppError } from '../../../../../lib/errors';
import { readBoundedBody } from '../../../../../lib/http/bounded-body';
import { requireApiSession, assertSameOrigin, json, route } from '../../../../../server/http';
import { sendChatMessage } from '../../../../../features/chat/server/send';

const bodySchema = z.object({ serverId: z.string().max(64), content: z.unknown(), clientKey: z.unknown().optional() });

export const POST = route(async (request: Request) => {
  const session = await requireApiSession();
  assertSameOrigin(request);
  const bytes = await readBoundedBody(request, 8 * 1024);
  if (!bytes) throw new AppError('Chat request is too large.', 413, 'CHAT_BODY_TOO_LARGE', true);
  let input: z.infer<typeof bodySchema>;
  try {
    input = bodySchema.parse(JSON.parse(new TextDecoder().decode(bytes)));
  } catch {
    throw new AppError('Invalid chat request.', 400, 'INVALID_CHAT_REQUEST', true);
  }
  const result = await sendChatMessage(session, input.serverId, input.content, input.clientKey);
  return json({ ok: result.status < 400, message: result.message, error: result.error }, result.status);
});
