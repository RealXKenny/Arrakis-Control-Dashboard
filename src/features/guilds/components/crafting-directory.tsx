'use client';
import { Button } from '../../../components/ui/button';

import { useState, type FormEvent } from 'react';
import { Field, FormMessage, inputClass } from '../../../components/ui/form-controls';
import { LocalTime } from '../../../components/ui/local-time';
import {
  CRAFT_CATEGORIES,
  SPECIALIST_AVAILABILITY,
  SPECIALIST_CAPABILITY_LIMIT,
  specialistDraftSchema,
} from '../projects';
import type { Mutate, WorkspaceView } from '../projects';

type Profile = {
  availability: (typeof SPECIALIST_AVAILABILITY)[number];
  note: string;
  capabilities: Array<{ id: string; category: (typeof CRAFT_CATEGORIES)[number]; items: string; note: string }>;
};
const label = (value: string) => value[0]!.toUpperCase() + value.slice(1);

/** N056: an opt-in directory. Members publish what they can craft; nothing is inferred from game data. */
export function CraftingDirectory({ view, busy, mutate }: { view: WorkspaceView; busy: boolean; mutate: Mutate }) {
  const own = view.specialists.find((entry) => entry.ownerKey === view.selfKey) ?? null;
  const [editing, setEditing] = useState(false);
  const [category, setCategory] = useState('');
  const [search, setSearch] = useState('');
  const shown = view.specialists.filter(
    (entry) =>
      (!category || entry.capabilities.some((item) => item.category === category)) &&
      `${entry.ownerName} ${entry.capabilities.map((item) => item.items).join(' ')}`
        .toLowerCase()
        .includes(search.trim().toLowerCase()),
  );
  return (
    <section aria-label="Crafting directory" className="mt-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h3 className="text-base">Crafting directory</h3>
          <p className="mt-2 max-w-prose text-sm text-sand-400">
            Members listed here chose to publish what they can craft. Listings are self-described and are not verified
            against game recipes.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Button type="button" className="btn btn-primary" disabled={busy || editing} onClick={() => setEditing(true)}>
            {own ? 'Edit my listing' : 'List my capabilities'}
          </Button>
          {own && (
            <Button
              type="button"
              className="btn btn-secondary"
              disabled={busy}
              onClick={() =>
                mutate(
                  { action: 'specialist-remove', memberKey: own.ownerKey, revision: own.revision },
                  'Your listing was removed.',
                )
              }
            >
              Remove my listing
            </Button>
          )}
        </div>
      </div>
      {editing && (
        <SpecialistForm
          initial={
            own
              ? { availability: own.availability, note: own.note, capabilities: own.capabilities }
              : {
                  availability: 'available',
                  note: '',
                  capabilities: [{ id: crypto.randomUUID(), category: 'weapons', items: '', note: '' }],
                }
          }
          busy={busy}
          onCancel={() => setEditing(false)}
          onSave={async (profile) => {
            if (
              await mutate(
                { action: 'specialist-save', revision: own?.revision ?? null, profile },
                'Your crafting listing is published to guild members.',
              )
            )
              setEditing(false);
          }}
        />
      )}
      <div className="mt-4 grid max-w-xl grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Category">
          <select value={category} onChange={(e) => setCategory(e.target.value)} className={inputClass}>
            <option value="">All categories</option>
            {CRAFT_CATEGORIES.map((value) => (
              <option key={value} value={value}>
                {label(value)}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Search">
          <input value={search} maxLength={100} onChange={(e) => setSearch(e.target.value)} className={inputClass} />
        </Field>
      </div>
      {shown.length === 0 && <p className="mt-4 text-sm text-sand-400">No matching crafters.</p>}
      <ul aria-label="Crafters" className="mt-4 grid gap-3">
        {shown.map((entry) => (
          <li key={entry.ownerKey} className="min-w-0 border border-sand-200/10 p-3 text-sm text-sand-200">
            <p className="break-words font-semibold text-sand-100">
              {entry.ownerName} <span className="font-normal text-sand-400">· {entry.availability}</span>
            </p>
            <ul className="mt-1 grid gap-1">
              {entry.capabilities.map((item) => (
                <li key={item.id} className="break-words text-xs text-sand-300">
                  {label(item.category)}: {item.items}
                  {item.note && ` (${item.note})`}
                </li>
              ))}
            </ul>
            {entry.note && <p className="mt-1 whitespace-pre-wrap break-words text-xs text-sand-400">{entry.note}</p>}
            <p className="mt-1 text-xs text-sand-500">
              Updated <LocalTime value={entry.updatedAt} />
            </p>
            {view.canEdit && entry.ownerKey !== view.selfKey && (
              <Button
                type="button"
                className="btn btn-secondary mt-2"
                disabled={busy}
                onClick={() =>
                  mutate(
                    { action: 'specialist-remove', memberKey: entry.ownerKey, revision: entry.revision },
                    'Listing removed.',
                  )
                }
              >
                Remove listing
              </Button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

function SpecialistForm({
  initial,
  busy,
  onSave,
  onCancel,
}: {
  initial: Profile;
  busy: boolean;
  onSave: (profile: Profile) => void;
  onCancel: () => void;
}) {
  const [profile, setProfile] = useState(initial);
  const [error, setError] = useState('');
  const setCapability = (index: number, patch: Partial<Profile['capabilities'][number]>) =>
    setProfile({
      ...profile,
      capabilities: profile.capabilities.map((item, at) => (at === index ? { ...item, ...patch } : item)),
    });
  function submit(event: FormEvent) {
    event.preventDefault();
    const parsed = specialistDraftSchema.safeParse(profile);
    if (!parsed.success) {
      setError('Describe at least one capability, keeping each field within its limit.');
      return;
    }
    setError('');
    onSave(parsed.data);
  }
  return (
    <form
      aria-label="Crafting listing"
      onSubmit={submit}
      className="mt-4 grid min-w-0 grid-cols-1 gap-3 border border-sand-200/20 p-4"
    >
      <FormMessage error={error} />
      <Field label="Availability">
        <select
          value={profile.availability}
          onChange={(e) => setProfile({ ...profile, availability: e.target.value as Profile['availability'] })}
          className={inputClass}
        >
          {SPECIALIST_AVAILABILITY.map((value) => (
            <option key={value} value={value}>
              {label(value)}
            </option>
          ))}
        </select>
      </Field>
      {profile.capabilities.map((item, index) => (
        <div
          key={item.id}
          role="group"
          aria-label={`Capability ${index + 1}`}
          className="grid min-w-0 grid-cols-1 gap-3 border-l-2 border-sand-200/20 pl-3 sm:grid-cols-3"
        >
          <Field label="Category">
            <select
              value={item.category}
              onChange={(e) =>
                setCapability(index, { category: e.target.value as Profile['capabilities'][number]['category'] })
              }
              className={inputClass}
            >
              {CRAFT_CATEGORIES.map((value) => (
                <option key={value} value={value}>
                  {label(value)}
                </option>
              ))}
            </select>
          </Field>
          <Field label="What you can craft">
            <input
              required
              maxLength={300}
              value={item.items}
              onChange={(e) => setCapability(index, { items: e.target.value })}
              className={inputClass}
            />
          </Field>
          <Field label="Grade or note">
            <input
              maxLength={200}
              value={item.note}
              onChange={(e) => setCapability(index, { note: e.target.value })}
              className={inputClass}
            />
          </Field>
          {profile.capabilities.length > 1 && (
            <div>
              <Button
                type="button"
                className="btn btn-secondary"
                onClick={() =>
                  setProfile({ ...profile, capabilities: profile.capabilities.filter((_, at) => at !== index) })
                }
              >
                Remove capability
              </Button>
            </div>
          )}
        </div>
      ))}
      <div>
        <Button
          type="button"
          className="btn btn-secondary"
          disabled={profile.capabilities.length >= SPECIALIST_CAPABILITY_LIMIT}
          onClick={() =>
            setProfile({
              ...profile,
              capabilities: [
                ...profile.capabilities,
                { id: crypto.randomUUID(), category: 'other', items: '', note: '' },
              ],
            })
          }
        >
          Add capability
        </Button>
      </div>
      <Field label="Note for requesters">
        <textarea
          rows={2}
          maxLength={500}
          value={profile.note}
          onChange={(e) => setProfile({ ...profile, note: e.target.value })}
          className={inputClass}
        />
      </Field>
      <div className="flex flex-wrap gap-3">
        <Button type="submit" className="btn btn-primary" disabled={busy}>
          Publish listing
        </Button>
        <Button type="button" className="btn btn-secondary" disabled={busy} onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
