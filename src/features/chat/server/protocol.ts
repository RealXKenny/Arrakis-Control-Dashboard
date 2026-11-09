import { randomUUID } from 'node:crypto';

export interface DecodedMapChat {
  id: string;
  sender: string;
  text: string;
  displayName?: string;
  timestamp?: string;
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
      payload.m_ChannelType !== 'Map' ||
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
    };
  } catch {
    return null;
  }
}
