'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Field, FormMessage, inputClass } from '../../../components/ui/form-controls';
import { LocalTime } from '../../../components/ui/local-time';
import { guildRequest } from '../client-api';
import { noticeboardViewSchema, type GuildNotice, type NoticeboardInput, type NoticeboardView } from '../noticeboard';

type PostDraft = Pick<GuildNotice, 'id' | 'title' | 'body' | 'pinned'>;

/** Member-only notices; the API independently verifies membership and leader permissions on every request. */
export function GuildNoticeboard({ guildId }: { guildId: string }) {
  const [view, setView] = useState<NoticeboardView | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [message, setMessage] = useState('');
  const [priorities, setPriorities] = useState('');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [draft, setDraft] = useState<PostDraft | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const pending = useRef(false);
  const url = `/api/v2/guilds/${encodeURIComponent(guildId)}/noticeboard`;

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    guildRequest(url, undefined, controller.signal)
      .then((value: unknown) => {
        const next = noticeboardViewSchema.parse(value);
        if (controller.signal.aborted) return;
        setView(next);
        setMessage(next.board.message);
        setPriorities(next.board.priorities);
      })
      .catch(() => {
        if (!controller.signal.aborted) setError('The guild noticeboard could not be loaded. Refresh to try again.');
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
    setStatus('');
    try {
      const next = noticeboardViewSchema.parse(await guildRequest(url));
      setView(next);
      // Refresh updates the revision, but never discards a leader's unsaved draft.
      if (!settingsOpen) {
        setMessage(next.board.message);
        setPriorities(next.board.priorities);
      }
    } catch (reason) {
      setView(null);
      setError(reason instanceof Error ? reason.message : 'Unable to refresh the noticeboard.');
    } finally {
      pending.current = false;
      setLoading(false);
    }
  }

  async function save(input: NoticeboardInput) {
    if (pending.current) return;
    pending.current = true;
    setSaving(true);
    setError('');
    setStatus('');
    try {
      const next = noticeboardViewSchema.parse(await guildRequest(url, input));
      setView(next);
      if (input.action === 'save-post') setDraft(null);
      if (input.action === 'delete-post') setDeleting(null);
      if (input.action === 'settings') setSettingsOpen(false);
      if (input.action === 'settings' || !settingsOpen) {
        setMessage(next.board.message);
        setPriorities(next.board.priorities);
      }
      setStatus('Guild noticeboard updated.');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to save. Your draft has been kept.');
    } finally {
      pending.current = false;
      setSaving(false);
    }
  }

  function saveSettings(event: FormEvent) {
    event.preventDefault();
    if (view) void save({ action: 'settings', revision: view.board.revision, message, priorities });
  }
  function savePost(event: FormEvent) {
    event.preventDefault();
    if (view && draft) void save({ action: 'save-post', revision: view.board.revision, post: draft });
  }

  return (
    <section
      aria-label="Guild noticeboard"
      className="panel min-w-0 p-5 sm:p-6 [&_button]:max-w-full [&_button]:whitespace-normal"
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-lg">Guild noticeboard</h2>
          <p className="mt-2 text-sm text-sand-400">Announcements and priorities for current guild members.</p>
        </div>
        <button type="button" onClick={refresh} disabled={loading || saving} className="btn btn-secondary">
          Refresh noticeboard
        </button>
      </div>
      <div className="mt-4">
        <FormMessage error={error} status={status} />
      </div>
      {loading && (
        <p role="status" className="mt-4 text-sm text-sand-400">
          Loading noticeboard…
        </p>
      )}
      {view && (
        <>
          <div className="mt-6 grid min-w-0 grid-cols-1 gap-4 md:grid-cols-2">
            <div className="min-w-0 border-l-2 border-spice-500 bg-spice-500/5 p-4">
              <h3 className="text-xs">Message of the day</h3>
              <p className="mt-3 whitespace-pre-wrap break-words text-sm text-sand-200">
                {view.board.message || 'No daily message yet.'}
              </p>
            </div>
            <div className="min-w-0 border border-sand-200/15 p-4">
              <h3 className="text-xs">Guild priorities</h3>
              <p className="mt-3 whitespace-pre-wrap break-words text-sm text-sand-200">
                {view.board.priorities || 'No priorities posted yet.'}
              </p>
            </div>
          </div>
          {view.canEdit && (
            <div className="mt-5 flex flex-wrap gap-3">
              <button
                type="button"
                className="btn btn-secondary"
                disabled={saving || loading}
                onClick={() => setSettingsOpen(!settingsOpen)}
              >
                Edit message and priorities
              </button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={saving || loading}
                onClick={() => setDraft({ id: crypto.randomUUID(), title: '', body: '', pinned: false })}
              >
                New announcement
              </button>
            </div>
          )}
          {view.canEdit && settingsOpen && (
            <form aria-label="Noticeboard message and priorities" className="mt-5 grid gap-4" onSubmit={saveSettings}>
              <Field label="Message of the day" hint="Up to 1,000 characters. Stays until a leader changes it.">
                <textarea
                  rows={3}
                  maxLength={1000}
                  className={inputClass}
                  value={message}
                  onChange={(event) => setMessage(event.target.value)}
                />
              </Field>
              <Field label="Guild priorities">
                <textarea
                  rows={3}
                  maxLength={1000}
                  className={inputClass}
                  value={priorities}
                  onChange={(event) => setPriorities(event.target.value)}
                />
              </Field>
              <button className="btn btn-primary justify-self-start" disabled={saving || loading}>
                {saving ? 'Saving…' : 'Save message and priorities'}
              </button>
            </form>
          )}
          {view.canEdit && draft && (
            <form
              aria-label="Guild announcement"
              className="mt-6 grid gap-4 border border-sand-200/15 p-4"
              onSubmit={savePost}
            >
              <Field label="Announcement title">
                <input
                  required
                  maxLength={100}
                  className={inputClass}
                  value={draft.title}
                  onChange={(event) => setDraft({ ...draft, title: event.target.value })}
                />
              </Field>
              <Field label="Announcement text">
                <textarea
                  required
                  rows={5}
                  maxLength={3000}
                  className={inputClass}
                  value={draft.body}
                  onChange={(event) => setDraft({ ...draft, body: event.target.value })}
                />
              </Field>
              <label className="flex items-center gap-3 text-sm">
                <input
                  type="checkbox"
                  checked={draft.pinned}
                  onChange={(event) => setDraft({ ...draft, pinned: event.target.checked })}
                />
                Pin announcement
              </label>
              <div className="flex flex-wrap gap-3">
                <button className="btn btn-primary" disabled={saving || loading}>
                  {saving ? 'Saving…' : 'Save announcement'}
                </button>
                <button type="button" className="btn btn-secondary" disabled={saving} onClick={() => setDraft(null)}>
                  Cancel announcement
                </button>
              </div>
            </form>
          )}
          <p className="mt-6 text-xs text-sand-500">
            Up to 20 announcements, with 5 pinned. Noticeboards expire after 90 days without an update.
          </p>
          {!view.board.posts.length && <p className="mt-4 text-sm text-sand-400">No announcements yet.</p>}
          <ul className="mt-4 grid min-w-0 grid-cols-1 gap-4" aria-label="Guild announcements">
            {view.board.posts.map((post) => (
              <li key={post.id} className="min-w-0 border border-sand-200/15 p-4">
                {post.pinned && (
                  <p className="mb-2 font-mono text-xs uppercase tracking-wider text-spice-300">Pinned</p>
                )}
                <h3 className="break-words text-sm">{post.title}</h3>
                <p className="mt-3 whitespace-pre-wrap break-words text-sm text-sand-200">{post.body}</p>
                <p className="mt-4 break-words text-xs text-sand-500">
                  {post.authorName} · <LocalTime value={post.updatedAt} />
                </p>
                {view.canEdit && (
                  <div className="mt-4 flex flex-wrap gap-3">
                    <button
                      type="button"
                      className="btn btn-secondary"
                      disabled={saving || loading}
                      onClick={() => setDraft({ id: post.id, title: post.title, body: post.body, pinned: post.pinned })}
                      aria-label={`Edit ${post.title}`}
                    >
                      Edit announcement
                    </button>
                    {deleting === post.id ? (
                      <>
                        <button
                          type="button"
                          className="btn btn-secondary"
                          disabled={saving || loading}
                          onClick={() => save({ action: 'delete-post', revision: view.board.revision, id: post.id })}
                        >
                          Confirm removal
                        </button>
                        <button
                          type="button"
                          className="btn btn-secondary"
                          disabled={saving}
                          onClick={() => setDeleting(null)}
                        >
                          Keep announcement
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        className="btn btn-secondary"
                        disabled={saving || loading}
                        onClick={() => setDeleting(post.id)}
                        aria-label={`Remove ${post.title}`}
                      >
                        Remove announcement
                      </button>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
