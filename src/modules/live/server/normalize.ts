import type { LiveEvent } from '../types';

function object(value: unknown): Record<string, unknown> {
  if (typeof value === 'string') {
    try {
      value = JSON.parse(value);
    } catch {
      return {};
    }
  }
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}
function text(value: unknown): string | null {
  return typeof value === 'string' ? value.slice(0, 2000) : null;
}
function number(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export function normalizeEvent(source: string, payload: string, id: string, receivedAt: number): LiveEvent {
  const event: LiveEvent = { id, source, receivedAt, kind: 'observation', fields: {} };
  if (payload.length > 65536) return event;
  const root = object(payload);
  if (source.startsWith('status.')) {
    event.kind = 'status';
    event.fields = {
      state: number(root.ServerState),
      map: text(root.MapName),
      timestamp: text(root.Timestamp),
      destination: text(root.DestinationPartitionId),
    };
    return event;
  }
  const content = object(root.content ?? root.Content);
  if (source === 'chat.intercept' && text(content.m_Id) && text(object(content.m_Message).m_UnlocalizedMessage)) {
    // Whispers are deliberately excluded from retained content.
    if (/whisper|private|direct/i.test(String(content.m_ChannelType))) return event;
    event.kind = 'chat';
    event.id = String(content.m_Id).slice(0, 200);
    event.fields = {
      channel: text(content.m_ChannelType),
      sender: text(content.m_FuncomIdFrom),
      message: text(object(content.m_Message).m_UnlocalizedMessage),
      timestamp: text(content.m_Timestamp),
    };
  }
  if (source === 'notifications') {
    const activity = object(content.content ?? content.Content);
    const data = object(activity.m_ActivityData);
    if (text(activity.m_PlayerId) && Object.keys(data).length) {
      event.kind = 'activity';
      event.fields = {
        player: text(activity.m_PlayerId),
        map: text(object(data.m_Map).Name),
        previousMap: text(object(data.m_PreviousMap).Name),
        instance: text(data.m_InstanceId),
        partition: number(data.m_PartitionId),
        dimension: number(data.m_DimensionIndex),
        previousDimension: number(data.m_PreviousDimensionIndex),
        authorityTransfer: typeof data.m_bIsAuthorityTransfer === 'boolean' ? data.m_bIsAuthorityTransfer : null,
      };
    }
  }
  return event;
}
