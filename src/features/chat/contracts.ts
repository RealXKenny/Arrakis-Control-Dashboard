import { z } from 'zod';

export const CHAT_HISTORY_PAGE_SIZE = 50;
export const CHAT_RECONCILE_BATCH_SIZE = 200;
/** A send still `pending` after this long lost its process mid-operation; its outcome is unknown. */
export const CHAT_STALE_PENDING_MS = 120_000;
export const CHAT_SERVER_ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/;
/** Browser-generated idempotency key (UUID) that is also the message's public correlation ID. */
export const CHAT_CLIENT_KEY_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const chatDeliverySchema = z.enum(['pending', 'published', 'accepted', 'delivered', 'failed', 'unknown']);
export type ChatDelivery = z.infer<typeof chatDeliverySchema>;

export const chatMessageSchema = z.object({
  id: z.string().min(1).max(128),
  streamId: z.string().regex(/^\d+-\d+$/),
  serverId: z.string().regex(CHAT_SERVER_ID_PATTERN),
  senderId: z.string().min(1).max(200).optional(),
  senderName: z.string().min(1).max(200),
  /** Authenticated dashboard sender's Discord avatar hash, never a user-supplied image URL. */
  senderAvatar: z
    .string()
    .regex(/^(a_)?[a-f0-9]{32}$/)
    .optional(),
  source: z.enum(['game', 'dashboard', 'discord']),
  /** Display body of an identity-verified Discord relay; content retains the original game text. */
  relayContent: z
    .string()
    .min(1)
    .max(4_000)
    .refine((value) => [...value].length <= 2_000)
    .optional(),
  content: z
    .string()
    .min(1)
    .max(4_000)
    .refine((value) => [...value].length <= 2_000),
  timestamp: z.string().datetime(),
  correlationId: z.string().min(1).max(128),
  externalEventId: z.string().min(1).max(128).optional(),
  delivery: chatDeliverySchema.optional(),
});

export type ChatMessage = z.infer<typeof chatMessageSchema>;
export type ChatMessageInput = Omit<ChatMessage, 'streamId'>;

export interface ChatServer {
  readonly id: string;
  readonly label: string;
  readonly map: string;
}

export interface ChatHistoryPage {
  messages: ChatMessage[];
  nextCursor: string | null;
}

export function parseChatMessage(value: unknown): ChatMessage | null {
  const parsed = chatMessageSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

/** Unpublished dashboard drafts and failed sends never belong to the shared conversation. */
export function isPublicChatMessage(message: ChatMessage): boolean {
  return (
    message.source !== 'dashboard' ||
    message.delivery === 'published' ||
    message.delivery === 'accepted' ||
    message.delivery === 'delivered'
  );
}

export function validateChatContent(value: unknown, maximum: number): string {
  if (typeof value !== 'string') throw new Error('Message content must be text.');
  const content = value.replaceAll('\r\n', '\n').replaceAll('\r', '\n').trim();
  if (!content) throw new Error('Enter a message before sending.');
  if ([...content].length > maximum) throw new Error(`Messages are limited to ${maximum} characters.`);
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(content))
    throw new Error('Messages cannot contain control characters.');
  return content;
}

export function canTransitionDelivery(from: ChatDelivery | undefined, to: ChatDelivery): boolean {
  if (from === to) return true;
  if (from === 'pending') return ['published', 'accepted', 'failed', 'unknown'].includes(to);
  if (from === 'unknown') return ['published', 'accepted', 'delivered', 'failed'].includes(to);
  if (from === 'published') return ['accepted', 'delivered'].includes(to);
  if (from === 'accepted') return to === 'delivered';
  return false;
}
