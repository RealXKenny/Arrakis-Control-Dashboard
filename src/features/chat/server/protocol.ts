import { createHash, randomUUID } from 'node:crypto';

export interface DecodedMapChat {
  id: string;
  sender: string;
  text: string;
  displayName?: string;
  timestamp?: string;
  /** True for proximity (nearby) chat; only returned when proximity decoding is allowed. */
  proximity?: boolean;
}

/** Channel-type spellings treated as proximity chat, matching the bot's bridge. */
const PROXIMITY_TYPES = new Set(['proximity', 'local', 'nearby']);

export function isProximityChannelType(value: unknown): boolean {
  return typeof value === 'string' && PROXIMITY_TYPES.has(value.toLowerCase());
}

function gameTimestamp(date: Date): string {
  return date.toISOString().slice(0, 19).replaceAll('-', '.').replace('T', '-').replaceAll(':', '.');
}

function parseGameTimestamp(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const match = /^(\d{4})\.(\d{2})\.(\d{2})-(\d{2})\.(\d{2})\.(\d{2})$/.exec(value);
  if (!match) return undefined;
  const date = new Date(`${match[1]}-${match[2]}-${match[3]}T${match[4]}:${match[5]}:${match[6]}Z`);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

export function encodeMapChat(
  funcomId: string,
  message: string,
  displayName?: string,
  id = randomUUID().replaceAll('-', '').toUpperCase(),
  now = new Date(),
): { id: string; body: Buffer } {
  const payload = {
    m_Id: id,
    m_ChannelType: 'Map',
    m_SubChannelId: '',
    m_bUseSpoofedUserName: Boolean(displayName),
    m_SpoofedUserNameFrom: { m_TableId: '', m_Key: '', m_UnlocalizedName: displayName ?? '' },
    m_FuncomIdFrom: funcomId,
    m_UserNameTo: '',
    m_Message: {
      m_UnlocalizedMessage: message,
      m_LocalizedMessage: { m_TableId: '', m_Key: '', m_FormatArgs: [] },
    },
    m_Timestamp: gameTimestamp(now),
    m_OriginLocation: { X: 0, Y: 0, Z: 0 },
    m_HasSeenMessage: false,
  };
  const content = JSON.stringify(payload).replace(
    '"m_OriginLocation":{"X":0,"Y":0,"Z":0}',
    '"m_OriginLocation":{"X":0.0,"Y":0.0,"Z":0.0}',
  );
  return { id, body: Buffer.from(JSON.stringify({ Type: 'TextChat', content })) };
}

export function decodeMapChat(body: Buffer): DecodedMapChat | null {
  return decodeGameChat(body, false);
}

/** Decodes public game chat: map chat, plus proximity chat when allowed. Private messages are always rejected. */
export function decodeGameChat(body: Buffer, allowProximity: boolean): DecodedMapChat | null {
  if (body.length > 64 * 1024) return null;
  try {
    const envelope: unknown = JSON.parse(body.toString('utf8'));
    if (!envelope || typeof envelope !== 'object') return null;
    const outer = envelope as Record<string, unknown>;
    if (outer.Type !== 'TextChat') return null;
    const raw = outer.content ?? outer.Content;
    const parsed: unknown = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!parsed || typeof parsed !== 'object') return null;
    const payload = parsed as Record<string, unknown>;
    const message = payload.m_Message as Record<string, unknown> | undefined;
    const spoofed = payload.m_SpoofedUserNameFrom as Record<string, unknown> | undefined;
    const id = payload.m_Id;
    const sender = payload.m_FuncomIdFrom;
    const text = message?.m_UnlocalizedMessage;
    if (
      (payload.m_ChannelType !== 'Map' && !(allowProximity && isProximityChannelType(payload.m_ChannelType))) ||
      payload.m_UserNameTo ||
      typeof id !== 'string' ||
      !id ||
      id.length > 128 ||
      typeof sender !== 'string' ||
      !sender.trim() ||
      sender.length > 200 ||
      typeof text !== 'string' ||
      !text.trim() ||
      [...text].length > 2_000
    )
      return null;
    const displayName = spoofed?.m_UnlocalizedName;
    return {
      id,
      sender,
      text,
      displayName:
        typeof displayName === 'string' && displayName.trim() && displayName.length <= 200 ? displayName : undefined,
      timestamp: parseGameTimestamp(payload.m_Timestamp),
      ...(payload.m_ChannelType === 'Map' ? {} : { proximity: true }),
    };
  } catch {
    return null;
  }
}

/** The exchange the game redirects proximity chat to; chat.intercept copies carry it in `redirect_exchange`. */
export const PROXIMITY_EXCHANGE = 'chat.proximity';

export interface DecodedProximityChat {
  /** Hash of the broker-authenticated sender, native message ID and channel, shared by every copy. */
  id: string;
  /** Broker-authenticated AMQP user ID of the speaker. */
  sender: string;
  text: string;
  /** Funcom ID from the payload, used only to look up the character name. */
  funcomId?: string;
  /** Name the game put in the payload, used when no character name is found. */
  displayName?: string;
  timestamp?: string;
}

function headerText(value: unknown): string | undefined {
  if (typeof value === 'string') return value;
  if (Buffer.isBuffer(value)) return value.toString('utf8');
  return undefined;
}

function clean(value: unknown, limit: number): string {
  if (typeof value !== 'string') return '';
  return [...value]
    .map((character) => {
      const code = character.charCodeAt(0);
      return code < 32 || code === 127 ? ' ' : character;
    })
    .join('')
    .slice(0, limit);
}

/**
 * Decodes a proximity copy from chat.intercept: only `text_chat` messages redirected to chat.proximity
 * with `m_ChannelType: "Proximity"`. The speaker is the AMQP user ID, never a payload field.
 */
export function decodeProximityChat(
  body: Buffer,
  properties: { type?: unknown; userId?: unknown; headers?: Record<string, unknown> } | undefined,
): DecodedProximityChat | null {
  if (body.length > 16 * 1024 || !properties || properties.type !== 'text_chat') return null;
  if (headerText(properties.headers?.redirect_exchange) !== PROXIMITY_EXCHANGE) return null;
  try {
    const envelope: unknown = JSON.parse(body.toString('utf8'));
    if (!envelope || typeof envelope !== 'object') return null;
    const outer = envelope as Record<string, unknown>;
    if (outer.Type !== 'TextChat') return null;
    const raw = outer.content ?? outer.Content;
    const parsed: unknown = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!parsed || typeof parsed !== 'object') return null;
    const payload = parsed as Record<string, unknown>;
    if (payload.m_ChannelType !== 'Proximity') return null;
    const message = payload.m_Message as Record<string, unknown> | undefined;
    const spoofed = payload.m_SpoofedUserNameFrom as Record<string, unknown> | undefined;
    const nativeId = clean(payload.m_Id, 128);
    const sender = clean(properties.userId, 180);
    const text = clean(message?.m_UnlocalizedMessage, 2_000);
    if (!nativeId || !sender || !text.trim()) return null;
    const funcomId = clean(payload.m_FuncomIdFrom, 180) || undefined;
    const displayName = clean(spoofed?.m_UnlocalizedName, 180) || funcomId;
    const id = createHash('sha256')
      .update(JSON.stringify([sender, nativeId, 'Proximity', '']))
      .digest('hex');
    return { id, sender, text, funcomId, displayName, timestamp: parseGameTimestamp(payload.m_Timestamp) };
  } catch {
    return null;
  }
}
