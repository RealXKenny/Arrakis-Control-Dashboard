import useSupportUnread from '../../guilds/hooks/useSupportUnread';
import UnreadBadge from '../../../components/UnreadBadge';
import { useEffect, useRef, useState } from 'react';
import type { AdminOperation } from '../types';
import { resultRows } from '../operation-fields';
import { guildRequest } from '../../guilds/client-api';
import type { GuildApplication, GuildChatMessage } from '../../guilds/applications';
import type { GuildRequirement } from '../../guilds/requirements';
import GuildApplicationChat from '../../guilds/components/GuildApplicationChat';
import AdminResults from './AdminResults';
import css from '../styles/admin.module.css';

async function execute(
  operation: string,
  path: Record<string, string>,
  query: Record<string, unknown>,
  signal: AbortSignal,
) {
  const response = await fetch('/api/admin/execute', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ operation, path, query }),
    signal,
  });
  const result = await response.json();
  if (!response.ok || !result.ok) throw new Error(result.error || 'Unable to load guild data.');
  return result.data;
}

export default function GuildOversight({
  operations,
  onSelect,
}: {
  operations: AdminOperation[];
  onSelect: (operation: AdminOperation, path: Record<string, string>) => void;
}) {
  const inspection = useRef<AbortController | null>(null);
  useEffect(() => () => inspection.current?.abort(), []);
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(0);
  const [guilds, setGuilds] = useState<Record<string, unknown>[]>([]);
  const [more, setMore] = useState(false);
  const [selected, setSelected] = useState<{ id: string; name: string } | null>(null);
  const [members, setMembers] = useState<unknown>();
  const [applications, setApplications] = useState<GuildApplication[]>([]);
  const [applicationPage, setApplicationPage] = useState(0);
  const [applicationMore, setApplicationMore] = useState(false);
  const [listing, setListing] = useState<GuildRequirement | null>(null);
  const [conversation, setConversation] = useState<{ name: string; messages: GuildChatMessage[] } | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [reload, setReload] = useState(0);
  const [chatOpen, setChatOpen] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    execute(
      'get-guilds',
      {},
      { q: query, page, pageSize: 20 },
      AbortSignal.any([controller.signal, AbortSignal.timeout(65000)]),
    )
      .then((data) => {
        if (!controller.signal.aborted) {
          const rows = resultRows(data) ?? [];
          setGuilds(rows);
          setMore(data?.hasMore ?? rows.length === 20);
        }
      })
      .catch((err) => {
        if (!controller.signal.aborted) setError(err.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [query, page, reload]);
  useEffect(() => {
    inspection.current?.abort();
    if (!selected) return;
    const controller = new AbortController();
    setMembers(undefined);
    setApplications([]);
    setListing(null);
    setConversation(null);
    setError('');
    setLoading(true);
    const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(65000)]);
    void Promise.allSettled([
      execute('get-guilds-guildid-members', { guildId: selected.id }, {}, signal),
      guildRequest(
        `/api/admin/guilds/${encodeURIComponent(selected.id)}/applications?page=${applicationPage}`,
        undefined,
        signal,
      ),
    ]).then(([roster, inbox]) => {
      if (controller.signal.aborted) return;
      if (roster.status === 'fulfilled') setMembers(roster.value);
      if (inbox.status === 'fulfilled') {
        setApplications(inbox.value.rows);
        setApplicationMore(inbox.value.hasMore);
        setListing(inbox.value.listing);
      }
      const failures = [roster, inbox].flatMap((result) =>
        result.status === 'rejected' ? [result.reason.message] : [],
      );
      setError(failures.join(' '));
      setLoading(false);
    });
    return () => controller.abort();
  }, [selected, applicationPage, reload]);
  const supportUnread = useSupportUnread({
    admin: true,
    guildIds: [
      ...new Set([
        ...(selected ? [selected.id] : []),
        ...guilds.map((guild) => String(guild.guild_id ?? guild.guildId ?? guild.id ?? '')).filter(Boolean),
      ]),
    ],
  });
  const membersOperation = operations.find((entry) => entry.id === 'get-guilds-guildid-members');
  return (
    <section className={css.oversight} aria-label="Guild oversight">
      <header className={css.directoryHeading}>
        <div>
          <h2>Guild oversight</h2>
          <p>Manage membership, inspect recruitment and application conversations, and contact guild leaders.</p>
        </div>
        <button disabled={loading} onClick={() => setReload(reload + 1)}>
          Refresh guild data
        </button>
      </header>
      <form
        className={css.actions}
        onSubmit={(event) => {
          event.preventDefault();
          setPage(0);
          setQuery(search);
        }}
      >
        <label className={css.field}>
          Search guilds
          <input value={search} onChange={(event) => setSearch(event.target.value)} />
        </label>
        <button type="submit">Search guilds</button>
      </form>
      {error && (
        <p role="alert" className={css.error}>
          {error}
        </p>
      )}
      {loading && <p role="status">Loading guild data…</p>}
      <div className={css.guildGrid}>
        {guilds.map((guild, index) => {
          const raw = guild.guild_id ?? guild.guildId ?? guild.id;
          if (typeof raw !== 'string' && !(typeof raw === 'number' && Number.isSafeInteger(raw))) return null;
          const id = String(raw);
          const name = String(guild.guild_name ?? guild.guildName ?? guild.name ?? id);
          return (
            <button
              key={`${id}-${index}`}
              aria-pressed={selected?.id === id}
              onClick={() => {
                setSelected({ id, name });
                setApplicationPage(0);
                setChatOpen(false);
              }}
            >
              <strong>
                {name} <UnreadBadge count={supportUnread.guilds[id] ?? 0} />
              </strong>
              <span>Guild {id}</span>
            </button>
          );
        })}
      </div>
      {!loading && !guilds.length && <p>No guilds found.</p>}
      <nav className={css.actions} aria-label="Admin guild pages">
        <button disabled={page === 0 || loading} onClick={() => setPage(page - 1)}>
          Previous guilds
        </button>
        <span>Page {page + 1}</span>
        <button disabled={!more || loading} onClick={() => setPage(page + 1)}>
          Next guilds
        </button>
      </nav>
      {selected && (
        <section className={css.guildDetail} aria-label={`Managing ${selected.name}`}>
          <h2>{selected.name}</h2>
          <div className={css.actions}>
            {['post-guilds-guildid-members', 'delete-guilds-guildid'].map((id) => {
              const operation = operations.find((entry) => entry.id === id);
              return operation ? (
                <button key={id} onClick={() => onSelect(operation, { guildId: selected.id })}>
                  {operation.title}
                </button>
              ) : null;
            })}
            <button onClick={() => setChatOpen(!chatOpen)} aria-expanded={chatOpen}>
              {chatOpen ? 'Close leader chat' : 'Message guild leader'}{' '}
              <UnreadBadge count={supportUnread.guilds[selected.id] ?? 0} />
            </button>
          </div>
          {chatOpen && (
            <GuildApplicationChat
              guildId={selected.id}
              markRead
              readRole="applicant"
              conversationUrl={`/api/admin/guilds/${encodeURIComponent(selected.id)}/messages`}
              title="Private chat with guild leader"
              support
            />
          )}
          <h3>Members</h3>
          {members !== undefined && membersOperation && (
            <AdminResults
              key={`${selected.id}-${reload}`}
              value={members}
              operation={membersOperation}
              operations={operations}
              path={{ guildId: selected.id }}
              busy={loading}
              onSelect={onSelect}
            />
          )}
          <h3>Recruitment</h3>
          <p>
            {listing
              ? `${listing.published ? 'Listed' : 'Unlisted'} · ${listing.requirements}`
              : 'No saved recruitment listing.'}
          </p>
          <h3>Applications</h3>
          <p>Conversation inspection is read-only. Opening a conversation does not mark applicant messages read.</p>
          {applications.map((application) => (
            <details key={application.id} className={css.applicationRecord}>
              <summary>
                {application.characterName} · {application.status}
              </summary>
              <p>
                {application.discordName} ({application.discordId})
              </p>
              <dl>
                {(['playStyle', 'timezone', 'availability', 'experience'] as const).map((name) =>
                  application[name] !== undefined ? (
                    <div key={name}>
                      <dt>{name}</dt>
                      <dd>{application[name]}</dd>
                    </div>
                  ) : null,
                )}
                {application.customAnswers?.map((answer) => (
                  <div key={answer.questionId}>
                    <dt>{answer.question}</dt>
                    <dd>{String(answer.answer)}</dd>
                  </div>
                ))}
              </dl>
              {application.message && <p>{application.message}</p>}
              <button
                onClick={async () => {
                  const guildId = selected.id;
                  inspection.current?.abort();
                  const controller = new AbortController();
                  inspection.current = controller;
                  try {
                    const data = await guildRequest(
                      `/api/admin/guilds/${encodeURIComponent(guildId)}/applications/${application.id}/messages`,
                      undefined,
                      AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]),
                    );
                    if (!controller.signal.aborted)
                      setConversation({ name: application.characterName, messages: data.messages });
                  } catch (err) {
                    if (!controller.signal.aborted)
                      setError(err instanceof Error ? err.message : 'Unable to load conversation.');
                  }
                }}
              >
                Inspect application chat
              </button>
            </details>
          ))}
          {!loading && !applications.length && <p>No applications on this page.</p>}
          <nav className={css.actions} aria-label="Admin application pages">
            <button disabled={!applicationPage || loading} onClick={() => setApplicationPage(applicationPage - 1)}>
              Previous applications
            </button>
            <span>Page {applicationPage + 1}</span>
            <button disabled={!applicationMore || loading} onClick={() => setApplicationPage(applicationPage + 1)}>
              Next applications
            </button>
          </nav>
          {conversation && (
            <section aria-label={`Application chat with ${conversation.name}`}>
              <h3>Application chat · {conversation.name}</h3>
              <button onClick={() => setConversation(null)}>Close conversation</button>
              {!conversation.messages.length && <p>No messages.</p>}
              <ol className={css.conversation}>
                {conversation.messages.map((message) => (
                  <li key={`${message.senderId}:${message.id}`}>
                    <strong>{message.senderName}</strong>
                    <small>
                      {' '}
                      · {message.role === 'reviewer' ? 'Reviewer' : 'Applicant'} ·{' '}
                      {new Date(message.sentAt).toLocaleString()}
                    </small>
                    <p>{message.text}</p>
                  </li>
                ))}
              </ol>
            </section>
          )}
        </section>
      )}
    </section>
  );
}
