'use client';

import { useState, type FormEvent } from 'react';
import { cleanQuestions } from '../../../../features/guilds/questions';
import { guildRequest } from '../../../../modules/guilds/client-api';
import { guildRequirementSchema, type GuildRequirement } from '../../../../modules/guilds/requirements';
import { CheckField, Field, FormMessage, inputClass } from '../../_components/form-controls';
import { QuestionEditor } from './question-editor';

/** Leader settings: requirements, contact details, publish/unlist and the question editor. */
export function SettingsForm({ guildId, initial }: { guildId: string; initial: GuildRequirement }) {
  const [form, setForm] = useState<GuildRequirement>(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');

  async function save(event: FormEvent) {
    event.preventDefault();
    const parsed = guildRequirementSchema.safeParse({
      ...form,
      ...(form.applicationQuestions ? { applicationQuestions: cleanQuestions(form.applicationQuestions) } : {}),
    });
    if (!parsed.success) {
      setError('Enter a guild name, joining requirements, and valid application questions.');
      setStatus('');
      return;
    }
    setSaving(true);
    setError('');
    setStatus('');
    try {
      const saved: GuildRequirement = await guildRequest(
        `/api/guilds/${encodeURIComponent(guildId)}/requirements`,
        parsed.data,
      );
      setForm(saved);
      setStatus(saved.published ? 'Guild requirements published.' : 'Settings saved. Your guild is not listed.');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to save guild settings.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={save} aria-label="Guild settings" className="panel flex flex-col gap-5 p-6">
      <div>
        <h2 className="text-sm uppercase tracking-[0.2em]">Guild settings</h2>
        <p className="mt-2 text-sm text-sand-400">
          Publish your guild’s joining requirements. Only the guild leader can edit these settings.
        </p>
      </div>
      <FormMessage error={error} status={status} />
      <Field label="Guild name">
        <input
          required
          maxLength={100}
          value={form.guildName}
          onChange={(event) => setForm({ ...form, guildName: event.target.value })}
          className={inputClass}
        />
      </Field>
      <Field label="Joining requirements">
        <textarea
          rows={7}
          maxLength={2000}
          required={form.published}
          value={form.requirements}
          placeholder="Play style, activity, language, experience, and any other requirements"
          onChange={(event) => setForm({ ...form, requirements: event.target.value })}
          className={inputClass}
        />
      </Field>
      <Field label="How to join">
        <input
          maxLength={200}
          value={form.contact}
          placeholder="Who to contact in game or on Discord"
          onChange={(event) => setForm({ ...form, contact: event.target.value })}
          className={inputClass}
        />
      </Field>
      <CheckField
        label="List my guild for recruitment"
        checked={form.published}
        onChange={(published) => setForm({ ...form, published })}
      />
      <QuestionEditor
        questions={form.applicationQuestions ?? []}
        onChange={(applicationQuestions) => setForm({ ...form, applicationQuestions })}
      />
      <button type="submit" disabled={saving} className="btn btn-primary self-start disabled:opacity-50">
        {saving ? 'Saving…' : 'Save guild settings'}
      </button>
    </form>
  );
}
