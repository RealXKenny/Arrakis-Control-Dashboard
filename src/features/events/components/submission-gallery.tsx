'use client';

import Image from 'next/image';
import { useState, type FormEvent } from 'react';
import { Button } from '../../../components/ui/button';
import { Card } from '../../../components/ui/card';
import { LocalTime } from '../../../components/ui/local-time';
import { eventSubmissionViewSchema, type EventSubmissionView } from '../submissions';

export function SubmissionGallery({
  eventId,
  initial,
  canReview,
  submissionOpen,
}: {
  eventId: string;
  initial: EventSubmissionView[];
  canReview: boolean;
  submissionOpen: boolean;
}) {
  const [records, setRecords] = useState(initial);
  const [editing, setEditing] = useState<EventSubmissionView | null>(null);
  const [title, setTitle] = useState('');
  const [note, setNote] = useState('');
  const [formVersion, setFormVersion] = useState(0);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  function update(record: EventSubmissionView) {
    setRecords((current) => [...current.filter((item) => item.id !== record.id), record]);
  }
  async function response(response: Response) {
    const raw: unknown = await response.json();
    if (!response.ok) {
      const error = (raw as { error?: unknown })?.error;
      throw new Error(typeof error === 'string' ? error : 'The submission action failed.');
    }
    const parsed = eventSubmissionViewSchema.safeParse((raw as { submission?: unknown })?.submission);
    if (!parsed.success) throw new Error('The server returned an invalid submission. Refresh before trying again.');
    update(parsed.data);
    return parsed.data;
  }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setMessage('');
    try {
      const form = new FormData(event.currentTarget);
      const result = await fetch(`/api/v2/events/${encodeURIComponent(eventId)}/submissions`, {
        method: 'POST',
        body: form,
      });
      await response(result);
      setEditing(null);
      setTitle('');
      setNote('');
      setFormVersion((value) => value + 1);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'The submission could not be saved.');
    } finally {
      setBusy(false);
    }
  }
  async function action(record: EventSubmissionView, body: Record<string, unknown>) {
    if (busy) return;
    setBusy(true);
    setMessage('');
    try {
      const result = await fetch(
        `/api/v2/events/${encodeURIComponent(eventId)}/submissions/${encodeURIComponent(record.id)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        },
      );
      await response(result);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'The submission action failed.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      {message && (
        <p role="alert" className="mb-5 text-sm text-status-danger">
          {message}
        </p>
      )}
      {submissionOpen && (
        <Card
          as="section"
          className="panel mb-8 p-5"
          aria-label={editing ? 'Edit evidence submission' : 'New evidence submission'}
        >
          <h2 className="text-lg">{editing ? 'Edit your submission' : 'Submit evidence'}</h2>
          <p className="mt-2 text-sm text-sand-400">
            One entry per member. PNG, JPEG or WebP up to 700 KiB; the server validates and re-encodes a static image.
          </p>
          <form key={`${editing?.id ?? 'new'}:${formVersion}`} className="mt-4 grid gap-4" onSubmit={save}>
            {editing && <input type="hidden" name="id" value={editing.id} />}
            {editing?.revision && <input type="hidden" name="revision" value={editing.revision} />}
            <label className="text-sm">
              Submission title
              <input
                required
                minLength={3}
                maxLength={120}
                name="title"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                className="mt-1 min-h-11 w-full border border-sand-200/20 bg-obsidian-900 px-3"
              />
            </label>
            <label className="text-sm">
              Evidence notes
              <textarea
                required
                minLength={10}
                maxLength={2000}
                name="note"
                rows={4}
                value={note}
                onChange={(event) => setNote(event.target.value)}
                className="mt-1 w-full border border-sand-200/20 bg-obsidian-900 p-3"
              />
            </label>
            <label className="text-sm">
              {editing ? 'Replacement image (optional)' : 'Evidence image'}
              <input
                required={!editing}
                name="image"
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="mt-1 block w-full text-sm"
              />
            </label>
            <div className="flex flex-wrap gap-2">
              <Button type="submit" className="btn btn-primary min-h-11" disabled={busy}>
                {editing ? 'Save and resubmit for review' : 'Submit for review'}
              </Button>
              {editing && (
                <Button type="button" className="btn btn-secondary min-h-11" onClick={() => setEditing(null)}>
                  Stop editing
                </Button>
              )}
            </div>
          </form>
        </Card>
      )}
      {!submissionOpen && <p className="mb-6 text-sm text-sand-400">New submissions and edits are closed.</p>}
      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        {records.map((record) => (
          <Card key={record.id} className="panel overflow-hidden" aria-label={record.title}>
            <Image
              src={record.imageUrl}
              alt={`Evidence for ${record.title}`}
              width={640}
              height={360}
              unoptimized
              className="aspect-video w-full object-cover"
            />
            <div className="p-4 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-lg">{record.title}</h2>
                <span className="border border-sand-200/20 px-2 py-1 text-xs">{record.status}</span>
              </div>
              <p className="mt-2 text-sand-400">By {record.authorName}</p>
              <p className="mt-3 whitespace-pre-wrap break-words">{record.note}</p>
              <p className="mt-3 text-xs text-sand-500">
                Updated <LocalTime value={record.updatedAt} />
              </p>
              {record.result && <p className="mt-3 font-semibold text-spice-300">Confirmed result: {record.result}.</p>}
              {record.reviewNote && <p className="mt-3 text-sand-400">Reviewer note: {record.reviewNote}</p>}
              <div className="mt-4 flex flex-wrap gap-2">
                {submissionOpen && record.canEdit && record.revision && (
                  <Button
                    type="button"
                    className="btn btn-secondary min-h-11"
                    onClick={() => {
                      setEditing(record);
                      setTitle(record.title);
                      setNote(record.note);
                    }}
                  >
                    Edit submission
                  </Button>
                )}
                {submissionOpen && record.canWithdraw && record.revision && (
                  <Button
                    type="button"
                    className="btn btn-secondary min-h-11"
                    disabled={busy}
                    onClick={() => void action(record, { action: 'withdraw', revision: record.revision })}
                  >
                    Withdraw
                  </Button>
                )}
              </div>
              {canReview && record.revision && (
                <div className="mt-5 space-y-4 border-t border-sand-200/10 pt-4">
                  <form
                    onSubmit={(event) => {
                      event.preventDefault();
                      const data = new FormData(event.currentTarget);
                      void action(record, {
                        action: 'review',
                        revision: record.revision,
                        status: data.get('status'),
                        note: data.get('note'),
                      });
                    }}
                  >
                    <label className="block text-xs">
                      Review decision
                      <select
                        name="status"
                        defaultValue="approved"
                        className="mt-1 min-h-11 w-full bg-obsidian-900 px-2"
                      >
                        <option value="approved">Approve</option>
                        <option value="rejected">Reject</option>
                      </select>
                    </label>
                    <label className="mt-2 block text-xs">
                      Reviewer note
                      <textarea name="note" maxLength={1000} className="mt-1 w-full bg-obsidian-900 p-2" />
                    </label>
                    <Button type="submit" className="btn btn-secondary mt-2 min-h-11" disabled={busy}>
                      Confirm review
                    </Button>
                  </form>
                  {record.status === 'approved' && (
                    <form
                      onSubmit={(event) => {
                        event.preventDefault();
                        const data = new FormData(event.currentTarget);
                        void action(record, {
                          action: 'judge',
                          revision: record.revision,
                          result: data.get('result'),
                        });
                      }}
                    >
                      <label className="block text-xs">
                        Confirmed judging result
                        <select
                          name="result"
                          defaultValue="finalist"
                          className="mt-1 min-h-11 w-full bg-obsidian-900 px-2"
                        >
                          <option value="winner">Winner</option>
                          <option value="finalist">Finalist</option>
                          <option value="not-selected">Not selected</option>
                        </select>
                      </label>
                      <Button type="submit" className="btn btn-secondary mt-2 min-h-11" disabled={busy}>
                        Confirm judging result
                      </Button>
                    </form>
                  )}
                </div>
              )}
            </div>
          </Card>
        ))}
      </div>
      {!records.length && <p className="text-sm text-sand-400">No submissions are visible in this gallery.</p>}
    </>
  );
}
