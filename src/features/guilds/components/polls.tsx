'use client';

import { useEffect, useRef, useState } from 'react';
import { z } from 'zod';
import { FormMessage } from '../../../components/ui/form-controls';
import { LocalTime } from '../../../components/ui/local-time';
import { guildRequest } from '../client-api';
import { pollViewSchema, pollsViewSchema, type PollDraft, type PollInput, type PollsView } from '../polls';
import { PollForm } from './poll-form';

const changedView = z.object({ poll: pollViewSchema.nullable() });
export function GuildPolls({ guildId }: { guildId: string }) {
  const [view, setView] = useState<PollsView | null>(null);
  const [verified, setVerified] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [draft, setDraft] = useState<PollDraft | null>(null);
  const [closedOnly, setClosedOnly] = useState(false);
  const [confirmation, setConfirmation] = useState<PollInput | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const pending = useRef(false);
  const url = `/api/v2/guilds/${encodeURIComponent(guildId)}/polls`;
  useEffect(() => {
    const update = () => {
      if (document.visibilityState === 'visible') setNow(Date.now());
    };
    const timer = window.setInterval(update, 1000);
    document.addEventListener('visibilitychange', update);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', update);
    };
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    guildRequest(url, undefined, controller.signal)
      .then((value: unknown) => {
        if (controller.signal.aborted) return;
        setView(pollsViewSchema.parse(value));
        setVerified(true);
      })
      .catch(() => {
        if (!controller.signal.aborted) setError('Guild polls could not be loaded. Refresh to try again.');
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [url]);
  async function refresh() {
    if (pending.current) return;
    pending.current = true;
    setLoading(true);
    setError('');
    setMessage('');
    setConfirmation(null);
    try {
      setView(pollsViewSchema.parse(await guildRequest(url)));
      setVerified(true);
      setNow(Date.now());
    } catch (reason) {
      setVerified(false);
      setError(reason instanceof Error ? reason.message : 'Unable to verify current guild membership.');
    } finally {
      pending.current = false;
      setLoading(false);
    }
  }
  async function mutate(input: PollInput) {
    if (pending.current || !verified) return;
    pending.current = true;
    setSaving(true);
    setError('');
    setMessage('');
    try {
      const { poll } = changedView.parse(await guildRequest(url, input));
      const id = input.action === 'create' ? input.poll.id : input.id;
      setView((current) =>
        current
          ? {
              ...current,
              polls: [...current.polls.filter((value) => value.id !== id), ...(poll ? [poll] : [])].sort(
                (a, b) => a.closesAt.localeCompare(b.closesAt) || a.id.localeCompare(b.id),
              ),
            }
          : null,
      );
      if (input.action === 'create') {
        setDraft(null);
        setClosedOnly(false);
      }
      if (input.action === 'close') setClosedOnly(true);
      setConfirmation(null);
      setNow(Date.now());
      setMessage(input.action === 'delete' ? 'Guild poll removed.' : 'Guild poll updated.');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to confirm the change. Refresh before trying again.');
    } finally {
      pending.current = false;
      setSaving(false);
    }
  }
  function create() {
    setDraft({
      id: crypto.randomUUID(),
      question: '',
      details: '',
      closesAt: new Date(Date.now() + 86_400_000).toISOString(),
      options: [
        { id: crypto.randomUUID(), text: '' },
        { id: crypto.randomUUID(), text: '' },
      ],
    });
  }
  const busy = loading || saving || !verified;
  const polls = (view?.polls ?? []).filter((poll) => (poll.closed || Date.parse(poll.closesAt) <= now) === closedOnly);
  return (
    <section
      aria-label="Private guild polls"
      className="panel min-w-0 p-5 sm:p-6 [&_button]:max-w-full [&_button]:whitespace-normal [&_button]:[overflow-wrap:anywhere] [&_button:disabled]:opacity-50"
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-lg">Guild polls</h2>
          <p className="mt-2 max-w-prose text-sm text-sand-400">
            Choose times, projects and objectives together. One current vote per verified character.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <button type="button" disabled={loading || saving} className="btn btn-secondary" onClick={refresh}>
            Refresh polls
          </button>
          {view?.canEdit && verified && (
            <button type="button" disabled={busy || Boolean(draft)} className="btn btn-primary" onClick={create}>
              New guild poll
            </button>
          )}
        </div>
      </div>
      <div className="mt-4">
        <FormMessage error={error} status={message} />
      </div>
      {loading && (
        <p role="status" className="mt-4 text-sm text-sand-400">
          Loading guild polls…
        </p>
      )}
      {draft && (
        <div hidden={!verified || !view?.canEdit}>
          <PollForm
            initial={draft}
            busy={busy || !view?.canEdit}
            onCancel={() => setDraft(null)}
            onSave={(poll) => mutate({ action: 'create', poll })}
          />
        </div>
      )}
      {view && (
        <div hidden={!verified}>
          <div role="group" aria-label="Poll status" className="mt-6 flex flex-wrap gap-3">
            <button
              type="button"
              aria-pressed={!closedOnly}
              className={`btn ${closedOnly ? 'btn-secondary' : 'btn-primary'}`}
              onClick={() => setClosedOnly(false)}
            >
              Open polls
            </button>
            <button
              type="button"
              aria-pressed={closedOnly}
              className={`btn ${closedOnly ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setClosedOnly(true)}
            >
              Closed polls
            </button>
          </div>
          <p className="mt-4 text-xs text-sand-500">
            Live totals show choices, not voter identities. Your choice is stored privately on the server and is not a
            secret ballot. Departed members&apos; votes stay counted. Refresh for other members&apos; latest votes.
          </p>
          {confirmation && (
            <div role="region" aria-label="Confirm poll change" className="mt-5 border-l-2 border-spice-400 p-3">
              <p className="text-sm text-sand-300">
                {confirmation.action === 'delete'
                  ? 'Remove this poll and all its recorded votes?'
                  : 'Close voting now? This poll cannot be reopened.'}
              </p>
              <div className="mt-3 flex flex-wrap gap-3">
                <button type="button" disabled={busy} className="btn btn-primary" onClick={() => mutate(confirmation)}>
                  Confirm change
                </button>
                <button
                  type="button"
                  disabled={saving}
                  className="btn btn-secondary"
                  onClick={() => setConfirmation(null)}
                >
                  Keep poll unchanged
                </button>
              </div>
            </div>
          )}
          {!polls.length && <p className="mt-5 text-sm text-sand-400">No {closedOnly ? 'closed' : 'open'} polls.</p>}
          <ul aria-label="Guild poll list" className="mt-5 grid min-w-0 gap-5">
            {polls.map((poll) => (
              <li key={poll.id} className="min-w-0">
                <article aria-label={poll.question} className="min-w-0 border border-sand-200/20 p-4">
                  <p className="font-mono text-xs uppercase text-spice-300">
                    {closedOnly ? 'Closed' : 'Open'} · Single choice
                  </p>
                  <h3 className="mt-3 break-words text-base">{poll.question}</h3>
                  {poll.details && (
                    <p className="mt-3 whitespace-pre-wrap break-words text-sm text-sand-300">{poll.details}</p>
                  )}
                  <p className="mt-3 text-sm text-sand-400">
                    Scheduled close: <LocalTime value={poll.closesAt} />
                  </p>
                  <p className="mt-2 break-words text-xs text-sand-500">Published by {poll.organizerName}</p>
                  <p aria-live="polite" className="mt-4 text-sm text-sand-200">
                    {poll.totalVotes} {poll.totalVotes === 1 ? 'vote' : 'votes'} cast
                  </p>
                  <ul aria-label="Poll results" className="mt-4 grid min-w-0 gap-4">
                    {poll.options.map((option) => {
                      const count = poll.results.find((result) => result.optionId === option.id)?.count ?? 0;
                      return (
                        <li key={option.id} className="min-w-0 border-l border-spice-400/40 pl-3">
                          <p className="break-words text-sm text-sand-200">{option.text}</p>
                          <p className="mt-2 text-sm text-sand-400">
                            {count} {count === 1 ? 'vote' : 'votes'} ·{' '}
                            {poll.totalVotes ? Math.round((count / poll.totalVotes) * 100) : 0}%
                            {poll.ownOptionId === option.id ? ' · Your vote' : ''}
                          </p>
                          {!closedOnly && (
                            <button
                              type="button"
                              disabled={busy || poll.ownOptionId === option.id}
                              aria-pressed={poll.ownOptionId === option.id}
                              className="btn btn-secondary mt-3"
                              onClick={() =>
                                mutate({ action: 'vote', id: poll.id, revision: poll.revision, optionId: option.id })
                              }
                            >
                              Vote: {option.text}
                            </button>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                  {!closedOnly && poll.ownOptionId && (
                    <button
                      type="button"
                      disabled={busy}
                      className="btn btn-secondary mt-4"
                      onClick={() => mutate({ action: 'withdraw', id: poll.id, revision: poll.revision })}
                    >
                      Withdraw my vote
                    </button>
                  )}
                  {view.canEdit && (
                    <div className="mt-5 flex flex-wrap gap-3">
                      {!closedOnly && (
                        <button
                          type="button"
                          disabled={busy}
                          className="btn btn-secondary"
                          onClick={() => setConfirmation({ action: 'close', id: poll.id, revision: poll.revision })}
                        >
                          Close poll early
                        </button>
                      )}
                      <button
                        type="button"
                        disabled={busy}
                        className="btn btn-secondary"
                        onClick={() => setConfirmation({ action: 'delete', id: poll.id, revision: poll.revision })}
                      >
                        Remove poll
                      </button>
                    </div>
                  )}
                </article>
              </li>
            ))}
          </ul>
          <p className="mt-5 text-xs text-sand-500">
            Up to 20 polls and 500 voters each. Results remain available for at least 90 days after their scheduled
            close while retained. Polls do not automatically schedule operations, spend resources or send announcements.
          </p>
        </div>
      )}
    </section>
  );
}
