import '../../../lib/assert-server';
import { createHash } from 'node:crypto';
import { getRedisClient } from '../../../lib/redis/client';
import { chatKeys } from '../../../lib/redis/keys';
import {
  CHAT_HISTORY_PAGE_SIZE,
  CHAT_RECONCILE_BATCH_SIZE,
  CHAT_SERVER_ID_PATTERN,
  CHAT_STALE_PENDING_MS,
  canTransitionDelivery,
  isPublicChatMessage,
  chatDeliverySchema,
  parseChatMessage,
  type ChatDelivery,
  type ChatHistoryPage,
  type ChatMessage,
  type ChatMessageInput,
} from '../contracts';
import { getChatConfig } from './config';
import { parseDiscordRelay } from '../discord-relay';

type HistoryOptions = { maxMessages: number; retentionMs: number };

function options(overrides?: Partial<HistoryOptions>): HistoryOptions {
  const config = getChatConfig();
  return {
    maxMessages: overrides?.maxMessages ?? config?.historyMaxMessages ?? 10_000,
    retentionMs: overrides?.retentionMs ?? (config?.historyRetentionDays ?? 7) * 86_400_000,
  };
}

function redis() {
  const client = getRedisClient();
  if (!client) throw new Error('Chat requires REDIS_URL.');
  return client;
}

/** Defense in depth: every key builder below embeds the ID inside a Cluster hash tag. */
function assertServerId(serverId: string): void {
  if (!CHAT_SERVER_ID_PATTERN.test(serverId)) throw new Error('Invalid chat destination.');
}

function storedPayload(message: ChatMessageInput): string {
  return JSON.stringify(message);
}

function eventKey(serverId: string, eventId: string): string {
  return chatKeys.event(serverId, createHash('sha256').update(eventId).digest('hex'));
}

/** Oldest Stream ID still inside the age window; reads never return anything older. */
function minimumStreamId(retentionMs: number, now = Date.now()): string {
  return `${Math.max(0, now - retentionMs)}-0`;
}

function compareStreamIds(left: string, right: string): number {
  const [leftMs, leftSequence] = left.split('-').map(BigInt);
  const [rightMs, rightSequence] = right.split('-').map(BigInt);
  if (leftMs !== rightMs) return leftMs < rightMs ? -1 : 1;
  if (leftSequence === rightSequence) return 0;
  return leftSequence < rightSequence ? -1 : 1;
}

async function publishLive(message: ChatMessage): Promise<void> {
  if (!isPublicChatMessage(message)) return;
  try {
    await redis().command(['PUBLISH', chatKeys.live(message.serverId), JSON.stringify(message)]);
  } catch {
    // Pub/Sub is a non-durable hint; the Stream and delivery keys stay authoritative and the SSE
    // gateway reconciles both on its next poll.
  }
}

interface ParsedEntries {
  messages: ChatMessage[];
  /** Every Stream ID returned by Redis, including entries rejected below, in Redis order. */
  ids: string[];
}

/**
 * Decode raw Stream entries for one destination. An entry is rejected unless its payload is a
 * valid message whose destination equals the Stream it was read from, so a corrupt, foreign or
 * mis-keyed entry can never surface in another destination's history, replay or reconciliation.
 */
export function parseChatStreamEntries(value: unknown, serverId: string): ParsedEntries {
  if (!Array.isArray(value)) throw new Error('Invalid Redis Stream response.');
  const messages: ChatMessage[] = [];
  const ids: string[] = [];
  const discordBotId = getChatConfig()?.discordBotFuncomId;
  for (const entry of value) {
    if (!Array.isArray(entry) || typeof entry[0] !== 'string' || !/^\d+-\d+$/.test(entry[0])) continue;
    ids.push(entry[0]);
    if (!Array.isArray(entry[1])) continue;
    const fields = entry[1] as unknown[];
    const payloadIndex = fields.findIndex((field, index) => index % 2 === 0 && field === 'payload');
    if (payloadIndex < 0 || typeof fields[payloadIndex + 1] !== 'string') continue;
    try {
      const stored: unknown = JSON.parse(fields[payloadIndex + 1] as string);
      if (!stored || typeof stored !== 'object' || Array.isArray(stored)) continue;
      const message = parseChatMessage({ ...stored, streamId: entry[0] });
      if (message && message.serverId === serverId) {
        // Older retained relays predate the explicit source; upgrade presentation without rewriting Redis.
        const relay =
          message.source === 'game' ? parseDiscordRelay(message.senderId, message.content, discordBotId) : null;
        messages.push(
          relay
            ? { ...message, source: 'discord', senderName: relay.senderName, relayContent: relay.content }
            : message,
        );
      }
    } catch {
      // A malformed entry does not make the rest of the history unreadable.
    }
  }
  return { messages, ids };
}

function presentDelivery(message: ChatMessage, stored: unknown, now: number): ChatMessage {
  if (message.source !== 'dashboard') return message;
  const parsed = chatDeliverySchema.safeParse(stored);
  const delivery = parsed.success ? parsed.data : (message.delivery ?? 'pending');
  // A process that died between recording and confirming leaves a permanent `pending`.
  if (delivery === 'pending' && now - Date.parse(message.timestamp) > CHAT_STALE_PENDING_MS)
    return { ...message, delivery: 'unknown' };
  return { ...message, delivery };
}

/** Overlay each dashboard message's current delivery state (one MGET in the destination's slot). */
export async function withCurrentDelivery(serverId: string, messages: ChatMessage[]): Promise<ChatMessage[]> {
  assertServerId(serverId);
  const outgoing = messages.filter((message) => message.source === 'dashboard' && message.serverId === serverId);
  if (!outgoing.length) return messages;
  const values = await redis().command(['MGET', ...outgoing.map((message) => chatKeys.delivery(serverId, message.id))]);
  const states = new Map(outgoing.map((message, index) => [message.id, Array.isArray(values) ? values[index] : null]));
  const now = Date.now();
  return messages.map((message) =>
    states.has(message.id) ? presentDelivery(message, states.get(message.id), now) : message,
  );
}

async function readEntry(serverId: string, streamId: string): Promise<ChatMessage | null> {
  const entries = await redis().command(['XRANGE', chatKeys.messages(serverId), streamId, streamId]);
  const [message] = parseChatStreamEntries(entries, serverId).messages;
  if (!message) return null;
  return (await withCurrentDelivery(serverId, [message]))[0];
}

/** Find a message by its idempotency/external event ID, with its current delivery state. */
export async function findChatMessageByEvent(serverId: string, eventId: string): Promise<ChatMessage | null> {
  assertServerId(serverId);
  const streamId = await redis().command(['GET', eventKey(serverId, eventId)]);
  if (typeof streamId !== 'string' || !/^\d+-\d+$/.test(streamId)) return null;
  return readEntry(serverId, streamId);
}

export async function appendChatMessage(
  input: ChatMessageInput,
  overrides?: Partial<HistoryOptions>,
): Promise<{ message: ChatMessage; inserted: boolean }> {
  assertServerId(input.serverId);
  const settings = options(overrides);
  const eventId = input.externalEventId ?? input.id;
  const result = await redis().eval(
    `
    local existing = redis.call('GET', KEYS[2])
    if existing then return {existing, 0} end
    local streamId = redis.call('XADD', KEYS[1], '*', 'payload', ARGV[1])
    redis.call('SET', KEYS[2], streamId, 'PX', ARGV[2])
    if ARGV[6] ~= '' then redis.call('SET', KEYS[3], ARGV[6], 'PX', ARGV[2]) end
    redis.call('XTRIM', KEYS[1], 'MINID', ARGV[3])
    redis.call('XTRIM', KEYS[1], 'MAXLEN', ARGV[4])
    redis.call('EXPIRE', KEYS[1], ARGV[5])
    return {streamId, 1}
    `,
    [chatKeys.messages(input.serverId), eventKey(input.serverId, eventId), chatKeys.delivery(input.serverId, input.id)],
    [
      storedPayload(input),
      settings.retentionMs,
      minimumStreamId(settings.retentionMs),
      settings.maxMessages,
      Math.ceil(settings.retentionMs / 1_000),
      input.source === 'dashboard' ? (input.delivery ?? 'pending') : '',
    ],
  );
  if (!Array.isArray(result) || typeof result[0] !== 'string') throw new Error('Invalid chat persistence response.');
  const inserted = Number(result[1]) === 1;
  if (!inserted) {
    // Return what was actually stored for this event, not the duplicate request's copy.
    const stored = await readEntry(input.serverId, result[0]);
    return { message: stored ?? { ...input, streamId: result[0] }, inserted };
  }
  const message = { ...input, streamId: result[0] };
  await publishLive(message);
  return { message, inserted };
}

/**
 * Move a dashboard message to a new delivery state if the state machine allows it. Returns the
 * state now stored, or null when the message has expired. Stream entries are never rewritten.
 */
export async function setChatDelivery(message: ChatMessage, to: ChatDelivery): Promise<ChatMessage | null> {
  const current = parseChatMessage(message);
  if (!current || current.source !== 'dashboard') throw new Error('Invalid chat message.');
  assertServerId(current.serverId);
  const allowedFrom = chatDeliverySchema.options.filter((from) => from !== to && canTransitionDelivery(from, to));
  const result = await redis().eval(
    `
    local current = redis.call('GET', KEYS[1])
    if not current then return false end
    if current == ARGV[1] then return current end
    for index = 2, #ARGV do
      if current == ARGV[index] then
        redis.call('SET', KEYS[1], ARGV[1], 'KEEPTTL')
        return ARGV[1]
      end
    end
    return current
    `,
    [chatKeys.delivery(current.serverId, current.id)],
    [to, ...allowedFrom],
  );
  const stored = chatDeliverySchema.safeParse(result);
  if (!stored.success) return null;
  const updated = { ...current, delivery: stored.data };
  if (stored.data === to) await publishLive(updated);
  return updated;
}

export async function readChatHistory(
  serverId: string,
  options: { before?: string; after?: string; limit?: number; retentionMs?: number; includeUnpublished?: boolean } = {},
): Promise<ChatHistoryPage> {
  assertServerId(serverId);
  const limit = Math.min(CHAT_RECONCILE_BATCH_SIZE, Math.max(1, options.limit ?? CHAT_HISTORY_PAGE_SIZE));
  if ((options.before && !validCursor(options.before)) || (options.after && !validCursor(options.after)))
    throw new Error('Invalid chat history cursor.');
  const key = chatKeys.messages(serverId);
  // Entries that aged out but have not been trimmed yet (no append since) are never returned, so
  // expired history cannot be paged or replayed and every range is bounded below.
  const floor = minimumStreamId(options.retentionMs ?? retentionWindow());
  if (options.after) {
    const start = compareStreamIds(options.after, floor) >= 0 ? `(${options.after}` : floor;
    const parsed = parseChatStreamEntries(await redis().command(['XRANGE', key, start, '+', 'COUNT', limit]), serverId);
    const messages = await withCurrentDelivery(serverId, parsed.messages);
    // Advance past rejected entries too, so a run of invalid entries cannot stall reconciliation.
    return {
      messages: options.includeUnpublished ? messages : messages.filter(isPublicChatMessage),
      nextCursor: parsed.ids.at(-1) ?? options.after,
    };
  }
  const start = options.before ? `(${options.before}` : '+';
  const parsed = parseChatStreamEntries(
    await redis().command(['XREVRANGE', key, start, floor, 'COUNT', limit + 1]),
    serverId,
  );
  const hasMore = parsed.ids.length > limit;
  const pageIds = new Set(parsed.ids.slice(0, limit));
  const selected = parsed.messages.filter((message) => pageIds.has(message.streamId)).reverse();
  const messages = await withCurrentDelivery(serverId, selected);
  return {
    messages: options.includeUnpublished ? messages : messages.filter(isPublicChatMessage),
    nextCursor: hasMore ? (parsed.ids[limit - 1] ?? null) : null,
  };
}

function retentionWindow(): number {
  return options().retentionMs;
}

function validCursor(value: string): boolean {
  return /^\d{1,20}-\d{1,20}$/.test(value);
}

/** Entries after `after`, plus the cursor to resume from (which also skips rejected entries). */
export async function reconcileChatMessages(
  serverId: string,
  after: string,
): Promise<{ messages: ChatMessage[]; cursor: string }> {
  // The gateway tracks these privately until confirmed; it never sends unpublished payloads to clients.
  const page = await readChatHistory(serverId, { after, limit: CHAT_RECONCILE_BATCH_SIZE, includeUnpublished: true });
  return { messages: page.messages, cursor: page.nextCursor ?? after };
}
