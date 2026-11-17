import '../../../lib/assert-server';
import { createHash, randomUUID } from 'node:crypto';
import { setTimeout as pause } from 'node:timers/promises';
import { AppError } from '../../../lib/errors';
import { createLogger } from '../../../lib/logger';
import { checkRateLimit } from '../../../lib/security/rate-limit';
import type { DashboardSession } from '../../auth/server/session-store';
import { discordAvatarUrl } from '../../auth/identity';
import { CHAT_CLIENT_KEY_PATTERN, validateChatContent, type ChatDelivery, type ChatMessage } from '../contracts';
import { getChatServer, getChatConfig } from './config';
import { appendChatMessage, findChatMessageByEvent, setChatDelivery } from './history';
import { encodeMapChat } from './protocol';
import { getChatPublisher } from './publisher';
import { ChatPublishError } from './rabbitmq';

const log = createLogger('CHAT');

export interface ChatSendResult {
  message: ChatMessage;
  status: number;
  error?: string;
}

function senderName(session: DashboardSession): string {
  const name = session.linkedPlayerName ?? session.user.global_name ?? session.user.username ?? 'Dashboard member';
  return (
    name
      .replace(/[\r\n\u0000-\u001f\u007f]/g, ' ')
      .trim()
      .slice(0, 80) || 'Dashboard member'
  );
}

/**
 * The game message ID is derived from the member and their browser's idempotency key, so a resend
 * of the same key maps to the same message, and one member cannot address another member's message.
 * It keeps the game's 32-character uppercase hexadecimal `m_Id` shape.
 */
export function chatMessageIdFor(userId: string, clientKey: string): string {
  return createHash('sha256').update(`${userId}:${clientKey.toLowerCase()}`).digest('hex').slice(0, 32).toUpperCase();
}

function resultFor(message: ChatMessage, delivery: ChatDelivery | undefined = message.delivery): ChatSendResult {
  const current = { ...message, delivery };
  switch (delivery) {
    case 'published':
    case 'accepted':
    case 'delivered':
      return { message: current, status: 201 };
    case 'failed':
      return {
        message: current,
        status: 503,
        error: 'Message could not be sent. You can send it again deliberately.',
      };
    case 'pending':
      return {
        message: current,
        status: 202,
        error: 'This message is still sending. Its status will update shortly.',
      };
    default:
      return {
        message: current,
        status: 202,
        error: 'Delivery could not be confirmed. Do not resend automatically; the game may have received it.',
      };
  }
}

function existingResult(existing: ChatMessage, content: string, serverId: string): ChatSendResult {
  if (existing.content !== content || existing.serverId !== serverId)
    throw new AppError(
      'This message ID was already used for different content.',
      409,
      'CHAT_IDEMPOTENCY_CONFLICT',
      true,
    );
  return resultFor(existing);
}

export async function sendChatMessage(
  session: DashboardSession,
  serverId: string,
  contentValue: unknown,
  clientKeyValue?: unknown,
): Promise<ChatSendResult> {
  const config = getChatConfig();
  const server = getChatServer(serverId, config);
  if (!config || !server)
    throw new AppError('This chat destination is unavailable.', 404, 'CHAT_SERVER_NOT_FOUND', true);
  let content: string;
  try {
    content = validateChatContent(contentValue, config.messageMaxChars);
  } catch (error) {
    throw new AppError(error instanceof Error ? error.message : 'Invalid message.', 400, 'INVALID_CHAT_MESSAGE', true);
  }
  if (
    clientKeyValue !== undefined &&
    (typeof clientKeyValue !== 'string' || !CHAT_CLIENT_KEY_PATTERN.test(clientKeyValue))
  )
    throw new AppError('Invalid chat message ID.', 400, 'INVALID_CHAT_CLIENT_KEY', true);
  const clientKey = typeof clientKeyValue === 'string' ? clientKeyValue.toLowerCase() : undefined;
  const id = clientKey ? chatMessageIdFor(session.user.id, clientKey) : randomUUID().replaceAll('-', '').toUpperCase();

  // A resend of the same key reports the recorded outcome instead of publishing a second copy.
  // Lookup failures fall through: the atomic append below is still the authoritative guard.
  if (clientKey) {
    const existing = await findChatMessageByEvent(server.id, id).catch(() => null);
    if (existing) return existingResult(existing, content, server.id);
  }

  const rule = { limit: config.sendRateLimit, windowMs: config.sendRateWindowMs };
  const serverRule = { limit: config.serverSendRateLimit, windowMs: config.sendRateWindowMs };
  const [userLimit, serverLimit] = await Promise.all([
    checkRateLimit(`chat:user:${session.user.id}`, rule),
    checkRateLimit(`chat:server:${server.id}`, serverRule),
  ]);
  const limited = !userLimit.allowed ? userLimit : !serverLimit.allowed ? serverLimit : null;
  if (limited)
    throw new AppError(
      `Chat rate limit reached. Try again in ${limited.retryAfter} seconds.`,
      429,
      'CHAT_RATE_LIMITED',
      true,
    );

  const name = senderName(session);
  const timestamp = new Date();
  const encoded = encodeMapChat(config.funcomId, `[Dashboard] ${name}: ${content}`, config.displayName, id, timestamp);
  const pending = {
    id,
    serverId: server.id,
    senderId: session.user.id,
    senderName: name,
    ...(discordAvatarUrl(session.user.id, session.user.avatar) ? { senderAvatar: session.user.avatar! } : {}),
    source: 'dashboard' as const,
    content,
    timestamp: timestamp.toISOString(),
    correlationId: clientKey ?? id,
    externalEventId: id,
    delivery: 'pending' as const,
  };
  let saved: Awaited<ReturnType<typeof appendChatMessage>>;
  try {
    saved = await appendChatMessage(pending);
  } catch (error) {
    // Nothing has been published yet, so this is a definite failure.
    log.error('Unable to record outgoing chat before publishing', error);
    throw new AppError(
      'Chat history is unavailable, so the message was not sent.',
      503,
      'CHAT_HISTORY_UNAVAILABLE',
      true,
    );
  }
  // A concurrent request with the same key won the atomic insert; it owns the single publish.
  if (!saved.inserted) return existingResult(saved.message, content, server.id);

  let outcome: ChatDelivery = 'published';
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      // The atomic insert owns this entire retry sequence, retaining one stable idempotency/game ID.
      await getChatPublisher().publish(server.map, encoded.id, encoded.body);
      outcome = 'published';
      break;
    } catch (error) {
      outcome = error instanceof ChatPublishError ? error.outcome : 'unknown';
      // A lost confirm may already have reached the game: never automatically repeat it.
      if (outcome !== 'failed' || attempt === 2) break;
      await pause((attempt + 1) * 1_000);
    }
  }
  try {
    const stored = await setChatDelivery(saved.message, outcome);
    if (!stored) log.warn('Outgoing chat expired before its delivery state could be recorded.');
    else if (stored.delivery) outcome = stored.delivery;
  } catch (error) {
    // The broker outcome above is still what this request observed; history will report the
    // stale `pending` entry as unknown once it ages past the recovery window.
    log.error('Unable to record outgoing chat delivery state', error);
  }
  return resultFor(saved.message, outcome);
}
