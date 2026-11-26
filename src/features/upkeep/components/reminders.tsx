'use client';
import { useState } from 'react';
import { Card } from '../../../components/ui/card';
import { Button } from '../../../components/ui/button';
import { Field, inputClass } from '../../../components/ui/form-controls';
import type { CareBase } from '../care';
import { UPKEEP_LIMITS, nextReminderDue, type Reminder } from '../model';
import type { useUpkeep } from './use-upkeep';

type State = ReturnType<typeof useUpkeep>;
const blank = () => ({ id: crypto.randomUUID(), title: '', baseId: '', everyDays: '7', firstDue: '', notes: '' });
const localInput = (iso: string) => {
  const date = new Date(iso);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
};

/** N027: personal recurring reminders. Completion is a dashboard note, never a game action. */
export function Reminders({ state, bases }: { state: State; bases: CareBase[] }) {
  const record = state.record!;
  const [draft, setDraft] = useState(blank);
  const [error, setError] = useState('');
  const names = new Map(bases.map((base) => [base.id, base.name]));
  const now = state.now;
  const sorted = [...record.reminders].sort((a, b) => Date.parse(nextReminderDue(a)) - Date.parse(nextReminderDue(b)));
  const edit = (reminder: Reminder) =>
    setDraft({
      id: reminder.id,
      title: reminder.title,
      baseId: reminder.baseId ?? '',
      everyDays: String(reminder.everyDays),
      firstDue: localInput(reminder.firstDueAt),
      notes: reminder.notes,
    });
  return (
    <>
      <Card as="section" className="panel mb-6 min-w-0 p-6" aria-labelledby="reminder-form-title">
        <h2 id="reminder-form-title" className="text-base">
          {record.reminders.some((entry) => entry.id === draft.id) ? 'Edit reminder' : 'New maintenance reminder'}
        </h2>
        <p className="mt-2 text-sm text-sand-400">
          Recurring personal reminders, such as refuelling or repairing walls. Marking one done records the time only.
        </p>
        <form
          className="mt-4 grid gap-4 sm:grid-cols-2"
          onSubmit={(event) => {
            event.preventDefault();
            const firstDue = Date.parse(draft.firstDue);
            if (!draft.title.trim() || !Number.isFinite(firstDue)) {
              setError('Enter a title and first due time.');
              return;
            }
            setError('');
            void state
              .save(
                {
                  action: 'reminder',
                  reminder: {
                    id: draft.id,
                    title: draft.title.trim().slice(0, 120),
                    baseId: draft.baseId || null,
                    everyDays: Number(draft.everyDays),
                    firstDueAt: new Date(firstDue).toISOString(),
                    notes: draft.notes.trim().slice(0, 500),
                  },
                },
                'Reminder saved.',
              )
              .then((ok) => ok && setDraft(blank()));
          }}
        >
          <Field label="Title">
            <input
              className={inputClass}
              maxLength={120}
              value={draft.title}
              onChange={(e) => setDraft({ ...draft, title: e.target.value })}
            />
          </Field>
          <Field label="Base (optional)">
            <select
              className={inputClass}
              value={draft.baseId}
              onChange={(e) => setDraft({ ...draft, baseId: e.target.value })}
            >
              <option value="">Not tied to a base</option>
              {bases.map((base) => (
                <option key={base.id} value={base.id}>
                  {base.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Repeat every (days)">
            <input
              className={inputClass}
              type="number"
              min={1}
              max={365}
              value={draft.everyDays}
              onChange={(e) => setDraft({ ...draft, everyDays: e.target.value })}
            />
          </Field>
          <Field label="First due">
            <input
              className={inputClass}
              type="datetime-local"
              value={draft.firstDue}
              onChange={(e) => setDraft({ ...draft, firstDue: e.target.value })}
            />
          </Field>
          <div className="sm:col-span-2">
            <Field label="Notes">
              <textarea
                className={inputClass}
                maxLength={500}
                rows={2}
                value={draft.notes}
                onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
              />
            </Field>
          </div>
          {error && (
            <p role="alert" className="text-sm text-status-danger sm:col-span-2">
              {error}
            </p>
          )}
          <div className="flex flex-wrap gap-3 sm:col-span-2">
            <Button
              type="submit"
              variant="primary"
              disabled={
                state.saving ||
                (record.reminders.length >= UPKEEP_LIMITS.reminders && !record.reminders.some((r) => r.id === draft.id))
              }
            >
              Save reminder
            </Button>
            <Button type="button" onClick={() => setDraft(blank())}>
              Clear form
            </Button>
          </div>
        </form>
      </Card>
      <ul className="grid gap-3" aria-label="Maintenance reminders">
        {!sorted.length && <li className="text-sm text-sand-400">No reminders yet.</li>}
        {sorted.map((reminder) => {
          const due = nextReminderDue(reminder);
          const overdue = Date.parse(due) <= now;
          return (
            <li
              key={reminder.id}
              className={`min-w-0 border border-l-4 border-sand-200/20 p-4 ${overdue ? 'border-l-status-warn' : 'border-l-ibad-400'}`}
            >
              <p className="break-words text-sm font-semibold">{reminder.title}</p>
              <p className="mt-1 text-sm text-sand-300">
                {overdue ? 'Due since' : 'Next due'} {new Date(due).toLocaleString()} · every {reminder.everyDays}{' '}
                day(s)
                {reminder.baseId &&
                  ` · ${names.get(reminder.baseId) ?? `base #${reminder.baseId} (not currently available)`}`}
              </p>
              {reminder.notes && (
                <p className="mt-1 whitespace-pre-wrap break-words text-sm text-sand-400">{reminder.notes}</p>
              )}
              <p className="mt-1 text-xs text-sand-500">
                {reminder.completions.length
                  ? `Last marked done ${new Date(reminder.completions.at(-1)!).toLocaleString()} (${reminder.completions.length} recorded).`
                  : 'Never marked done.'}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="primary"
                  disabled={state.saving}
                  onClick={() =>
                    void state.save({ action: 'reminder-complete', id: reminder.id }, 'Completion recorded.')
                  }
                >
                  Mark done
                </Button>
                <Button type="button" disabled={state.saving} onClick={() => edit(reminder)}>
                  Edit
                </Button>
                <Button
                  type="button"
                  variant="danger"
                  disabled={state.saving}
                  onClick={() => void state.save({ action: 'reminder-remove', id: reminder.id }, 'Reminder deleted.')}
                >
                  Delete
                </Button>
              </div>
            </li>
          );
        })}
      </ul>
    </>
  );
}
