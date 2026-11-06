import { useEffect, useRef, useState } from 'react';
import { guildRequest, GuildRequestError } from '../client-api';
import type { GuildChatMessage } from '../applications';
import css from '../styles/requirements.module.css';

export default function GuildApplicationChat({
  guildId,
  applicationId,
  title,
}: {
  guildId: string;
  applicationId: string;
  title: string;
}) {
  const [messages, setMessages] = useState<GuildChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [fatal, setFatal] = useState(false);
  const [connectionError, setConnectionError] = useState('');
  const [sendError, setSendError] = useState('');
  const [reload, setReload] = useState(0);
  const revision = useRef(0);
  const pending = useRef<{ text: string; id: string } | null>(null);
  const sendController = useRef<AbortController | null>(null);
  const log = useRef<HTMLOListElement>(null);
  const follow = useRef(true);
  const url = `/api/guilds/${encodeURIComponent(guildId)}/applications/${encodeURIComponent(applicationId)}/messages`;
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

  async function send(event: React.FormEvent) {
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

  return (
    <section className={css.chat} aria-label={title}>
      <h4>{title}</h4>
      <p>{loading ? 'Connecting…' : connectionError ? 'Disconnected' : 'Live · private conversation'}</p>
      {connectionError && (
        <p role="alert">
          {connectionError}{' '}
          <button type="button" onClick={() => setReload((value) => value + 1)}>
            Reconnect chat
          </button>
        </p>
      )}
      <ol
        ref={log}
        className={css.chatMessages}
        role="log"
        aria-label="Conversation messages"
        aria-live="polite"
        aria-relevant="additions"
        onScroll={() => {
          if (log.current)
            follow.current = log.current.scrollHeight - log.current.scrollTop - log.current.clientHeight < 40;
        }}
      >
        {messages.map((message) => (
          <li key={`${message.senderId}:${message.id}`}>
            <strong>{message.senderName}</strong>{' '}
            <small>
              {message.role === 'reviewer' ? 'Reviewer' : 'Applicant'} · {new Date(message.sentAt).toLocaleString()}
            </small>
            <p>{message.text}</p>
          </li>
        ))}
      </ol>
      {!loading && messages.length === 0 && !connectionError && <p>No messages yet. Start the conversation below.</p>}
      {sendError && <p role="alert">{sendError}</p>}
      <form className={css.form} onSubmit={send}>
        <label>
          Message
          <textarea
            required
            rows={3}
            maxLength={1000}
            value={draft}
            disabled={sending || fatal}
            onChange={(event) => setDraft(event.target.value)}
          />
        </label>
        <button type="submit" disabled={sending || loading || fatal || !draft.trim()}>
          {sending ? 'Sending…' : 'Send message'}
        </button>
      </form>
    </section>
  );
}
