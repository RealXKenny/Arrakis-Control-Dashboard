import { canTransitionDelivery, parseChatMessage, type ChatDelivery, type ChatMessage } from './contracts';

/** Browser-side placeholder IDs; a server message with the same correlation ID replaces one. */
export const OPTIMISTIC_ID_PREFIX = 'optimistic-';
/** Three bounded publish attempts, retry delays, and Redis work fit before the browser times out. */
export const CHAT_SEND_TIMEOUT_MS = 40_000;
/** Keep a long-lived browser tab bounded independently of broker traffic and server retention. */
export const CHAT_TIMELINE_MAX_MESSAGES = 10_000;

export function optimisticChatId(clientKey: string): string {
  return `${OPTIMISTIC_ID_PREFIX}${clientKey}`;
}

export function isOptimisticChatMessage(message: ChatMessage): boolean {
  return message.id.startsWith(OPTIMISTIC_ID_PREFIX);
}

/**
 * Merge server messages into the timeline. Messages are keyed by server ID; a dashboard message
 * replaces the matching optimistic placeholder only when both the correlation ID and the sender
 * match, and a stale or reordered event can never move a message's delivery state backwards.
 */
export function mergeChatMessages(current: ChatMessage[], incoming: ChatMessage[], serverId?: string): ChatMessage[] {
  const messages = new Map(current.map((message) => [message.id, message]));
  for (const message of incoming) {
    if (serverId && message.serverId !== serverId) continue;
    if (message.source === 'dashboard' && !isOptimisticChatMessage(message)) {
      const placeholder = messages.get(optimisticChatId(message.correlationId));
      if (placeholder && placeholder.senderId && placeholder.senderId === message.senderId)
        messages.delete(placeholder.id);
    }
    const existing = messages.get(message.id);
    if (existing?.delivery && message.delivery && !canTransitionDelivery(existing.delivery, message.delivery)) continue;
    messages.set(message.id, message);
  }
  return [...messages.values()]
    .sort((left, right) => Date.parse(left.timestamp) - Date.parse(right.timestamp) || left.id.localeCompare(right.id))
    .slice(-CHAT_TIMELINE_MAX_MESSAGES);
}

export interface ChatSendOutcome {
  /** The server's record of the message, when the response carried one. */
  saved: ChatMessage | null;
  delivery: ChatDelivery;
  error: string | null;
}

const UNKNOWN_ERROR =
  'The dashboard could not confirm this message. It may have been sent, so it was not retried automatically.';

/**
 * Classify a completed HTTP response. A message the server returns is authoritative. Without one,
 * only a response the dashboard API itself produced before publishing (4xx, or its explicit
 * history-unavailable 503) proves the message was not sent; anything else, such as a proxy 502/504
 * or a non-JSON body, is an unknown outcome.
 */
export function classifyChatSendResponse(status: number, body: unknown): ChatSendOutcome {
  const data = body && typeof body === 'object' ? (body as Record<string, unknown>) : {};
  const error = typeof data.error === 'string' ? data.error : null;
  const saved = parseChatMessage(data.message);
  if (saved) {
    const delivery = saved.delivery ?? (status >= 200 && status < 300 ? 'published' : 'unknown');
    return { saved, delivery, error };
  }
  const apiRejection = data.ok === false && typeof data.code === 'string';
  if (apiRejection && status >= 400 && status < 500 && status !== 408)
    return { saved: null, delivery: 'failed', error: error ?? 'Message could not be sent.' };
  if (apiRejection && status === 503 && data.code === 'CHAT_HISTORY_UNAVAILABLE')
    return { saved: null, delivery: 'failed', error: error ?? 'Message could not be sent.' };
  return { saved: null, delivery: 'unknown', error: UNKNOWN_ERROR };
}

/** A request that never produced a response (network loss, timeout, abort) has an unknown outcome. */
export function classifyChatSendFailure(): ChatSendOutcome {
  return { saved: null, delivery: 'unknown', error: UNKNOWN_ERROR };
}
