'use client';

import { useEffect, useRef, useState } from 'react';
import { z } from 'zod';
import { Field, FormMessage, inputClass } from '../../../components/ui/form-controls';
import { LocalTime } from '../../../components/ui/local-time';
import { guildRequest } from '../client-api';
import {
  baseDirectoryViewSchema,
  guildBaseEntrySchema,
  guildBaseMaps,
  guildBaseMapLabel,
  guildBasePurposes,
  guildBasePurposeLabel,
  filterGuildBases,
  type BaseDirectoryView,
  type BaseDirectoryInput,
  type GuildBaseDraft,
  type GuildBaseEntry,
} from '../base-directory';
import { BaseDirectoryForm } from './base-directory-form';

const changedView = z.object({ entry: guildBaseEntrySchema.nullable() });
export function GuildBaseDirectory({ guildId }: { guildId: string }) {
  const [view, setView] = useState<BaseDirectoryView | null>(null);
  const [verified, setVerified] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [query, setQuery] = useState('');
  const [map, setMap] = useState('');
  const [purpose, setPurpose] = useState('');
  const [status, setStatus] = useState<'active' | 'archived'>('active');
  const [editor, setEditor] = useState<{ draft: GuildBaseDraft; revision: string | null } | null>(null);
  const [confirmation, setConfirmation] = useState<{ input: BaseDirectoryInput; message: string } | null>(null);
  const pending = useRef(false);
  const url = `/api/v2/guilds/${encodeURIComponent(guildId)}/base-directory`;
  useEffect(() => {
    const controller = new AbortController();
    guildRequest(url, undefined, controller.signal)
      .then((value: unknown) => {
        if (!controller.signal.aborted) {
          setView(baseDirectoryViewSchema.parse(value));
          setVerified(true);
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) setError('The guild base directory could not be loaded. Refresh to try again.');
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
      const next = baseDirectoryViewSchema.parse(await guildRequest(url));
      setView(next);
      setVerified(true);
      setEditor((current) =>
        current
          ? {
              ...current,
              revision: next.entries.find((entry) => entry.id === current.draft.id)?.revision ?? current.revision,
            }
          : null,
      );
    } catch (reason) {
      setVerified(false);
      setError(reason instanceof Error ? reason.message : 'Unable to refresh the base directory.');
    } finally {
      pending.current = false;
      setLoading(false);
    }
  }
  async function mutate(input: BaseDirectoryInput) {
    if (pending.current || !verified) return;
    pending.current = true;
    setSaving(true);
    setError('');
    setMessage('');
    try {
      const { entry } = changedView.parse(await guildRequest(url, input));
      const id = input.action === 'save' ? input.entry.id : input.id;
      setView((current) =>
        current
          ? {
              ...current,
              entries: [...current.entries.filter((value) => value.id !== id), ...(entry ? [entry] : [])].sort(
                (a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id),
              ),
            }
          : null,
      );
      if (input.action === 'save' || (input.action === 'delete' && editor?.draft.id === id)) setEditor(null);
      if (entry) {
        setStatus(entry.status);
        setQuery('');
        setMap('');
        setPurpose('');
      }
      setConfirmation(null);
      setMessage(
        input.action === 'delete'
          ? 'Directory listing removed. The game base is unchanged.'
          : 'Guild base directory updated.',
      );
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to confirm the change. Refresh before trying again.');
    } finally {
      pending.current = false;
      setSaving(false);
    }
  }
  function create() {
    setEditor({
      revision: null,
      draft: {
        id: crypto.randomUUID(),
        name: '',
        map: 'hagga-basin',
        purpose: 'headquarters',
        location: '',
        contact: '',
        accessInstructions: '',
        notes: '',
      },
    });
  }
  function edit(entry: GuildBaseEntry) {
    setEditor({
      revision: entry.revision,
      draft: {
        id: entry.id,
        name: entry.name,
        map: entry.map,
        purpose: entry.purpose,
        location: entry.location,
        contact: entry.contact,
        accessInstructions: entry.accessInstructions,
        notes: entry.notes,
      },
    });
  }
  const entries = filterGuildBases(view?.entries ?? [], query, map, purpose, status);
  return (
    <section
      aria-label="Guild base directory"
      className="panel min-w-0 p-5 sm:p-6 [&_button]:max-w-full [&_button]:whitespace-normal [&_button:disabled]:opacity-50"
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-lg">Shared base directory</h2>
          <p className="mt-2 max-w-prose text-sm text-sand-400">
            Guild locations, purposes and contact details. These manually maintained listings do not grant in-game
            access.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <button type="button" disabled={loading || saving} className="btn btn-secondary" onClick={refresh}>
            Refresh directory
          </button>
          {view?.canEdit && verified && (
            <button
              type="button"
              disabled={loading || saving || Boolean(editor)}
              className="btn btn-primary"
              onClick={create}
            >
              New base listing
            </button>
          )}
        </div>
      </div>
      <div className="mt-4">
        <FormMessage error={error} status={message} />
      </div>
      {loading && (
        <p role="status" className="mt-4 text-sm text-sand-400">
          Loading base directory…
        </p>
      )}
      {editor && (
        <div hidden={!verified || !view?.canEdit}>
          <BaseDirectoryForm
            key={editor.draft.id}
            initial={editor.draft}
            busy={loading || saving || !verified || !view?.canEdit}
            onCancel={() => setEditor(null)}
            onSave={(entry) => mutate({ action: 'save', revision: editor.revision, entry })}
          />
        </div>
      )}
      {view && (
        <div hidden={!verified}>
          <div role="group" aria-label="Directory listing status" className="mt-6 flex flex-wrap gap-3">
            {(['active', 'archived'] as const).map((value) => (
              <button
                type="button"
                key={value}
                aria-pressed={status === value}
                onClick={() => setStatus(value)}
                className={`btn ${status === value ? 'btn-primary' : 'btn-secondary'}`}
              >
                {value === 'active' ? 'Active listings' : 'Archived listings'}
              </button>
            ))}
          </div>
          <div className="mt-5 grid min-w-0 grid-cols-1 gap-4 lg:grid-cols-3">
            <Field label="Search guild bases">
              <input
                type="search"
                maxLength={128}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                className={inputClass}
              />
            </Field>
            <Field label="Filter by map">
              <select value={map} onChange={(event) => setMap(event.target.value)} className={inputClass}>
                <option value="">All maps</option>
                {guildBaseMaps.map((value) => (
                  <option key={value} value={value}>
                    {guildBaseMapLabel[value]}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Filter by purpose">
              <select value={purpose} onChange={(event) => setPurpose(event.target.value)} className={inputClass}>
                <option value="">All purposes</option>
                {guildBasePurposes.map((value) => (
                  <option key={value} value={value}>
                    {guildBasePurposeLabel[value]}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <p className="mt-4 text-xs text-sand-500">
            Up to 50 listings. Inactive directories expire 90 days after their last update. Verify current details and
            permissions with the listed contact before visiting.
          </p>
          {confirmation && (
            <div role="region" aria-label="Confirm directory change" className="mt-5 border-l-2 border-spice-400 p-4">
              <p className="text-sm text-sand-200">{confirmation.message}</p>
              <div className="mt-3 flex flex-wrap gap-3">
                <button
                  type="button"
                  disabled={loading || saving}
                  className="btn btn-primary"
                  onClick={() => mutate(confirmation.input)}
                >
                  Confirm change
                </button>
                <button
                  type="button"
                  disabled={saving}
                  className="btn btn-secondary"
                  onClick={() => setConfirmation(null)}
                >
                  Keep listing
                </button>
              </div>
            </div>
          )}
          <p aria-live="polite" className="mt-5 text-sm text-sand-400">
            {entries.length} {status} {entries.length === 1 ? 'listing' : 'listings'}
          </p>
          {!entries.length && <p className="mt-3 text-sm text-sand-400">No listings match these filters.</p>}
          <ul aria-label="Guild base listings" className="mt-5 grid min-w-0 grid-cols-1 gap-5">
            {entries.map((entry) => (
              <li key={entry.id} className="min-w-0">
                <article aria-label={entry.name} className="min-w-0 border border-sand-200/20 p-4 sm:p-5">
                  <p className="font-mono text-xs uppercase tracking-wider text-spice-300">
                    {guildBaseMapLabel[entry.map]} · {guildBasePurposeLabel[entry.purpose]} · {entry.status}
                  </p>
                  <h3 className="mt-3 break-words text-base">{entry.name}</h3>
                  {entry.status === 'archived' && (
                    <p className="mt-3 text-sm text-sand-400">
                      Archived listing — these directions may be out of date.
                    </p>
                  )}
                  <dl className="mt-4 grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2">
                    <div className="min-w-0">
                      <dt className="text-xs text-sand-400">Location</dt>
                      <dd className="mt-2 break-words text-sm text-sand-200">{entry.location}</dd>
                    </div>
                    <div className="min-w-0">
                      <dt className="text-xs text-sand-400">Contact</dt>
                      <dd className="mt-2 break-words text-sm text-sand-200">{entry.contact}</dd>
                    </div>
                  </dl>
                  <h4 className="mt-5 text-xs">Access instructions</h4>
                  <p className="mt-2 whitespace-pre-wrap break-words text-sm text-sand-300">
                    {entry.accessInstructions}
                  </p>
                  {entry.notes && (
                    <p className="mt-4 whitespace-pre-wrap break-words text-sm text-sand-300">{entry.notes}</p>
                  )}
                  <p className="mt-4 break-words text-xs text-sand-500">
                    Updated by {entry.updatedByName} · <LocalTime value={entry.updatedAt} />
                  </p>
                  {view.canEdit && (
                    <div className="mt-5 flex flex-wrap gap-3">
                      <button
                        type="button"
                        disabled={loading || saving || Boolean(editor)}
                        className="btn btn-secondary"
                        onClick={() => edit(entry)}
                      >
                        Edit listing
                      </button>
                      <button
                        type="button"
                        disabled={loading || saving}
                        className="btn btn-secondary"
                        onClick={() =>
                          setConfirmation({
                            input: {
                              action: 'status',
                              id: entry.id,
                              revision: entry.revision,
                              status: entry.status === 'active' ? 'archived' : 'active',
                            },
                            message:
                              entry.status === 'active'
                                ? 'Archive this listing so members know it may be outdated?'
                                : 'Restore this listing as active? Verify its location and access instructions first.',
                          })
                        }
                      >
                        {entry.status === 'active' ? 'Archive listing' : 'Restore listing'}
                      </button>
                      <button
                        type="button"
                        disabled={loading || saving}
                        className="btn btn-secondary"
                        onClick={() =>
                          setConfirmation({
                            input: { action: 'delete', id: entry.id, revision: entry.revision },
                            message: 'Remove this directory listing? This does not delete or change the game base.',
                          })
                        }
                      >
                        Remove listing
                      </button>
                    </div>
                  )}
                </article>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
