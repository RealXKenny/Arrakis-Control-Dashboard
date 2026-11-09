import '../../../lib/assert-server';
import { createRedisPatternSubscriber } from '../../../lib/redis/subscriber';
import { chatKeys } from '../../../lib/redis/keys';
import { createLogger } from '../../../lib/logger';
import { parseChatMessage, type ChatMessage } from '../contracts';

type Listener = (message: ChatMessage) => void;
const log = createLogger('CHAT');
const globals = globalThis as typeof globalThis & {
  arrakisChatListeners?: Map<string, Set<Listener>>;
  arrakisChatSubscriber?: Promise<{ close: () => void }>;
};
const listeners = (globals.arrakisChatListeners ??= new Map<string, Set<Listener>>());
const CHANNEL_PREFIX = 'arrakis:chat:live:';

function subscriber() {
  return (globals.arrakisChatSubscriber ??= createRedisPatternSubscriber(
    `${CHANNEL_PREFIX}*`,
    (channel, payload) => {
      const serverId = channel.startsWith(CHANNEL_PREFIX) ? channel.slice(CHANNEL_PREFIX.length) : '';
      try {
        const message = parseChatMessage(JSON.parse(payload));
        if (!message || message.serverId !== serverId) return;
        for (const listener of listeners.get(serverId) ?? []) listener(message);
      } catch {
        log.warn('Ignored a malformed chat live notification.');
      }
    },
    () => log.warn('Chat live subscriber connection error; Stream reconciliation remains active.'),
  ).catch((error: unknown) => {
    globals.arrakisChatSubscriber = undefined;
    throw error;
  }));
}

export async function subscribeToChat(serverId: string, listener: Listener): Promise<() => void> {
  const current = listeners.get(serverId) ?? new Set<Listener>();
  current.add(listener);
  listeners.set(serverId, current);
  try {
    await subscriber();
  } catch (error) {
    current.delete(listener);
    throw error;
  }
  return () => {
    current.delete(listener);
    if (!current.size) listeners.delete(serverId);
  };
}

export function chatLiveChannel(serverId: string): string {
  return chatKeys.live(serverId);
}
