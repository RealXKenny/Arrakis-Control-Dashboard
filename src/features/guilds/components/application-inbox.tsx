'use client';

import { useEffect, useState } from 'react';
import { guildRequest } from '../client-api';
import type { GuildApplication } from '../applications';
import { FormMessage } from '../../../components/ui/form-controls';
import { GuildChat } from './guild-chat';
import { AnswerList } from './application-panel';

type Review = 'accepted' | 'declined' | 'remove';

const REVIEW_MESSAGES: Record<Review, string> = {
  remove: 'Application removed.',
  accepted: 'Application accepted. Applicant added to the guild as a Member.',
  declined: 'Application declined.',
};

function LegacyAnswers({ entry }: { entry: GuildApplication }) {
  // Older submissions keep their original standard answers for review.
  const rows: Array<[string, string | undefined]> = [
    ['Play style', entry.playStyle],
    ['Time zone', entry.timezone],
    ['Availability', entry.availability],
    ['Experience', entry.experience],
    ['Why they want to join', entry.message],
  ];
  const present = rows.filter((row): row is [string, string] => row[1] !== undefined);
  if (!present.length) return null;
  return (
    <dl className="grid gap-3 text-sm">
      {present.map(([term, value]) => (
        <div key={term}>
          <dt className="font-mono text-[0.6875rem] uppercase tracking-widest text-sand-500">{term}</dt>
          <dd className="mt-1 whitespace-pre-wrap break-words text-sand-100">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Pending, accepted and declined applications. Accepting is re-checked by the server (limits, faction, membership). */
export function ApplicationInbox({ guildId }: { guildId: string }) {
  const [entries, setEntries] = useState<GuildApplication[]>([]);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [reload, setReload] = useState(0);
  const [chat, setChat] = useState<string | null>(null);
  const url = `/api/guilds/${encodeURIComponent(guildId)}/applications`;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    void guildRequest(`${url}?page=${page}`)
      .then((data) => {
        if (cancelled) return;
        setEntries(data.rows);
        setHasMore(data.hasMore);
      })
      .catch((reason: Error) => {
        if (!cancelled) setError(reason.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [url, page, reload]);

  async function review(applicationId: string, next: Review) {
    setBusy(true);
    setError('');
    setStatus('');
    try {
      const updated = await guildRequest(url, { applicationId, status: next });
      setEntries((current) =>
        next === 'remove'
          ? current.filter((entry) => entry.id !== applicationId)
          : current.map((entry) => (entry.id === applicationId ? updated : entry)),
      );
      if (next === 'remove' && chat === applicationId) setChat(null);
      setStatus(REVIEW_MESSAGES[next]);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to review application.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-label="Guild applications" className="panel flex flex-col gap-5 p-6">
      <div>
        <h2 className="text-sm uppercase tracking-[0.2em]">Applications</h2>
        <p className="mt-2 max-w-prose text-sm text-sand-400">
          Review joining requests here. Accepting adds the applicant’s verified linked character to the guild as a
          Member. The server checks member limits, faction compatibility, and existing membership. Remove old
          applications to free space in the inbox.
        </p>
      </div>
      <button
        type="button"
        className="btn btn-ghost self-start disabled:opacity-50"
        onClick={() => setReload(reload + 1)}
        disabled={busy || loading}
      >
        Refresh applications
      </button>
      {loading && (
        <p role="status" className="text-sm text-sand-400">
          Loading applications…
        </p>
      )}
      <FormMessage error={error} status={status} />
      {!loading && !error && (
        <>
          {entries.length === 0 && <p className="text-sm text-sand-500">No applications on this page.</p>}
          <div className="grid gap-5 lg:grid-cols-2">
            {entries.map((entry) => (
              <article key={entry.id} className="flex flex-col gap-4 border border-sand-200/15 bg-obsidian-900/60 p-5">
                <header>
                  <h3 className="text-base tracking-wide">{entry.characterName}</h3>
                  <p className="mt-1 font-mono text-[0.6875rem] uppercase tracking-widest text-sand-500">
                    Discord: {entry.discordName} ({entry.discordId})
                  </p>
                  <p className="mt-1 font-mono text-[0.6875rem] uppercase tracking-widest text-sand-500">
                    <span className="text-spice-300">{entry.status}</span> ·{' '}
                    {new Date(entry.submittedAt).toLocaleString()}
                  </p>
                </header>
                <LegacyAnswers entry={entry} />
                {entry.customAnswers?.length ? <AnswerList answers={entry.customAnswers} /> : null}
                <div className="flex flex-wrap gap-3">
                  <button
                    type="button"
                    className="btn btn-primary disabled:opacity-50"
                    disabled={busy || entry.status === 'accepted'}
                    onClick={() => void review(entry.id, 'accepted')}
                  >
                    Accept application
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost disabled:opacity-50"
                    disabled={busy || entry.status === 'declined' || entry.status === 'accepted'}
                    onClick={() => void review(entry.id, 'declined')}
                  >
                    Decline application
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost disabled:opacity-50"
                    disabled={busy}
                    onClick={() => void review(entry.id, 'remove')}
                  >
                    Remove application
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost"
                    aria-expanded={chat === entry.id}
                    onClick={() => setChat(chat === entry.id ? null : entry.id)}
                  >
                    {chat === entry.id ? 'Close chat' : 'Chat with applicant'}
                  </button>
                </div>
                {chat === entry.id && (
                  <GuildChat
                    url={`${url}/${encodeURIComponent(entry.id)}/messages`}
                    title={`Chat with ${entry.characterName}`}
                    note="Administrators can review this application conversation."
                    roleLabels={{ applicant: 'Applicant', reviewer: 'Reviewer' }}
                  />
                )}
              </article>
            ))}
          </div>
          <nav aria-label="Application pages" className="flex items-center justify-center gap-4">
            <button
              type="button"
              className="btn btn-ghost disabled:opacity-40"
              disabled={page === 0 || busy}
              onClick={() => setPage(page - 1)}
            >
              Previous
            </button>
            <span className="font-mono text-xs uppercase tracking-widest text-sand-400">Page {page + 1}</span>
            <button
              type="button"
              className="btn btn-ghost disabled:opacity-40"
              disabled={!hasMore || busy}
              onClick={() => setPage(page + 1)}
            >
              Next
            </button>
          </nav>
        </>
      )}
    </section>
  );
}
