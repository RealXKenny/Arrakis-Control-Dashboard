'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { isPublicChatMessage, parseChatMessage, type ChatMessage, type ChatServer } from '../contracts';
import {
  CHAT_SEND_TIMEOUT_MS,
  classifyChatSendFailure,
  classifyChatSendResponse,
  mergeChatMessages,
  optimisticChatId,
} from '../delivery';

export type ChatConnection = 'connecting' | 'live' | 'reconnecting' | 'offline';

interface FailedChatSend {
  id: string;
  content: string;
  error: string;
}

function parseMessages(value: unknown, serverId: string): ChatMessage[] {
  if (!Array.isArray(value)) return [];
  return value
    .map(parseChatMessage)
    .filter(
      (message): message is ChatMessage =>
        Boolean(message) && message!.serverId === serverId && isPublicChatMessage(message!),
    );
}

export function useLiveChat(server: ChatServer, senderName: string, senderId: string) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [connection, setConnection] = useState<ChatConnection>('connecting');
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [failedMessages, setFailedMessages] = useState<FailedChatSend[]>([]);
  const eventSource = useRef<EventSource | null>(null);
  // Guards async work started for an earlier destination (or before unmount) from landing here.
  const activeServer = useRef(server.id);

  useEffect(() => {
    activeServer.current = server.id;
    setMessages([]);
    setNextCursor(null);
    setHistoryLoaded(false);
    setError(null);
    setFailedMessages([]);
    setConnection('connecting');
    const source = new EventSource(`/api/v2/chat/stream?server=${encodeURIComponent(server.id)}`);
    eventSource.current = source;
    const current = () => activeServer.current === server.id && eventSource.current === source;
    source.onopen = () => {
      if (!current()) return;
      setConnection('live');
      setError(null);
    };
    source.onerror = () => {
      if (current()) setConnection((state) => (state === 'offline' ? state : 'reconnecting'));
    };
    source.addEventListener('history', (event) => {
      if (!current()) return;
      try {
        const data = JSON.parse((event as MessageEvent).data) as { messages?: unknown; nextCursor?: unknown };
        setMessages((existing) => mergeChatMessages(existing, parseMessages(data.messages, server.id), server.id));
        setNextCursor(typeof data.nextCursor === 'string' ? data.nextCursor : null);
        setHistoryLoaded(true);
      } catch {
        setError('Received an invalid chat history response.');
      }
    });
    source.addEventListener('message', (event) => {
      if (!current()) return;
      try {
        const message = parseChatMessage(JSON.parse((event as MessageEvent).data));
        if (!message || message.serverId !== server.id || !isPublicChatMessage(message)) return;
        setMessages((existing) => mergeChatMessages(existing, [message], server.id));
        setHistoryLoaded(true);
      } catch {
        setError('Ignored an invalid live chat event.');
      }
    });
    source.addEventListener('resync-complete', () => {
      if (!current()) return;
      setConnection('live');
      setHistoryLoaded(true);
    });
    for (const name of ['gateway-degraded', 'gateway-error']) {
      source.addEventListener(name, (event) => {
        if (!current()) return;
        try {
          const data = JSON.parse((event as MessageEvent).data) as { error?: unknown };
          setError(typeof data.error === 'string' ? data.error : 'Live chat is temporarily unavailable.');
        } catch {
          setError('Live chat is temporarily unavailable.');
        }
      });
    }
    source.addEventListener('session-ended', () => {
      if (!current()) return;
      source.close();
      setConnection('offline');
      setError('Your session is no longer authorized. Sign in again to resume chat.');
    });
    return () => {
      source.close();
      if (eventSource.current === source) eventSource.current = null;
      if (activeServer.current === server.id) activeServer.current = '';
    };
  }, [server.id]);

  const loadOlder = useCallback(async (): Promise<void> => {
    if (!nextCursor || loadingOlder) return;
    const serverId = server.id;
    setLoadingOlder(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/v2/chat/history?server=${encodeURIComponent(serverId)}&before=${encodeURIComponent(nextCursor)}`,
        { cache: 'no-store' },
      );
      const body: unknown = await response.json();
      if (activeServer.current !== serverId) return;
      if (!response.ok || !body || typeof body !== 'object') throw new Error('Unable to load older messages.');
      const data = body as { messages?: unknown; nextCursor?: unknown; error?: unknown };
      setMessages((current) => mergeChatMessages(current, parseMessages(data.messages, serverId), serverId));
      setNextCursor(typeof data.nextCursor === 'string' ? data.nextCursor : null);
    } catch (loadError) {
      if (activeServer.current === serverId)
        setError(loadError instanceof Error ? loadError.message : 'Unable to load older messages.');
    } finally {
      if (activeServer.current === serverId) setLoadingOlder(false);
    }
  }, [loadingOlder, nextCursor, server.id]);

  /**
   * Send `content` under `clientKey`, the idempotency key. A new message gets a fresh key; checking
   * an unknown outcome resubmits the same key, which the server never publishes twice.
   */
  const submit = useCallback(
    async (content: string, clientKey: string): Promise<boolean> => {
      const serverId = server.id;
      const placeholderId = optimisticChatId(clientKey);
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), CHAT_SEND_TIMEOUT_MS);
      let outcome;
      try {
        const response = await fetch('/api/v2/chat/messages', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ serverId, content, clientKey }),
          signal: controller.signal,
        });
        const body: unknown = await response.json().catch(() => null);
        outcome = classifyChatSendResponse(response.status, body);
      } catch {
        outcome = classifyChatSendFailure();
      } finally {
        clearTimeout(timer);
      }
      if (activeServer.current !== serverId) return false;
      const { saved, delivery } = outcome;
      if (delivery === 'failed') {
        // This notice belongs only to this sender's browser, outside the shared message log.
        setMessages((current) =>
          current.filter(
            (message) =>
              isPublicChatMessage(message) ||
              (message.id !== placeholderId &&
                message.id !== saved?.id &&
                !(
                  message.source === 'dashboard' &&
                  message.senderId === senderId &&
                  message.correlationId === clientKey
                )),
          ),
        );
        setFailedMessages((current) =>
          [
            ...current.filter((message) => message.id !== clientKey),
            {
              id: clientKey,
              content,
              error: outcome.error ?? 'Your message could not be sent.',
            },
          ].slice(-20),
        );
        setError(null);
        return false;
      }
      setMessages((current) =>
        saved
          ? mergeChatMessages(current, [saved], serverId)
          : current.map((message) => (message.id === placeholderId ? { ...message, delivery } : message)),
      );
      setError(outcome.error);
      return delivery === 'published' || delivery === 'accepted' || delivery === 'delivered';
    },
    [server.id, senderId],
  );

  const send = useCallback(
    async (content: string): Promise<boolean> => {
      const trimmed = content.trim();
      if (!trimmed) return false;
      const clientKey = crypto.randomUUID();
      const optimistic: ChatMessage = {
        id: optimisticChatId(clientKey),
        streamId: `${Date.now()}-0`,
        serverId: server.id,
        senderId,
        senderName,
        source: 'dashboard',
        content: trimmed,
        timestamp: new Date().toISOString(),
        correlationId: clientKey,
        delivery: 'pending',
      };
      setMessages((current) => mergeChatMessages(current, [optimistic], server.id));
      setError(null);
      return submit(trimmed, clientKey);
    },
    [senderId, senderName, server.id, submit],
  );

  /** Ask the server for the recorded outcome of a send whose response was lost. */
  const checkStatus = useCallback(
    async (message: ChatMessage): Promise<boolean> => {
      setMessages((current) =>
        current.map((entry) => (entry.id === message.id ? { ...entry, delivery: 'pending' as const } : entry)),
      );
      setError(null);
      return submit(message.content, message.correlationId);
    },
    [submit],
  );

  const dismissFailedMessage = useCallback((id: string) => {
    setFailedMessages((current) => current.filter((message) => message.id !== id));
  }, []);

  return {
    messages,
    failedMessages: failedMessages.filter(
      (failed) =>
        !messages.some(
          (message) =>
            message.source === 'dashboard' &&
            message.senderId === senderId &&
            message.correlationId === failed.id &&
            isPublicChatMessage(message),
        ),
    ),
    dismissFailedMessage,
    connection,
    historyLoaded,
    nextCursor,
    loadingOlder,
    error,
    send,
    checkStatus,
    loadOlder,
  };
}
