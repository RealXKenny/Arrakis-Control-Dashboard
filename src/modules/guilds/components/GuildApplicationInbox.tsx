import { useEffect, useState } from 'react';
import { guildRequest } from '../client-api';
import type { GuildApplication } from '../applications';
import css from '../styles/requirements.module.css';
import GuildApplicationChat from './GuildApplicationChat';
import { formatGuildAnswer } from '../question-fields';

export default function GuildApplicationInbox({ guildId }: { guildId: string }) {
  const [entries, setEntries] = useState<GuildApplication[]>([]);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [reload, setReload] = useState(0);
  const [chatApplication, setChatApplication] = useState<string | null>(null);
  const url = `/api/guilds/${encodeURIComponent(guildId)}/applications`;
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    void guildRequest(`${url}?page=${page}`)
      .then((data) => {
        if (!cancelled) {
          setEntries(data.rows);
          setHasMore(data.hasMore);
        }
      })
      .catch((err) => {
        if (!cancelled) setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [url, page, reload]);

  async function review(applicationId: string, status: 'accepted' | 'declined' | 'remove') {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const updated = await guildRequest(url, { applicationId, status });
      setEntries((current) =>
        status === 'remove'
          ? current.filter((entry) => entry.id !== applicationId)
          : current.map((entry) => (entry.id === applicationId ? updated : entry)),
      );
      if (status === 'remove' && chatApplication === applicationId) setChatApplication(null);
      setMessage(
        status === 'remove'
          ? 'Application removed.'
          : status === 'accepted'
            ? 'Application accepted. Applicant added to the guild as a Member.'
            : 'Application declined.',
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to review application.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className={css.inbox} aria-label="Guild applications">
      <h3>Applications</h3>
      <p>
        Review joining requests here. Accepting adds the applicant’s verified linked character to the guild as a Member.
        The server checks member limits, faction compatibility, and existing membership. Remove old applications to free
        space in the inbox.
      </p>
      <button onClick={() => setReload(reload + 1)} disabled={busy || loading}>
        Refresh applications
      </button>
      {loading && <p role="status">Loading applications…</p>}
      {error && <p role="alert">{error}</p>}
      {message && <p role="status">{message}</p>}
      {!loading && !error && (
        <>
          {entries.length === 0 && <p>No applications on this page.</p>}
          <div className={css.cards}>
            {entries.map((entry) => (
              <article key={entry.id} className={css.card}>
                <h4>{entry.characterName}</h4>
                <p>
                  Discord: {entry.discordName} ({entry.discordId})
                </p>
                <p>
                  Status: {entry.status} · {new Date(entry.submittedAt).toLocaleString()}
                </p>
                <dl className={css.answers}>
                  {entry.playStyle !== undefined && (
                    <>
                      <dt>Play style</dt>
                      <dd>{entry.playStyle}</dd>
                    </>
                  )}
                  {entry.timezone !== undefined && (
                    <>
                      <dt>Time zone</dt>
                      <dd>{entry.timezone}</dd>
                    </>
                  )}
                  {entry.availability !== undefined && (
                    <>
                      <dt>Availability</dt>
                      <dd>{entry.availability}</dd>
                    </>
                  )}
                  {entry.experience !== undefined && (
                    <>
                      <dt>Experience</dt>
                      <dd>{entry.experience}</dd>
                    </>
                  )}
                  {entry.message !== undefined && (
                    <>
                      <dt>Why they want to join</dt>
                      <dd>{entry.message}</dd>
                    </>
                  )}
                  {entry.customAnswers?.map((answer) => (
                    <div key={answer.questionId}>
                      <dt>{answer.question}</dt>
                      <dd>{formatGuildAnswer(answer.answer)}</dd>
                    </div>
                  ))}
                </dl>
                <div className={css.actions}>
                  <button disabled={busy || entry.status === 'accepted'} onClick={() => review(entry.id, 'accepted')}>
                    Accept application
                  </button>
                  <button
                    disabled={busy || entry.status === 'declined' || entry.status === 'accepted'}
                    onClick={() => review(entry.id, 'declined')}
                  >
                    Decline application
                  </button>
                  <button disabled={busy} onClick={() => review(entry.id, 'remove')}>
                    Remove application
                  </button>
                  <button
                    type="button"
                    aria-expanded={chatApplication === entry.id}
                    onClick={() => setChatApplication(chatApplication === entry.id ? null : entry.id)}
                  >
                    {chatApplication === entry.id ? 'Close chat' : 'Chat with applicant'}
                  </button>
                </div>
                {chatApplication === entry.id && (
                  <GuildApplicationChat
                    guildId={guildId}
                    applicationId={entry.id}
                    title={`Chat with ${entry.characterName}`}
                  />
                )}
              </article>
            ))}
          </div>
          <nav className={css.paging} aria-label="Application pages">
            <button disabled={page === 0 || busy} onClick={() => setPage(page - 1)}>
              Previous
            </button>
            <span>Page {page + 1}</span>
            <button disabled={!hasMore || busy} onClick={() => setPage(page + 1)}>
              Next
            </button>
          </nav>
        </>
      )}
    </section>
  );
}
