'use client';

import { useLayoutEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import type { ChatMessage, ChatServer } from '../contracts';
import { isOptimisticChatMessage } from '../delivery';
import { useLiveChat, type ChatConnection } from '../hooks/use-live-chat';
import { ArrowRightIcon, BroadcastIcon, CloseIcon, DiscordIcon } from '../../../components/icons';
import { discordAvatarUrl } from '../../auth/identity';
import { AvatarImage } from '../../../components/ui/avatar-image';
import { isViewerChatMessage, type ChatViewer } from '../viewer';

const CONNECTION_LABELS: Record<ChatConnection, string> = {
  connecting: 'Connecting',
  live: 'Live',
  reconnecting: 'Reconnecting',
  offline: 'Offline',
};

function deliveryLabel(message: ChatMessage): string | null {
  if (message.source !== 'dashboard' || !message.delivery) return null;
  const labels = {
    pending: 'Sending',
    published: 'Sent',
    accepted: 'Sent',
    delivered: 'Delivered',
    failed: 'Not sent',
    unknown: 'Unconfirmed',
  };
  return labels[message.delivery];
}

function ChatMessageRow({
  message,
  own,
  ownAvatarUrl,
  onCheckStatus,
}: {
  message: ChatMessage;
  own: boolean;
  ownAvatarUrl: string | null;
  onCheckStatus: (message: ChatMessage) => void;
}) {
  const delivery = deliveryLabel(message);
  const avatarUrl = own
    ? (ownAvatarUrl ?? discordAvatarUrl(message.senderId ?? '', message.senderAvatar))
    : message.source === 'dashboard'
      ? discordAvatarUrl(message.senderId ?? '', message.senderAvatar)
      : null;
  const initials = message.senderName
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => [...part][0])
    .join('')
    .toLocaleUpperCase();
  const uncertain = message.delivery === 'failed' || message.delivery === 'unknown';
  return (
    <article
      className={`group flex items-start gap-2.5 px-4 py-3 sm:gap-3 sm:px-6 ${own ? '' : 'flex-row-reverse'}`}
      data-message-id={message.id}
      data-message-side={own ? 'left' : 'right'}
      data-message-own={own}
    >
      <div
        aria-hidden="true"
        className={`flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-full border font-mono text-xs font-bold sm:size-10 ${
          message.source === 'discord'
            ? 'border-[#5865F2]/40 bg-[#5865F2]/15 text-white'
            : message.source === 'dashboard'
              ? 'border-spice-500/30 bg-spice-500/10 text-spice-300'
              : 'border-sand-200/15 bg-sand-100/5 text-sand-300'
        }`}
      >
        <AvatarImage
          src={avatarUrl}
          width={40}
          height={40}
          className="size-full object-cover"
          fallback={message.source === 'discord' ? <DiscordIcon className="size-5" /> : initials}
        />
      </div>
      <div
        className={`flex min-w-0 max-w-[calc(100%-3rem)] flex-col sm:max-w-[75%] ${own ? 'items-start' : 'items-end'}`}
      >
        <div className={`flex max-w-full flex-wrap items-center gap-x-2.5 gap-y-1.5 ${own ? '' : 'justify-end'}`}>
          <span className="max-w-full text-sm font-bold text-sand-50 [overflow-wrap:anywhere]">
            {message.senderName}
          </span>
          <span
            className={`border px-1.5 py-0.5 font-mono text-[0.625rem] uppercase tracking-wider ${
              message.source === 'dashboard'
                ? 'border-spice-500/40 bg-spice-500/10 text-spice-300'
                : message.source === 'discord'
                  ? 'border-[#5865F2] bg-[#5865F2] text-white'
                  : 'border-sand-200/15 text-sand-400'
            }`}
          >
            {{ game: 'Game', discord: 'Discord', dashboard: 'Dashboard' }[message.source]}
          </span>
          <time
            className="font-mono text-[0.625rem] text-sand-500"
            dateTime={message.timestamp}
            title={new Date(message.timestamp).toLocaleString()}
          >
            {new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </time>
        </div>
        <div
          className={`mt-2 w-fit max-w-full rounded-xl border px-3.5 py-2.5 sm:px-4 sm:py-3 ${own ? 'rounded-tl-sm border-l-2' : 'rounded-tr-sm border-r-2'} ${
            message.source === 'discord'
              ? `border-sand-200/10 bg-[#5865F2]/5 ${own ? 'border-l-[#5865F2]' : 'border-r-[#5865F2]'}`
              : message.source === 'dashboard'
                ? own
                  ? 'border-spice-500/25 border-l-spice-500 bg-spice-500/10'
                  : 'border-spice-500/15 border-r-spice-500 bg-spice-500/5'
                : `border-sand-200/10 bg-obsidian-900/60 ${own ? 'border-l-sand-500' : 'border-r-sand-500'}`
          }`}
        >
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-sand-100 [overflow-wrap:anywhere]">
            {message.source === 'discord' ? (message.relayContent ?? message.content) : message.content}
          </p>
        </div>
        {delivery && (
          <div
            className={`mt-2 flex items-center gap-1.5 font-mono text-[0.625rem] ${uncertain ? 'text-status-warn' : 'text-sand-400'}`}
          >
            <span aria-hidden="true">{uncertain ? '!' : message.delivery === 'pending' ? '…' : '✓'}</span>
            <span
              title={message.delivery === 'published' ? 'Sent to chat. In-game display is not confirmed.' : undefined}
            >
              {delivery}
            </span>
          </div>
        )}
        {message.delivery === 'unknown' &&
          (isOptimisticChatMessage(message) ? (
            <div className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <p className="text-xs text-sand-500">The response was lost; the message may already have been sent.</p>
              <button
                type="button"
                className="text-xs font-bold text-spice-300 underline decoration-spice-500/50 underline-offset-4"
                onClick={() => onCheckStatus(message)}
              >
                Check status
              </button>
            </div>
          ) : (
            <p className="mt-1 text-xs text-sand-500">Check game chat before considering another send.</p>
          ))}
      </div>
    </article>
  );
}

function ChatConversation({
  server,
  maxChars,
  senderName,
  senderId,
  senderAvatarUrl,
  viewer,
}: {
  server: ChatServer;
  maxChars: number;
  senderName: string;
  senderId: string;
  senderAvatarUrl: string | null;
  viewer: ChatViewer;
}) {
  const {
    messages,
    failedMessages,
    dismissFailedMessage,
    connection,
    historyLoaded,
    nextCursor,
    loadingOlder,
    error,
    send,
    checkStatus,
    loadOlder,
  } = useLiveChat(server, senderName, senderId);
  const [draft, setDraft] = useState('');
  const [unread, setUnread] = useState(0);
  const timeline = useRef<HTMLDivElement>(null);
  const nearBottom = useRef(true);
  const previousIds = useRef(new Set<string>());
  const restoreScroll = useRef<{ height: number; top: number } | null>(null);
  const composer = useRef<HTMLTextAreaElement>(null);

  useLayoutEffect(() => {
    const element = timeline.current;
    if (!element) return;
    if (restoreScroll.current) {
      const previous = restoreScroll.current;
      element.scrollTop = previous.top + element.scrollHeight - previous.height;
      restoreScroll.current = null;
    } else if (nearBottom.current) {
      element.scrollTop = element.scrollHeight;
    } else {
      const additions = messages.filter((message) => !previousIds.current.has(message.id)).length;
      if (additions) setUnread((count) => count + additions);
    }
    previousIds.current = new Set(messages.map((message) => message.id));
  }, [messages]);

  const scrollToLatest = () => {
    timeline.current?.scrollTo({ top: timeline.current.scrollHeight });
    nearBottom.current = true;
    setUnread(0);
  };

  const submit = (event?: FormEvent) => {
    event?.preventDefault();
    if (!draft.trim() || [...draft.trim()].length > maxChars) return;
    const content = draft;
    setDraft('');
    void send(content);
  };

  const composerKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      submit();
    }
  };

  const loadHistory = async () => {
    if (timeline.current)
      restoreScroll.current = { height: timeline.current.scrollHeight, top: timeline.current.scrollTop };
    await loadOlder();
  };

  return (
    <section
      className="panel overflow-hidden border-t-2 border-t-spice-500"
      aria-label={`Live chat for ${server.label}`}
    >
      <header className="flex items-center justify-between gap-3 border-b border-sand-200/10 bg-obsidian-900/80 px-4 py-4 sm:px-6 sm:py-5">
        <div className="flex min-w-0 items-center gap-3">
          <span
            className="flex size-10 shrink-0 items-center justify-center border border-spice-500/25 bg-spice-500/10 text-spice-400"
            aria-hidden="true"
          >
            <BroadcastIcon className="size-5" />
          </span>
          <div className="min-w-0">
            <h2 className="truncate text-sm tracking-[0.12em] sm:text-base">{server.label}</h2>
            <p className="mt-1 text-xs text-sand-500">Public map channel</p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2 border border-sand-200/10 bg-obsidian-950/50 px-2.5 py-1.5 sm:px-3">
          <span className={`size-2 ${connection === 'live' ? 'bg-status-ok' : 'bg-status-warn'}`} aria-hidden="true" />
          <p className="font-mono text-[0.625rem] uppercase tracking-[0.12em] text-sand-300">
            {CONNECTION_LABELS[connection]}
          </p>
        </div>
      </header>

      {error && (
        <div
          role="alert"
          className="border-b border-status-warn/30 bg-status-warn/5 px-4 py-3 text-sm text-sand-200 sm:px-6"
        >
          {error}
        </div>
      )}

      <div className="relative">
        <div
          ref={timeline}
          role="log"
          aria-live="polite"
          aria-relevant="additions"
          aria-label="Chat messages"
          className="h-[56dvh] min-h-[20rem] overflow-y-auto overscroll-contain bg-obsidian-950/50 sm:min-h-[24rem]"
          onScroll={(event) => {
            const element = event.currentTarget;
            nearBottom.current = element.scrollHeight - element.scrollTop - element.clientHeight < 100;
            if (nearBottom.current) setUnread(0);
          }}
        >
          <div className="px-4 py-3 text-center sm:px-6">
            {nextCursor ? (
              <button
                type="button"
                className="btn btn-ghost min-h-9 text-[0.65rem]"
                onClick={() => void loadHistory()}
                disabled={loadingOlder}
              >
                {loadingOlder ? 'Loading history…' : 'Load older messages'}
              </button>
            ) : (
              <span className="font-mono text-[0.65rem] uppercase tracking-wider text-sand-600">
                You’re all caught up
              </span>
            )}
          </div>

          {!historyLoaded ? (
            <div className="space-y-5 p-6" aria-label="Loading chat history">
              {[72, 88, 64].map((width) => (
                <div key={width} className="animate-pulse">
                  <div className="h-3 w-32 bg-sand-200/10" />
                  <div className="mt-3 h-4 bg-sand-200/5" style={{ width: `${width}%` }} />
                </div>
              ))}
            </div>
          ) : messages.length === 0 ? (
            <div className="flex h-[75%] flex-col items-center justify-center px-6 text-center">
              <BroadcastIcon className="mb-4 size-8 text-spice-400" />
              <p className="text-sm font-bold uppercase tracking-[0.18em] text-sand-300">The channel is quiet</p>
              <p className="mt-2 max-w-md text-sm leading-relaxed text-sand-500">
                Start the conversation. Messages from the game, Discord, and your dashboard appear here together.
              </p>
            </div>
          ) : (
            <div className="pb-4">
              {messages.map((message, index) => {
                const previous = messages[index - 1];
                const day = new Date(message.timestamp).toDateString();
                const newDay = !previous || new Date(previous.timestamp).toDateString() !== day;
                return (
                  <div key={message.id}>
                    {newDay && (
                      <div className="flex items-center gap-3 px-4 py-4 font-mono text-[0.625rem] uppercase tracking-[0.12em] text-sand-500 sm:px-6">
                        <span className="h-px flex-1 bg-sand-200/10" aria-hidden="true" />
                        <span>
                          {new Date(message.timestamp).toLocaleDateString([], {
                            weekday: 'long',
                            month: 'long',
                            day: 'numeric',
                          })}
                        </span>
                        <span className="h-px flex-1 bg-sand-200/10" aria-hidden="true" />
                      </div>
                    )}
                    <ChatMessageRow
                      message={message}
                      own={isViewerChatMessage(message, viewer)}
                      ownAvatarUrl={senderAvatarUrl}
                      onCheckStatus={(entry) => void checkStatus(entry)}
                    />
                  </div>
                );
              })}
            </div>
          )}
        </div>
        {unread > 0 && (
          <button
            type="button"
            className="btn absolute bottom-4 left-1/2 -translate-x-1/2 border border-spice-300 bg-spice-500 text-obsidian-950 shadow-[3px_3px_0_0_#8d370d] hover:bg-spice-400"
            onClick={scrollToLatest}
            aria-live="polite"
          >
            {unread} new {unread === 1 ? 'message' : 'messages'}
          </button>
        )}
      </div>

      {failedMessages.length > 0 && (
        <div className="space-y-2 border-t border-sand-200/10 bg-obsidian-900/60 p-4 sm:px-5">
          {failedMessages.map((message) => (
            <div
              key={message.id}
              role="alert"
              aria-label="Failed message"
              className="flex flex-wrap items-start gap-3 border border-status-warn/25 bg-status-warn/5 p-3"
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <p className="text-xs font-bold text-status-warn">Not sent</p>
                  <span className="text-[0.6875rem] text-sand-500">Only visible to you</span>
                </div>
                <p className="mt-1 text-xs leading-relaxed text-sand-300">{message.error}</p>
                <p className="mt-2 line-clamp-2 whitespace-pre-wrap border-l border-sand-200/15 pl-2 text-xs text-sand-400 [overflow-wrap:anywhere]">
                  {message.content}
                </p>
              </div>
              <button
                type="button"
                className="btn btn-ghost min-h-10 gap-2 px-3 text-[0.625rem]"
                onClick={() => dismissFailedMessage(message.id)}
              >
                <CloseIcon className="size-3" /> Dismiss message
              </button>
            </div>
          ))}
        </div>
      )}

      <form className="border-t border-sand-200/10 bg-obsidian-900/80 p-4 sm:p-5" onSubmit={submit}>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <p className="font-mono text-[0.625rem] uppercase tracking-[0.12em] text-sand-400">Join the conversation</p>
          <p className="text-xs text-sand-500">
            Posting as <span className="font-semibold text-sand-200">{senderName}</span>
          </p>
        </div>
        <label htmlFor="chat-message" className="sr-only">
          Message {server.label}
        </label>
        <div className="flex items-end gap-2 border border-sand-200/15 bg-obsidian-950/80 p-2 focus-within:border-spice-400 sm:gap-3">
          <textarea
            ref={composer}
            id="chat-message"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={composerKeyDown}
            rows={2}
            maxLength={maxChars}
            placeholder={`Message ${server.label}…`}
            aria-describedby="chat-composer-help"
            className="max-h-44 min-h-16 min-w-0 flex-1 resize-y bg-transparent px-2 py-2 text-sm leading-relaxed text-sand-100 placeholder:text-sand-600 focus:outline-none"
          />
          <button
            type="submit"
            className="btn min-h-11 shrink-0 gap-2 border border-spice-300 bg-spice-500 px-4 text-obsidian-950 shadow-[3px_3px_0_0_#8d370d] hover:bg-spice-400 disabled:border-sand-200/15 disabled:bg-sand-200/10 disabled:text-sand-600 disabled:shadow-none sm:px-6"
            disabled={!draft.trim()}
          >
            Send <ArrowRightIcon className="size-4" />
          </button>
        </div>
        <div id="chat-composer-help" className="mt-2 flex flex-wrap justify-between gap-2 text-xs text-sand-500">
          <span>
            <span className="hidden sm:inline">
              Enter to send · Shift+Enter for a new line<span className="mx-2 text-sand-600">/</span>
            </span>
            Visible in game as [Dashboard]
          </span>
          <span className="font-mono">
            {[...draft].length}/{maxChars}
          </span>
        </div>
      </form>
    </section>
  );
}

export function LiveChat({
  servers,
  maxChars,
  senderName,
  senderId,
  senderAvatarUrl = null,
  viewer,
}: {
  servers: readonly ChatServer[];
  maxChars: number;
  senderName: string;
  senderId: string;
  senderAvatarUrl?: string | null;
  viewer?: ChatViewer;
}) {
  const [serverId, setServerId] = useState(servers[0]?.id ?? '');
  const server = servers.find((entry) => entry.id === serverId) ?? servers[0];
  if (!server) return null;

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-4 border border-sand-200/10 bg-obsidian-900/40 p-4 sm:px-5">
        <div>
          <label htmlFor="chat-server" className="eyebrow text-spice-400">
            Game destination
          </label>
          <select
            id="chat-server"
            value={server.id}
            onChange={(event) => setServerId(event.target.value)}
            className="mt-2 min-h-11 w-full min-w-48 border border-sand-200/20 bg-obsidian-950 px-3 text-sm font-semibold text-sand-100 sm:w-64"
          >
            {servers.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.label}
              </option>
            ))}
          </select>
        </div>
        <div className="hidden text-right sm:block">
          <p className="font-mono text-[0.625rem] uppercase tracking-[0.16em] text-spice-400">
            One conversation. Across Arrakis.
          </p>
          <p className="mt-2 text-xs text-sand-500">
            Game <span className="mx-2 text-sand-600">/</span> Discord <span className="mx-2 text-sand-600">/</span>{' '}
            Dashboard
          </p>
        </div>
      </div>
      <ChatConversation
        key={server.id}
        server={server}
        maxChars={maxChars}
        senderName={senderName}
        senderId={senderId}
        senderAvatarUrl={senderAvatarUrl}
        viewer={viewer ?? { userId: senderId, names: [senderName] }}
      />
    </div>
  );
}
