'use client';

import { useState, type FormEvent } from 'react';
import { Field, FormMessage, inputClass } from '../../../components/ui/form-controls';
import { onboardingGuideSchema, type OnboardingGuide } from '../onboarding';

export function OnboardingGuideForm({
  initial,
  busy,
  onSave,
  onCancel,
}: {
  initial: OnboardingGuide;
  busy: boolean;
  onSave: (guide: OnboardingGuide) => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState(initial);
  const [error, setError] = useState('');
  function submit(event: FormEvent) {
    event.preventDefault();
    const parsed = onboardingGuideSchema.safeParse(draft);
    if (!parsed.success) {
      setError('Check the field limits and enter text for every checklist item.');
      return;
    }
    setError('');
    onSave(parsed.data);
  }
  return (
    <form
      aria-label="Edit onboarding guide"
      onSubmit={submit}
      className="mt-5 grid min-w-0 gap-4 border border-sand-200/20 p-4"
    >
      <h3 className="text-sm">Welcome guide</h3>
      <FormMessage error={error} />
      <Field label="Welcome message">
        <textarea
          rows={4}
          maxLength={2000}
          value={draft.welcome}
          onChange={(event) => setDraft({ ...draft, welcome: event.target.value })}
          className={inputClass}
        />
      </Field>
      <Field label="Guild rules">
        <textarea
          rows={6}
          maxLength={4000}
          value={draft.rules}
          onChange={(event) => setDraft({ ...draft, rules: event.target.value })}
          className={inputClass}
        />
      </Field>
      <Field label="Useful locations">
        <textarea
          rows={4}
          maxLength={2000}
          value={draft.locations}
          onChange={(event) => setDraft({ ...draft, locations: event.target.value })}
          className={inputClass}
        />
      </Field>
      <p className="text-xs text-sand-400">
        Up to 20 checklist items. Editing an item&apos;s text clears its completion marks. Changing the rules requires
        everyone to acknowledge them again. Welcome and location edits preserve progress.
      </p>
      <ol aria-label="Edit welcome checklist" className="grid min-w-0 gap-4">
        {draft.steps.map((step, index) => (
          <li key={step.id} className="min-w-0 border border-sand-200/20 p-3">
            <Field label={`Checklist item ${index + 1}`}>
              <input
                required
                maxLength={200}
                value={step.text}
                onChange={(event) =>
                  setDraft({
                    ...draft,
                    steps: draft.steps.map((value) =>
                      value.id === step.id ? { ...value, text: event.target.value } : value,
                    ),
                  })
                }
                className={inputClass}
              />
            </Field>
            <button
              type="button"
              disabled={busy}
              onClick={() => setDraft({ ...draft, steps: draft.steps.filter((value) => value.id !== step.id) })}
              className="btn btn-secondary mt-3"
            >
              Remove checklist item {index + 1}
            </button>
          </li>
        ))}
      </ol>
      <button
        type="button"
        disabled={busy || draft.steps.length >= 20}
        className="btn btn-secondary justify-self-start"
        onClick={() => setDraft({ ...draft, steps: [...draft.steps, { id: crypto.randomUUID(), text: '' }] })}
      >
        Add checklist item
      </button>
      <div className="flex flex-wrap gap-3">
        <button type="submit" disabled={busy} className="btn btn-primary">
          Save onboarding guide
        </button>
        <button type="button" disabled={busy} className="btn btn-secondary" onClick={onCancel}>
          Cancel editing
        </button>
      </div>
    </form>
  );
}
