'use client';

import { useState, type FormEvent } from 'react';
import { Field, FormMessage, inputClass } from '../../../components/ui/form-controls';
import { pollDraftSchema, type PollDraft } from '../polls';

export function PollForm({
  initial,
  busy,
  onSave,
  onCancel,
}: {
  initial: PollDraft;
  busy: boolean;
  onSave: (poll: PollDraft) => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState(initial);
  const [closesAt, setClosesAt] = useState(() => {
    const date = new Date(initial.closesAt);
    return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
  });
  const [error, setError] = useState('');
  function submit(event: FormEvent) {
    event.preventDefault();
    const date = new Date(closesAt);
    if (!Number.isFinite(date.getTime())) {
      setError('Choose a valid closing time.');
      return;
    }
    const parsed = pollDraftSchema.safeParse({ ...draft, closesAt: date.toISOString() });
    if (!parsed.success) {
      setError('Enter a question, 2–10 distinct choices and a valid closing time.');
      return;
    }
    setError('');
    onSave(parsed.data);
  }
  return (
    <form
      aria-label="Create guild poll"
      onSubmit={submit}
      className="mt-5 grid min-w-0 gap-4 border border-sand-200/20 p-4"
    >
      <h3 className="text-sm">New single-choice poll</h3>
      <FormMessage error={error} />
      <Field label="Poll question">
        <input
          required
          maxLength={200}
          value={draft.question}
          onChange={(event) => setDraft({ ...draft, question: event.target.value })}
          className={inputClass}
        />
      </Field>
      <Field label="Poll details">
        <textarea
          rows={4}
          maxLength={1500}
          value={draft.details}
          onChange={(event) => setDraft({ ...draft, details: event.target.value })}
          className={inputClass}
        />
      </Field>
      <Field label="Poll closing time">
        <input
          required
          type="datetime-local"
          value={closesAt}
          onChange={(event) => setClosesAt(event.target.value)}
          className={inputClass}
        />
      </Field>
      <p className="text-xs text-sand-400">
        Choose a future closing time within 90 days, in your device timezone. Published questions, choices and deadlines
        stay fixed. Members may change or withdraw votes until closing.
      </p>
      <ol aria-label="Poll choices" className="grid min-w-0 gap-4">
        {draft.options.map((option, index) => (
          <li key={option.id} className="min-w-0 border border-sand-200/20 p-3">
            <Field label={`Poll choice ${index + 1}`}>
              <input
                required
                maxLength={100}
                value={option.text}
                onChange={(event) =>
                  setDraft({
                    ...draft,
                    options: draft.options.map((value) =>
                      value.id === option.id ? { ...value, text: event.target.value } : value,
                    ),
                  })
                }
                className={inputClass}
              />
            </Field>
            {draft.options.length > 2 && (
              <button
                type="button"
                disabled={busy}
                className="btn btn-secondary mt-3"
                onClick={() => setDraft({ ...draft, options: draft.options.filter((value) => value.id !== option.id) })}
              >
                Remove choice {index + 1}
              </button>
            )}
          </li>
        ))}
      </ol>
      <button
        type="button"
        disabled={busy || draft.options.length >= 10}
        className="btn btn-secondary justify-self-start"
        onClick={() => setDraft({ ...draft, options: [...draft.options, { id: crypto.randomUUID(), text: '' }] })}
      >
        Add poll choice
      </button>
      <div className="flex flex-wrap gap-3">
        <button type="submit" disabled={busy} className="btn btn-primary">
          Publish poll
        </button>
        <button type="button" disabled={busy} className="btn btn-secondary" onClick={onCancel}>
          Cancel poll draft
        </button>
      </div>
    </form>
  );
}
