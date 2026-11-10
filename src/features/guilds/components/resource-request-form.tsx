'use client';

import { useState, type FormEvent } from 'react';
import { Field, FormMessage, inputClass } from '../../../components/ui/form-controls';
import { resourceDraftSchema, type ResourceDraft } from '../resource-requests';

export function ResourceRequestForm({
  initial,
  busy,
  materialLocked,
  onSave,
  onCancel,
}: {
  initial: ResourceDraft;
  busy: boolean;
  materialLocked: boolean;
  onSave: (draft: ResourceDraft) => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState(initial);
  const [error, setError] = useState('');
  function submit(event: FormEvent) {
    event.preventDefault();
    const parsed = resourceDraftSchema.safeParse(draft);
    if (!parsed.success) {
      setError('Enter a material, whole quantity, unit and drop-off point within the field limits.');
      return;
    }
    setError('');
    onSave(parsed.data);
  }
  return (
    <form
      aria-label="Guild resource request"
      onSubmit={submit}
      className="mt-5 grid min-w-0 grid-cols-1 gap-4 border border-sand-200/20 p-4 sm:p-5"
    >
      <h3 className="text-sm">Request resources</h3>
      <FormMessage error={error} />
      <Field label="Material">
        <input
          required
          maxLength={100}
          disabled={materialLocked}
          value={draft.material}
          onChange={(event) => setDraft({ ...draft, material: event.target.value })}
          className={inputClass}
        />
      </Field>
      <div className="grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Requested quantity" hint="Whole units, without commas; up to 18 digits.">
          <input
            required
            inputMode="numeric"
            pattern="[1-9][0-9]{0,17}"
            maxLength={18}
            value={draft.quantity}
            onChange={(event) => setDraft({ ...draft, quantity: event.target.value })}
            className={inputClass}
          />
        </Field>
        <Field label="Unit">
          <input
            required
            maxLength={30}
            disabled={materialLocked}
            value={draft.unit}
            onChange={(event) => setDraft({ ...draft, unit: event.target.value })}
            placeholder="items, ingots, litres"
            className={inputClass}
          />
        </Field>
      </div>
      <Field label="Drop-off point">
        <input
          required
          maxLength={200}
          value={draft.dropoff}
          onChange={(event) => setDraft({ ...draft, dropoff: event.target.value })}
          placeholder="Guild base and container, or contact instructions"
          className={inputClass}
        />
      </Field>
      <Field label="Request details">
        <textarea
          rows={4}
          maxLength={1500}
          value={draft.details}
          onChange={(event) => setDraft({ ...draft, details: event.target.value })}
          className={inputClass}
        />
      </Field>
      <Field label="Priority">
        <select
          value={draft.priority}
          onChange={(event) => setDraft({ ...draft, priority: event.target.value as ResourceDraft['priority'] })}
          className={inputClass}
        >
          <option value="normal">Normal</option>
          <option value="urgent">Urgent</option>
        </select>
      </Field>
      <p className="text-xs text-sand-400">
        Existing pledges lock the material and unit. The requested amount cannot fall below committed pledges. Resources
        are delivered in game; this form records coordination only.
      </p>
      <div className="flex flex-wrap gap-3">
        <button type="submit" className="btn btn-primary" disabled={busy}>
          {busy ? 'Saving…' : 'Save resource request'}
        </button>
        <button type="button" className="btn btn-secondary" disabled={busy} onClick={onCancel}>
          Cancel editing
        </button>
      </div>
    </form>
  );
}
