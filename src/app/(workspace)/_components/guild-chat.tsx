'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { GuildRequestError, guildRequest } from '../../../modules/guilds/client-api';
import type { GuildChatMessage } from '../../../modules/guilds/applications';
import { FormMessage, inputClass } from './form-controls';

type Party = 'applicant' | 'reviewer';

export interface GuildChatProps {
  /** Conversation endpoint: GET lists messages, `/send` posts, `/read` acknowledges. */
  url: string;
  title: string;
  /** Explains who can read the conversation. */
  note: string;
  /** Shown beside each message: who a `reviewer` and an `applicant` are in this conversation. */
  roleLabels: Record<Party, string>;
  /** Acknowledge messages from this party as they scroll into view. Omit for no read receipts. */
  readFrom?: Party;
  onUnreadCount?: (count: number) => void;
  /** Support chat only: lets the unread badge elsewhere refresh at once. */
  support?: { guildId: string };
}

/**
 * Private two-party conversation. Polls while the tab is visible with exponential backoff, stops on
 * 401/403/404, and re-sends the same client message ID for an unchanged draft so retries never duplicate.
 */
export function GuildChat({ url, title, note, roleLabels, readFrom, onUnreadCount, support }: GuildChatProps) {
  const [messages, setMessages] = useState<GuildChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [fatal, setFatal] = useState(false);
  const [connectionError, setConnectionError] = useState('');
  const [sendError, setSendError] = useState('');
  const [reload, setReload] = useState(0);
  const revision = useRef(0);
  const unreadCallback = useRef(onUnreadCount);
  const acknowledged = useRef(new Set<string>());
  const pending = useRef<{ text: string; id: string } | null>(null);
  const sendController = useRef<AbortController | null>(null);
  const log = useRef<HTMLOListElement>(null);
  const follow = useRef(true);

  useEffect(() => {
    unreadCallback.current = onUnreadCount;
  }, [onUnreadCount]);
  useEffect(() => () => sendController.current?.abort(), []);

  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    let failures = 0;
    let polling = false;
    let stopped = false;
    setFatal(false);
    async function poll() {
      if (controller.signal.aborted || stopped || polling) return;
      clearTimeout(timer);
      if (!document.hidden) {
        polling = true;
        const version = ++revision.current;
        try {
          const data = await guildRequest(
            url,
            undefined,
            AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]),
          );
          if (!controller.signal.aborted && version === revision.current) {
            setMessages(data.messages);
            setConnectionError('');
            setLoading(false);
            failures = 0;
          }
        } catch (error) {
          if (!controller.signal.aborted) {
            failures++;
            const denied = error instanceof GuildRequestError && [401, 403, 404].includes(error.status);
            stopped = denied;
            setFatal(denied);
            setConnectionError(denied ? error.message : 'Chat connection lost. Reconnecting…');
            setLoading(false);
          }
        } finally {
          polling = false;
        }
      }
      if (!controller.signal.aborted && !stopped)
        timer = setTimeout(poll, Math.min(30_000, 2000 * 2 ** Math.min(failures, 4)));
    }
    const visible = () => {
      if (!document.hidden) void poll();
    };
    document.addEventListener('visibilitychange', visible);
    void poll();
    return () => {
      controller.abort();
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', visible);
    };
  }, [url, reload]);

  useEffect(() => {
    if (log.current && follow.current) log.current.scrollTop = log.current.scrollHeight;
  }, [messages]);

  useEffect(() => {
    if (!readFrom || !log.current) return;
    const controller = new AbortController();
    const element = log.current;
    let inView = false;
    let reading = false;
    async function read() {
      if (reading || !inView || document.hidden || !follow.current || controller.signal.aborted) return;
      const unread = messages.filter(
        (message) => message.role === readFrom && !acknowledged.current.has(`${message.senderId}:${message.id}`),
      );
      if (!unread.length) return;
      reading = true;
      try {
        const data = await guildRequest(
          `${url}/read`,
          { messages: unread.map(({ id, senderId }) => ({ id, senderId })) },
          AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]),
        );
        if (!controller.signal.aborted) {
          unread.forEach((message) => acknowledged.current.add(`${message.senderId}:${message.id}`));
          unreadCallback.current?.(data.unreadCount);
          if (support)
            window.dispatchEvent(
              new CustomEvent('guild-support-read', {
                detail: { guildId: support.guildId, admin: readFrom === 'applicant', unreadCount: data.unreadCount },
              }),
            );
        }
      } catch {
        /* A later chat poll retries the receipt. */
      } finally {
        reading = false;
      }
    }
    const observer = new IntersectionObserver((entries) => {
      inView = entries[0]?.isIntersecting ?? false;
      void read();
    });
    observer.observe(element);
    element.addEventListener('scroll', read);
    document.addEventListener('visibilitychange', read);
    return () => {
      controller.abort();
      observer.disconnect();
      element.removeEventListener('scroll', read);
      document.removeEventListener('visibilitychange', read);
    };
  }, [messages, readFrom, url, support]);

  async function send(event: FormEvent) {
    event.preventDefault();
    const text = draft.trim();
    if (!text || text.length > 1000 || sending) return;
    if (pending.current?.text !== text) pending.current = { text, id: crypto.randomUUID() };
    const clientMessageId = pending.current.id;
    setSending(true);
    setSendError('');
    const controller = new AbortController();
    sendController.current = controller;
    try {
      const message: GuildChatMessage = await guildRequest(
        `${url}/send`,
        { text, clientMessageId },
        AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]),
      );
      if (controller.signal.aborted) return;
      revision.current++;
      setMessages((current) =>
        current.some((item) => item.id === message.id && item.senderId === message.senderId)
          ? current
          : [...current, message].slice(-100),
      );
      setDraft('');
      pending.current = null;
      follow.current = true;
      setReload((value) => value + 1);
    } catch (error) {
      if (controller.signal.aborted) return;
      setSendError(
        error instanceof GuildRequestError
          ? error.message
          : 'Message could not be sent. Your draft is saved; try again.',
      );
      if (error instanceof GuildRequestError && [401, 403, 404].includes(error.status)) setFatal(true);
    } finally {
      if (!controller.signal.aborted) setSending(false);
    }
  }

  const state = loading ? 'Connecting…' : connectionError ? 'Disconnected' : 'Live · private conversation';

  return (
    <section aria-label={title} className="flex flex-col gap-3 border border-sand-200/15 bg-obsidian-900/60 p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h4 className="text-xs font-bold uppercase tracking-[0.2em] text-sand-50">{title}</h4>
        <span className="font-mono text-[0.6875rem] uppercase tracking-widest text-sand-500">{state}</span>
      </div>
      <p className="text-xs text-sand-500">{note}</p>
      {connectionError && (
        <p role="alert" className="text-sm text-status-danger">
          {connectionError}{' '}
          <button type="button" className="underline" onClick={() => setReload((value) => value + 1)}>
            Reconnect chat
          </button>
        </p>
      )}
      <ol
        ref={log}
        role="log"
        aria-label="Conversation messages"
        aria-live="polite"
        aria-relevant="additions"
        tabIndex={0}
        onScroll={() => {
          if (log.current)
            follow.current = log.current.scrollHeight - log.current.scrollTop - log.current.clientHeight < 40;
        }}
        className="flex max-h-80 min-h-24 flex-col gap-3 overflow-y-auto border border-sand-200/10 bg-obsidian-950 p-3"
      >
        {messages.map((message) => (
          <li key={`${message.senderId}:${message.id}`} className="text-sm">
            <p className="flex flex-wrap items-baseline gap-2">
              <strong className="text-sand-50">{message.senderName}</strong>
              <small className="font-mono text-[0.6875rem] uppercase tracking-widest text-sand-500">
                {roleLabels[message.role]} · {new Date(message.sentAt).toLocaleString()}
              </small>
            </p>
            <p className="mt-1 whitespace-pre-wrap break-words text-sand-200">{message.text}</p>
          </li>
        ))}
        {!loading && messages.length === 0 && !connectionError && (
          <li className="text-sm text-sand-500">No messages yet. Start the conversation below.</li>
        )}
      </ol>
      <FormMessage error={sendError} />
      <form onSubmit={send} className="flex flex-col gap-3">
        <label className="flex flex-col gap-2">
          <span className="font-mono text-[0.6875rem] uppercase tracking-widest text-sand-400">Message</span>
          <textarea
            required
            rows={3}
            maxLength={1000}
            value={draft}
            disabled={sending || fatal}
            onChange={(event) => setDraft(event.target.value)}
            className={inputClass}
          />
        </label>
        <button
          type="submit"
          disabled={sending || loading || fatal || !draft.trim()}
          className="btn btn-primary self-start disabled:opacity-50"
        >
          {sending ? 'Sending…' : 'Send message'}
        </button>
      </form>
    </section>
  );
}
