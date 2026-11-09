'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import Link from 'next/link';
import {
  communityEventSchema,
  eventInputSchema,
  EVENT_STATUS_LABELS,
  type CommunityEvent,
  type EventInput,
} from '../../events/contracts';
import ConfirmDialog from './confirm-dialog';

const ENDPOINT = '/api/v2/admin/events';
const empty = (): EventInput => ({
  title: '',
  summary: '',
  description: '',
  rules: '',
  participation: '',
  prizeSolaris: 0,
  prizeItems: '',
  startsAt: null,
  endsAt: null,
  status: 'upcoming',
  visibility: 'draft',
  featured: false,
});
const field =
  'mt-2 min-h-11 w-full border border-sand-200/20 bg-obsidian-950 px-3 py-2 text-sm text-sand-100 focus:border-spice-400 focus:outline-none';
function localInput(value: string | null): string {
  if (!value) return '';
  const date = new Date(value);
  const pad = (number: number) => String(number).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function discordOutcome(value: unknown): string {
  const status = value && typeof value === 'object' && 'status' in value ? value.status : '';
  if (status === 'sent' || status === 'unchanged') return 'Discord announcement is up to date.';
  if (status === 'unconfigured') return 'Discord announcements are not configured yet.';
  if (status === 'unknown')
    return 'Discord confirmation is unknown. Check the channel; this message will not be posted again automatically.';
  return 'Discord announcement is pending. The dashboard will retry known failures automatically.';
}

export function EventsManager() {
  const [events, setEvents] = useState<CommunityEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState<EventInput>(empty);
  const [selected, setSelected] = useState<CommunityEvent | null>(null);
  const [deleting, setDeleting] = useState<CommunityEvent | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [discordConfigured, setDiscordConfigured] = useState(false);
  const creationId = useRef<string | null>(null);
  const request = useRef<AbortController | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    const controller = new AbortController();
    void fetch(ENDPOINT, { cache: 'no-store', signal: controller.signal })
      .then(async (response) => {
        const data: unknown = await response.json();
        if (!response.ok || !data || typeof data !== 'object' || !('events' in data) || !Array.isArray(data.events))
          throw new Error('Unable to load events. Refresh this page to try again.');
        const rows = data.events.map((value) => communityEventSchema.parse(value));
        if (mounted.current) {
          setEvents(rows);
          setDiscordConfigured('discordConfigured' in data && data.discordConfigured === true);
        }
      })
      .catch((failure) => {
        if (!controller.signal.aborted && mounted.current)
          setError(failure instanceof Error ? failure.message : 'Unable to load events.');
      })
      .finally(() => {
        if (mounted.current && !controller.signal.aborted) setLoading(false);
      });
    return () => {
      mounted.current = false;
      controller.abort();
      request.current?.abort();
    };
  }, []);

  const change = <K extends keyof EventInput>(key: K, value: EventInput[K]) =>
    setDraft((current) => ({ ...current, [key]: value }));
  const reset = () => {
    setSelected(null);
    setDraft(empty());
    creationId.current = null;
    setError('');
    setNotice('');
  };
  const edit = (event: CommunityEvent) => {
    setSelected(event);
    setDraft(eventInputSchema.parse(event));
    setError('');
    setNotice('');
  };
  async function write(method: string, body: unknown): Promise<Record<string, unknown>> {
    if (request.current) throw new Error('Another event change is still being saved.');
    const controller = new AbortController();
    request.current = controller;
    const timer = setTimeout(() => controller.abort(), 30_000);
    setBusy(true);
    try {
      const response = await fetch(ENDPOINT, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      const data: unknown = await response.json();
      if (!response.ok || !data || typeof data !== 'object')
        throw new Error(
          data && typeof data === 'object' && 'error' in data && typeof data.error === 'string'
            ? data.error
            : 'Unable to save the event.',
        );
      return data as Record<string, unknown>;
    } catch (failure) {
      if (controller.signal.aborted)
        throw new Error(
          'The save could not be confirmed. Refresh the event list before trying again; your draft has been kept.',
        );
      throw failure;
    } finally {
      clearTimeout(timer);
      request.current = null;
      if (mounted.current) setBusy(false);
    }
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    if (request.current) return;
    setError('');
    setNotice('');
    const input = eventInputSchema.safeParse(draft);
    if (!input.success) {
      setError(input.error.issues[0]?.message ?? 'Check the event details.');
      return;
    }
    creationId.current ??= crypto.randomUUID();
    try {
      const data = await write(selected ? 'PATCH' : 'POST', {
        ...input.data,
        id: selected?.id ?? creationId.current,
        revision: selected?.revision ?? 0,
      });
      const saved = communityEventSchema.parse(data.event);
      if (!mounted.current) return;
      setEvents((current) => [saved, ...current.filter((entry) => entry.id !== saved.id)]);
      setSelected(saved);
      setDraft(eventInputSchema.parse(saved));
      setNotice(
        saved.visibility === 'published'
          ? `Event published. Members can see it on Community events. ${discordOutcome(data.discord)}`
          : 'Draft saved. Only administrators can see it.',
      );
    } catch (failure) {
      if (mounted.current)
        setError(failure instanceof Error ? failure.message : 'Unable to save event. Your draft has been kept.');
    }
  }

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-xl text-sm leading-relaxed text-sand-400">
          Create announcements, set prizes and schedules, then publish when you’re ready. Drafts stay private.
        </p>
        <Link href="/events" className="btn btn-ghost">
          View community events
        </Link>
      </div>
      <p className="mb-5 text-xs text-sand-400">
        {discordConfigured
          ? 'Published events are announced automatically in Discord. Saving updates the same announcement.'
          : 'Discord announcements need DISCORD_BOT_TOKEN and COMMUNITY_EVENTS_CHANNEL_ID. Events can still be saved.'}
      </p>
      {notice && (
        <p role="status" className="mb-5 border border-status-ok/25 bg-status-ok/5 p-4 text-sm text-sand-200">
          {notice}
        </p>
      )}
      {error && (
        <p role="alert" className="mb-5 border border-status-warn/25 bg-status-warn/5 p-4 text-sm text-sand-200">
          {error}
        </p>
      )}
      <div className="grid items-start gap-6 xl:grid-cols-[20rem_minmax(0,1fr)]">
        <aside className="panel p-4">
          <div className="mb-4 flex items-center justify-between gap-2">
            <h2 className="text-sm">Events</h2>
            <button type="button" className="btn btn-ghost min-h-10 text-xs" onClick={reset} disabled={busy}>
              New event
            </button>
          </div>
          {loading && (
            <p role="status" className="text-sm text-sand-500">
              Loading events…
            </p>
          )}
          <div className="space-y-2">
            {events.map((event) => (
              <button
                key={event.id}
                type="button"
                aria-pressed={selected?.id === event.id}
                onClick={() => edit(event)}
                disabled={busy}
                className={`w-full border p-3 text-left ${selected?.id === event.id ? 'border-spice-500/40 bg-spice-500/10' : 'border-sand-200/10 hover:border-sand-200/25'}`}
              >
                <span className="block text-sm font-bold text-sand-100 [overflow-wrap:anywhere]">{event.title}</span>
                <span className="mt-2 block font-mono text-[0.625rem] uppercase text-sand-500">
                  {event.visibility} / {EVENT_STATUS_LABELS[event.status]}
                </span>
              </button>
            ))}
          </div>
          {!loading && events.length === 0 && (
            <p className="text-sm text-sand-500">No events yet. Create your first event.</p>
          )}
        </aside>
        <form className="panel space-y-5 p-5 sm:p-7" onSubmit={(event) => void save(event)} aria-label="Event editor">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-base">{selected ? 'Edit event' : 'Create event'}</h2>
            {selected && (
              <button
                type="button"
                className="text-xs font-bold text-status-warn underline underline-offset-4"
                disabled={busy}
                onClick={() => setDeleting(selected)}
              >
                Delete event
              </button>
            )}
          </div>
          <fieldset disabled={busy || loading} className="space-y-5">
            <label className="block text-xs font-semibold text-sand-300">
              Event title
              <input
                required
                minLength={3}
                maxLength={120}
                aria-label="Event title"
                value={draft.title}
                onChange={(event) => change('title', event.target.value)}
                className={field}
              />
            </label>
            <label className="block text-xs font-semibold text-sand-300">
              Short description
              <textarea
                required
                minLength={10}
                maxLength={300}
                rows={2}
                aria-label="Short description"
                value={draft.summary}
                onChange={(event) => change('summary', event.target.value)}
                className={field}
              />
            </label>
            <label className="block text-xs font-semibold text-sand-300">
              Full description
              <textarea
                required
                minLength={10}
                maxLength={4000}
                rows={4}
                aria-label="Full description"
                value={draft.description}
                onChange={(event) => change('description', event.target.value)}
                className={field}
              />
            </label>
            <div className="grid gap-5 sm:grid-cols-2">
              <label className="block text-xs font-semibold text-sand-300">
                Solaris prize
                <input
                  type="number"
                  min={0}
                  max={1_000_000_000_000}
                  step={1}
                  required
                  aria-label="Solaris prize"
                  value={draft.prizeSolaris}
                  onChange={(event) => change('prizeSolaris', event.target.valueAsNumber)}
                  className={field}
                />
              </label>
              <label className="block text-xs font-semibold text-sand-300">
                Other prizes
                <textarea
                  maxLength={500}
                  rows={2}
                  aria-label="Other prizes"
                  value={draft.prizeItems}
                  onChange={(event) => change('prizeItems', event.target.value)}
                  className={field}
                />
              </label>
            </div>
            <div className="grid gap-5 sm:grid-cols-2">
              <label className="block text-xs font-semibold text-sand-300">
                How to enter
                <textarea
                  maxLength={2000}
                  rows={4}
                  aria-label="How to enter"
                  value={draft.participation}
                  onChange={(event) => change('participation', event.target.value)}
                  className={field}
                />
              </label>
              <label className="block text-xs font-semibold text-sand-300">
                Rules and judging
                <textarea
                  maxLength={4000}
                  rows={4}
                  aria-label="Rules and judging"
                  value={draft.rules}
                  onChange={(event) => change('rules', event.target.value)}
                  className={field}
                />
              </label>
            </div>
            <div className="grid gap-5 sm:grid-cols-2">
              {(['startsAt', 'endsAt'] as const).map((key) => (
                <label key={key} className="block text-xs font-semibold text-sand-300">
                  {key === 'startsAt' ? 'Starts' : 'Ends'} (your local time)
                  <input
                    type="datetime-local"
                    aria-label={key === 'startsAt' ? 'Starts (your local time)' : 'Ends (your local time)'}
                    value={localInput(draft[key])}
                    onChange={(event) =>
                      change(key, event.target.value ? new Date(event.target.value).toISOString() : null)
                    }
                    className={field}
                  />
                </label>
              ))}
            </div>
            <p className="text-xs text-sand-500">
              Dates are optional. Leave them empty to show “Schedule to be announced”. Viewers see scheduled times in
              their own timezone.
            </p>
            <div className="grid gap-5 sm:grid-cols-2">
              <label className="block text-xs font-semibold text-sand-300">
                Event status
                <select
                  aria-label="Event status"
                  value={draft.status}
                  onChange={(event) => change('status', event.target.value as EventInput['status'])}
                  className={field}
                >
                  {Object.entries(EVENT_STATUS_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-xs font-semibold text-sand-300">
                Visibility
                <select
                  aria-label="Visibility"
                  value={draft.visibility}
                  onChange={(event) => change('visibility', event.target.value as EventInput['visibility'])}
                  className={field}
                >
                  <option value="draft">Draft — administrators only</option>
                  <option value="published">Published — all members</option>
                </select>
              </label>
            </div>
            <label className="flex min-h-11 items-center gap-3 text-sm text-sand-300">
              <input
                type="checkbox"
                checked={draft.featured}
                onChange={(event) => change('featured', event.target.checked)}
              />
              Feature this event
            </label>
            <div className="flex flex-wrap items-center gap-4 border-t border-sand-200/10 pt-5">
              <button type="submit" className="btn btn-primary" disabled={busy}>
                {busy ? 'Saving…' : 'Save event'}
              </button>
              <p className="text-xs text-sand-500">
                Prize listings are announcements; awards are arranged by the organizers.
              </p>
            </div>
          </fieldset>
        </form>
      </div>
      {deleting && (
        <ConfirmDialog
          title="Delete community event"
          target={deleting.title}
          consequences={[
            'The event will be removed from the community page.',
            'This does not change any player inventory or Solaris balance.',
          ]}
          confirmLabel="Delete event"
          onCancel={() => setDeleting(null)}
          onConfirm={async () => {
            await write('DELETE', { id: deleting.id, revision: deleting.revision });
            if (!mounted.current) return;
            setEvents((current) => current.filter((event) => event.id !== deleting.id));
            setDeleting(null);
            reset();
            setNotice('Event deleted.');
          }}
        />
      )}
    </div>
  );
}
