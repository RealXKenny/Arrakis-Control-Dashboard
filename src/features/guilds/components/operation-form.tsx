'use client';

import { useState, type FormEvent } from 'react';
import { Field, FormMessage, inputClass } from '../../../components/ui/form-controls';
import {
  operationDraftSchema,
  operationKinds,
  operationKindLabel,
  operationRoles,
  operationRoleLabel,
  operationLocalTime,
  type OperationDraft,
} from '../operations';

export function OperationForm({
  initial,
  busy,
  onSave,
  onCancel,
}: {
  initial: OperationDraft;
  busy: boolean;
  onSave: (draft: OperationDraft) => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState(initial);
  const [startsAt, setStartsAt] = useState(operationLocalTime(initial.startsAt));
  const [endsAt, setEndsAt] = useState(operationLocalTime(initial.endsAt));
  const [capacities, setCapacities] = useState(() =>
    Object.fromEntries(
      operationRoles.map((role) => [role, initial.roles.find((slot) => slot.role === role)?.capacity ?? 0]),
    ),
  );
  const [error, setError] = useState('');
  function submit(event: FormEvent) {
    event.preventDefault();
    const start = new Date(startsAt);
    const end = new Date(endsAt);
    if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime())) {
      setError('Choose valid start and end times.');
      return;
    }
    const input = operationDraftSchema.safeParse({
      ...draft,
      startsAt: start.toISOString(),
      endsAt: end.toISOString(),
      roles: operationRoles
        .filter((role) => capacities[role] > 0)
        .map((role) => ({ role, capacity: capacities[role] })),
    });
    if (!input.success) {
      setError('Enter a title, meeting point, valid times (up to 24 hours), and 1–50 role slots in total.');
      return;
    }
    setError('');
    onSave(input.data);
  }
  return (
    <form
      aria-label="Guild operation"
      onSubmit={submit}
      className="mt-6 grid min-w-0 grid-cols-1 gap-4 border border-sand-200/20 p-4 sm:p-6"
    >
      <h3 className="text-sm">Plan an operation</h3>
      <FormMessage error={error} />
      <Field label="Operation title">
        <input
          required
          maxLength={100}
          value={draft.title}
          onChange={(event) => setDraft({ ...draft, title: event.target.value })}
          className={inputClass}
        />
      </Field>
      <Field label="Operation type">
        <select
          value={draft.kind}
          onChange={(event) => setDraft({ ...draft, kind: event.target.value as OperationDraft['kind'] })}
          className={inputClass}
        >
          {operationKinds.map((kind) => (
            <option key={kind} value={kind}>
              {operationKindLabel[kind]}
            </option>
          ))}
        </select>
      </Field>
      <div className="grid min-w-0 grid-cols-1 gap-4 md:grid-cols-2">
        <Field label="Starts at">
          <input
            required
            type="datetime-local"
            value={startsAt}
            onChange={(event) => setStartsAt(event.target.value)}
            className={`${inputClass} min-w-0`}
          />
        </Field>
        <Field label="Ends at">
          <input
            required
            type="datetime-local"
            value={endsAt}
            onChange={(event) => setEndsAt(event.target.value)}
            className={`${inputClass} min-w-0`}
          />
        </Field>
      </div>
      <p className="text-xs text-sand-400">
        Times use your device timezone. Choose a future start within one year; operations can last up to 24 hours.
      </p>
      <Field label="Meeting point">
        <input
          required
          maxLength={200}
          value={draft.meetingPoint}
          onChange={(event) => setDraft({ ...draft, meetingPoint: event.target.value })}
          placeholder="Guild base, map region, or rally point"
          className={inputClass}
        />
      </Field>
      <Field label="Operation details">
        <textarea
          rows={4}
          maxLength={2000}
          value={draft.details}
          onChange={(event) => setDraft({ ...draft, details: event.target.value })}
          className={inputClass}
        />
      </Field>
      <fieldset className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <legend className="mb-3 text-sm font-bold text-sand-200">Role slots · up to 50 total</legend>
        {operationRoles.map((role) => (
          <Field key={role} label={`${operationRoleLabel[role]} slots`}>
            <input
              type="number"
              min={0}
              max={50}
              step={1}
              required
              value={capacities[role]}
              onChange={(event) => setCapacities({ ...capacities, [role]: Number(event.target.value) })}
              className={inputClass}
            />
          </Field>
        ))}
      </fieldset>
      <p className="text-xs text-sand-400">
        Zero disables a role. Editing keeps current sign-ups; tell members about changed times or meeting points.
        Occupied slots cannot be removed until members are reassigned or removed.
      </p>
      <div className="flex flex-wrap gap-3">
        <button type="submit" disabled={busy} className="btn btn-primary">
          {busy ? 'Saving…' : 'Save operation'}
        </button>
        <button type="button" disabled={busy} onClick={onCancel} className="btn btn-secondary">
          Cancel editing
        </button>
      </div>
    </form>
  );
}
