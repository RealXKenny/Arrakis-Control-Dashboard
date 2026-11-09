import type { ChatMessage } from './contracts';

/** Presentation hints only. Names cannot authorize a send, status lookup, or account operation. */
export interface ChatViewer {
  userId: string;
  names: readonly string[];
}

function normalizedName(name: string): string {
  return name.normalize('NFC').trim().toLowerCase();
}

export function isViewerChatMessage(message: ChatMessage, viewer: ChatViewer): boolean {
  // A known dashboard account ID is authoritative, even if someone else has the same display name.
  if (message.source === 'dashboard' && message.senderId) return message.senderId === viewer.userId;
  const name = normalizedName(message.senderName);
  return Boolean(name && viewer.names.some((alias) => normalizedName(alias) === name));
}
