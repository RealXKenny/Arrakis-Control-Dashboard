'use client';

import { useState, type FormEvent } from 'react';
import { Field, FormMessage, inputClass } from '../../../components/ui/form-controls';
import {
  guildBaseDraftSchema,
  guildBaseMaps,
  guildBaseMapLabel,
  guildBasePurposes,
  guildBasePurposeLabel,
  type GuildBaseDraft,
} from '../base-directory';

export function BaseDirectoryForm({
  initial,
  busy,
  onSave,
  onCancel,
}: {
  initial: GuildBaseDraft;
  busy: boolean;
  onSave: (draft: GuildBaseDraft) => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState(initial);
  const [error, setError] = useState('');
  function submit(event: FormEvent) {
    event.preventDefault();
    const parsed = guildBaseDraftSchema.safeParse(draft);
    if (!parsed.success) {
      setError('Enter a base name, map, location, contact and access instructions within the field limits.');
      return;
    }
    setError('');
    onSave(parsed.data);
  }
  return (
    <form
      aria-label="Guild base listing"
      onSubmit={submit}
      className="mt-5 grid min-w-0 grid-cols-1 gap-4 border border-sand-200/20 p-4 sm:p-5"
    >
      <h3 className="text-sm">Guild base details</h3>
      <FormMessage error={error} />
      <Field label="Base name">
        <input
          required
          maxLength={100}
          value={draft.name}
          onChange={(event) => setDraft({ ...draft, name: event.target.value })}
          className={inputClass}
        />
      </Field>
      <div className="grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Map">
          <select
            value={draft.map}
            onChange={(event) => setDraft({ ...draft, map: event.target.value as GuildBaseDraft['map'] })}
            className={inputClass}
          >
            {guildBaseMaps.map((map) => (
              <option key={map} value={map}>
                {guildBaseMapLabel[map]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Purpose">
          <select
            value={draft.purpose}
            onChange={(event) => setDraft({ ...draft, purpose: event.target.value as GuildBaseDraft['purpose'] })}
            className={inputClass}
          >
            {guildBasePurposes.map((purpose) => (
              <option key={purpose} value={purpose}>
                {guildBasePurposeLabel[purpose]}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <Field label="Location or grid reference">
        <input
          required
          maxLength={250}
          value={draft.location}
          onChange={(event) => setDraft({ ...draft, location: event.target.value })}
          placeholder="Map grid, landmark or directions"
          className={inputClass}
        />
      </Field>
      <Field label="Contact person">
        <input
          required
          maxLength={200}
          value={draft.contact}
          onChange={(event) => setDraft({ ...draft, contact: event.target.value })}
          placeholder="Character name and how to reach them"
          className={inputClass}
        />
      </Field>
      <Field label="Access instructions">
        <textarea
          required
          rows={4}
          maxLength={1000}
          value={draft.accessInstructions}
          onChange={(event) => setDraft({ ...draft, accessInstructions: event.target.value })}
          className={inputClass}
        />
      </Field>
      <Field label="Directory notes">
        <textarea
          rows={4}
          maxLength={1500}
          value={draft.notes}
          onChange={(event) => setDraft({ ...draft, notes: event.target.value })}
          className={inputClass}
        />
      </Field>
      <p className="text-xs text-sand-400">
        These are manually recorded directions and contacts. A listing does not verify base ownership, publish a
        blueprint or grant in-game access.
      </p>
      <div className="flex flex-wrap gap-3">
        <button type="submit" disabled={busy} className="btn btn-primary">
          {busy ? 'Saving…' : 'Save base listing'}
        </button>
        <button type="button" disabled={busy} className="btn btn-secondary" onClick={onCancel}>
          Cancel editing
        </button>
      </div>
    </form>
  );
}
