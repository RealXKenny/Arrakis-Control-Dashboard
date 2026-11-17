import '../../../lib/assert-server';
import { AppError } from '../../../lib/errors';
import { createLogger } from '../../../lib/logger';
import { getSession } from '../../auth/server/session';
import { canTransitionDelivery, isPublicChatMessage, type ChatDelivery, type ChatMessage } from '../contracts';
import { getChatServer, getChatConfig } from './config';
import { readChatHistory, reconcileChatMessages, withCurrentDelivery } from './history';
import { subscribeToChat } from './live';

const log = createLogger('CHAT');

function compareStreamIds(left: string, right: string): number {
  const [leftMs, leftSequence] = left.split('-').map(BigInt);
  const [rightMs, rightSequence] = right.split('-').map(BigInt);
  if (leftMs !== rightMs) return leftMs < rightMs ? -1 : 1;
  if (leftSequence === rightSequence) return 0;
  return leftSequence < rightSequence ? -1 : 1;
}

export async function createChatGateway(request: Request, sessionId: string): Promise<Response> {
  const url = new URL(request.url);
  const serverId = url.searchParams.get('server') ?? '';
  const config = getChatConfig();
  const server = getChatServer(serverId, config);
  if (!config || !server)
    throw new AppError('This chat destination is unavailable.', 404, 'CHAT_SERVER_NOT_FOUND', true);
  const requestedCursor = request.headers.get('last-event-id') ?? url.searchParams.get('after') ?? undefined;
  if (requestedCursor && !/^\d+-\d+$/.test(requestedCursor))
    throw new AppError('Invalid chat resume cursor.', 400, 'INVALID_CHAT_CURSOR', true);
  const encoder = new TextEncoder();
  let cancelStream: () => void = () => undefined;

  return new Response(
    new ReadableStream<Uint8Array>({
      start(controller) {
        let closed = false;
        let ready = false;
        let polling = false;
        let lastStreamId = requestedCursor ?? '0-0';
        let lastSessionCheck = Date.now();
        let unsubscribe: (() => void) | undefined;
        const pending: ChatMessage[] = [];
        const versions = new Map<string, { version: string; delivery?: ChatDelivery }>();
        // Dashboard sends shown as `pending`; their state lives outside the Stream, so a missed
        // Pub/Sub state notification is repaired by re-reading these on every reconciliation.
        const unresolved = new Map<string, ChatMessage>();
        const enqueue = (text: string): boolean => {
          if (closed) return false;
          // Bound buffered chunks for a slow/disconnected reader; EventSource resumes from Redis.
          if ((controller.desiredSize ?? 0) < -200) {
            cleanup();
            return false;
          }
          controller.enqueue(encoder.encode(text));
          return true;
        };
        const send = (event: string, data: unknown, id?: string): boolean => {
          if (closed) return false;
          try {
            return enqueue(`${id ? `id: ${id}\n` : ''}event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
          } catch {
            cleanup();
            return false;
          }
        };
        const emit = (message: ChatMessage, deliver = true): void => {
          if (message.serverId !== server.id) return;
          const version = `${message.delivery ?? ''}:${message.content.length}:${message.timestamp}`;
          const previous = versions.get(message.id);
          if (previous?.version === version) return;
          // Never let a late or reordered notification move a message backwards (published → pending).
          if (previous?.delivery && message.delivery && !canTransitionDelivery(previous.delivery, message.delivery))
            return;
          versions.delete(message.id);
          versions.set(message.id, { version, delivery: message.delivery });
          if (versions.size > 1_000) versions.delete(versions.keys().next().value!);
          if (message.source === 'dashboard' && (message.delivery === 'pending' || message.delivery === 'unknown')) {
            unresolved.set(message.id, message);
            if (unresolved.size > 100) unresolved.delete(unresolved.keys().next().value!);
          } else unresolved.delete(message.id);
          // Pub/Sub is a hint: a newer hint must not skip an older missed Stream entry.
          // Only completed durable reads advance the SSE resume cursor.
          if (deliver && isPublicChatMessage(message)) send('message', message);
        };
        const receive = (message: ChatMessage): void => {
          if (message.serverId !== server.id || closed) return;
          if (!ready) {
            if (pending.length >= 200) {
              send('resync', { reason: 'Live event buffer limit reached.' });
              cleanup();
              return;
            }
            pending.push(message);
          } else emit(message);
        };
        const cleanup = (): void => {
          if (closed) return;
          closed = true;
          clearInterval(timer);
          request.signal.removeEventListener('abort', cleanup);
          unsubscribe?.();
          try {
            controller.close();
          } catch {
            // The request may already have been cancelled.
          }
        };
        cancelStream = cleanup;
        const reconcile = async (): Promise<void> => {
          if (closed || polling || !ready) return;
          polling = true;
          try {
            const now = Date.now();
            if (now - lastSessionCheck >= 60_000) {
              lastSessionCheck = now;
              const fresh = await getSession(sessionId);
              if (!fresh) {
                send('session-ended', { error: 'Your session is no longer authorized.' });
                cleanup();
                return;
              }
            }
            const reconciled = await reconcileChatMessages(server.id, lastStreamId);
            for (const message of reconciled.messages) emit(message);
            if (compareStreamIds(reconciled.cursor, lastStreamId) > 0) {
              lastStreamId = reconciled.cursor;
              send('resync-complete', { count: reconciled.messages.filter(isPublicChatMessage).length }, lastStreamId);
            }
            if (unresolved.size && !closed)
              for (const message of await withCurrentDelivery(server.id, [...unresolved.values()])) emit(message);
            if (!closed) enqueue(': heartbeat\n\n');
          } catch {
            if (!closed) send('gateway-degraded', { error: 'History reconciliation is temporarily unavailable.' });
          } finally {
            polling = false;
          }
        };
        const timer = setInterval(() => void reconcile(), 15_000);
        timer.unref();
        request.signal.addEventListener('abort', cleanup, { once: true });
        if (request.signal.aborted) {
          cleanup();
          return;
        }
        void subscribeToChat(server.id, receive)
          .then(async (unsubscribeChat) => {
            if (closed) {
              unsubscribeChat();
              return;
            }
            unsubscribe = unsubscribeChat;
            const history = await readChatHistory(server.id, {
              after: requestedCursor,
              limit: requestedCursor ? 200 : 50,
              includeUnpublished: true,
            });
            for (const message of history.messages) emit(message, Boolean(requestedCursor));
            // A resume cursor also skips entries rejected by destination validation.
            const readCursor = requestedCursor ? history.nextCursor : history.messages.at(-1)?.streamId;
            if (readCursor && compareStreamIds(readCursor, lastStreamId) > 0) lastStreamId = readCursor;
            if (!requestedCursor)
              send(
                'history',
                { messages: history.messages.filter(isPublicChatMessage), nextCursor: history.nextCursor },
                history.messages.at(-1)?.streamId,
              );
            else {
              // Delivery updates do not append Stream entries. Reconnecting after an older pending
              // send must refresh recent outgoing records even when their IDs precede the cursor.
              const recent = await readChatHistory(server.id, { limit: 200, includeUnpublished: true });
              for (const message of recent.messages) if (message.source === 'dashboard') emit(message);
              send('resync-complete', { count: history.messages.filter(isPublicChatMessage).length }, lastStreamId);
            }
            ready = true;
            for (const message of pending) emit(message);
            pending.length = 0;
            if (closed) return;
            enqueue(': connected\n\n');
          })
          .catch((error: unknown) => {
            log.error('Chat gateway initialization failed', error);
            send('gateway-error', { error: 'Live chat is temporarily unavailable.' });
            cleanup();
          });
      },
      cancel() {
        cancelStream();
      },
    }),
    {
      headers: {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'private, no-store, no-transform',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
      },
    },
  );
}
