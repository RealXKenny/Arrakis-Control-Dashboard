import { useEffect, useState } from 'react';
import { guildRequest } from '../client-api';
import type { GuildApplication } from '../applications';
import css from '../styles/requirements.module.css';

export default function GuildApplicationInbox({ guildId }: { guildId: string }) {
  const [entries, setEntries] = useState<GuildApplication[]>([]);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [reload, setReload] = useState(0);
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
      await guildRequest(url, { applicationId, status });
      setMessage(status === 'remove' ? 'Application removed.' : `Application ${status}.`);
      setReload(reload + 1);
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
        Review joining requests here. Accepting records your decision; invite accepted applicants in game. Remove old
        applications to free space in the inbox.
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
                  <dt>Play style</dt>
                  <dd>{entry.playStyle}</dd>
                  <dt>Time zone</dt>
                  <dd>{entry.timezone}</dd>
                  <dt>Availability</dt>
                  <dd>{entry.availability}</dd>
                  <dt>Experience</dt>
                  <dd>{entry.experience}</dd>
                  <dt>Why they want to join</dt>
                  <dd>{entry.message}</dd>
                </dl>
                <div className={css.actions}>
                  <button disabled={busy || entry.status === 'accepted'} onClick={() => review(entry.id, 'accepted')}>
                    Accept application
                  </button>
                  <button disabled={busy || entry.status === 'declined'} onClick={() => review(entry.id, 'declined')}>
                    Decline application
                  </button>
                  <button disabled={busy} onClick={() => review(entry.id, 'remove')}>
                    Remove application
                  </button>
                </div>
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
