'use client';
import { Button } from '../../../components/ui/button';

import { useState, type FormEvent } from 'react';
import { Field, FormMessage, inputClass } from '../../../components/ui/form-controls';
import {
  PROJECT_MATERIAL_LIMIT,
  PROJECT_MILESTONE_LIMIT,
  PROJECT_STATUSES,
  projectDraftSchema,
  type ProjectDraft,
} from '../projects';

export type ProjectEditorDraft = { revision: string | null; project: ProjectDraft };
type Row<T> = T & { key: string };

function MemberSelect({
  label,
  value,
  roster,
  onChange,
}: {
  label: string;
  value: string | null;
  roster: Array<{ key: string; name: string }>;
  onChange: (value: string | null) => void;
}) {
  return (
    <Field label={label}>
      <select value={value ?? ''} onChange={(event) => onChange(event.target.value || null)} className={inputClass}>
        <option value="">Nobody yet</option>
        {roster.map((member) => (
          <option key={member.key} value={member.key}>
            {member.name}
          </option>
        ))}
      </select>
    </Field>
  );
}

/** N051 leader-only budget editor: materials, milestones and responsible members. */
export function ProjectEditor({
  initial,
  roster,
  busy,
  onSave,
  onCancel,
}: {
  initial: ProjectEditorDraft;
  roster: Array<{ key: string; name: string }>;
  busy: boolean;
  onSave: (draft: ProjectEditorDraft) => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState(initial.project);
  const [error, setError] = useState('');
  type Milestone = ProjectDraft['milestones'][number];
  type Material = ProjectDraft['materials'][number];
  const setMilestone = (index: number, patch: Partial<Milestone>) =>
    setDraft({
      ...draft,
      milestones: draft.milestones.map((entry, at) => (at === index ? { ...entry, ...patch } : entry)),
    });
  const setMaterial = (index: number, patch: Partial<Material>) =>
    setDraft({
      ...draft,
      materials: draft.materials.map((entry, at) => (at === index ? { ...entry, ...patch } : entry)),
    });
  function submit(event: FormEvent) {
    event.preventDefault();
    const parsed = projectDraftSchema.safeParse(draft);
    if (!parsed.success) {
      setError(
        'Name the project and give every material a name, unit and whole required quantity. Item IDs use letters, digits and . _ : / - only.',
      );
      return;
    }
    setError('');
    onSave({ revision: initial.revision, project: parsed.data });
  }
  const rows = <T,>(list: T[]): Array<Row<T>> => list.map((entry) => ({ ...entry, key: (entry as { id: string }).id }));

  return (
    <form
      aria-label="Guild project plan"
      onSubmit={submit}
      className="mt-5 grid min-w-0 grid-cols-1 gap-4 border border-sand-200/20 p-4 sm:p-5"
    >
      <h3 className="text-sm">{initial.revision ? 'Edit project' : 'New project'}</h3>
      <FormMessage error={error} />
      <div className="grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Project name">
          <input
            required
            maxLength={100}
            value={draft.name}
            onChange={(event) => setDraft({ ...draft, name: event.target.value })}
            className={inputClass}
          />
        </Field>
        <Field label="Status">
          <select
            value={draft.status}
            onChange={(event) => setDraft({ ...draft, status: event.target.value as ProjectDraft['status'] })}
            className={inputClass}
          >
            {PROJECT_STATUSES.map((status) => (
              <option key={status} value={status}>
                {status[0]!.toUpperCase() + status.slice(1)}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <Field label="Summary">
        <textarea
          rows={3}
          maxLength={1000}
          value={draft.summary}
          onChange={(event) => setDraft({ ...draft, summary: event.target.value })}
          className={inputClass}
        />
      </Field>

      <fieldset className="grid min-w-0 gap-3">
        <legend className="text-sm text-sand-200">Materials</legend>
        {rows(draft.materials).map((material, index) => (
          <div
            key={material.key}
            role="group"
            aria-label={`Material ${index + 1}`}
            className="grid min-w-0 grid-cols-1 gap-3 border-l-2 border-sand-200/20 pl-3 sm:grid-cols-3"
          >
            <Field label="Material">
              <input
                required
                maxLength={100}
                value={material.name}
                onChange={(event) => setMaterial(index, { name: event.target.value })}
                className={inputClass}
              />
            </Field>
            <Field label="Required" hint="Whole units, no commas.">
              <input
                required
                inputMode="numeric"
                pattern="[1-9][0-9]{0,17}"
                maxLength={18}
                value={material.required}
                onChange={(event) => setMaterial(index, { required: event.target.value })}
                className={inputClass}
              />
            </Field>
            <Field label="Unit">
              <input
                required
                maxLength={30}
                value={material.unit}
                onChange={(event) => setMaterial(index, { unit: event.target.value })}
                className={inputClass}
              />
            </Field>
            <Field label="Exchange item ID" hint="Optional. Enables observed market estimates.">
              <input
                maxLength={200}
                value={material.templateId ?? ''}
                onChange={(event) => setMaterial(index, { templateId: event.target.value.trim() || null })}
                className={inputClass}
              />
            </Field>
            <MemberSelect
              label="Responsible member"
              value={material.responsibleKey}
              roster={roster}
              onChange={(responsibleKey) => setMaterial(index, { responsibleKey })}
            />
            <div className="flex items-end">
              <Button
                type="button"
                className="btn btn-secondary"
                onClick={() => setDraft({ ...draft, materials: draft.materials.filter((_, at) => at !== index) })}
              >
                Remove material
              </Button>
            </div>
          </div>
        ))}
        <div>
          <Button
            type="button"
            className="btn btn-secondary"
            disabled={draft.materials.length >= PROJECT_MATERIAL_LIMIT}
            onClick={() =>
              setDraft({
                ...draft,
                materials: [
                  ...draft.materials,
                  {
                    id: crypto.randomUUID(),
                    name: '',
                    unit: 'items',
                    required: '1',
                    templateId: null,
                    responsibleKey: null,
                  },
                ],
              })
            }
          >
            Add material
          </Button>
        </div>
      </fieldset>

      <fieldset className="grid min-w-0 gap-3">
        <legend className="text-sm text-sand-200">Milestones</legend>
        {rows(draft.milestones).map((milestone, index) => (
          <div
            key={milestone.key}
            role="group"
            aria-label={`Milestone ${index + 1}`}
            className="grid min-w-0 grid-cols-1 gap-3 border-l-2 border-sand-200/20 pl-3 sm:grid-cols-3"
          >
            <Field label="Milestone">
              <input
                required
                maxLength={120}
                value={milestone.title}
                onChange={(event) => setMilestone(index, { title: event.target.value })}
                className={inputClass}
              />
            </Field>
            <Field label="Target date">
              <input
                type="date"
                value={milestone.due ?? ''}
                onChange={(event) => setMilestone(index, { due: event.target.value || null })}
                className={inputClass}
              />
            </Field>
            <MemberSelect
              label="Responsible member"
              value={milestone.responsibleKey}
              roster={roster}
              onChange={(responsibleKey) => setMilestone(index, { responsibleKey })}
            />
            <div>
              <Button
                type="button"
                className="btn btn-secondary"
                onClick={() => setDraft({ ...draft, milestones: draft.milestones.filter((_, at) => at !== index) })}
              >
                Remove milestone
              </Button>
            </div>
          </div>
        ))}
        <div>
          <Button
            type="button"
            className="btn btn-secondary"
            disabled={draft.milestones.length >= PROJECT_MILESTONE_LIMIT}
            onClick={() =>
              setDraft({
                ...draft,
                milestones: [
                  ...draft.milestones,
                  { id: crypto.randomUUID(), title: '', due: null, responsibleKey: null },
                ],
              })
            }
          >
            Add milestone
          </Button>
        </div>
      </fieldset>
      <p className="text-xs text-sand-400">
        Materials with assignments, reservations or contributions cannot be removed, and a requirement cannot drop below
        what is already confirmed, reserved or assigned.
      </p>
      <div className="flex flex-wrap gap-3">
        <Button type="submit" className="btn btn-primary" disabled={busy}>
          {busy ? 'Saving…' : 'Save project'}
        </Button>
        <Button type="button" className="btn btn-secondary" disabled={busy} onClick={onCancel}>
          Cancel editing
        </Button>
      </div>
    </form>
  );
}
