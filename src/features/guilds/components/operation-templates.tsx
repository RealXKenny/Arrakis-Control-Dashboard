'use client';
import { Button } from '../../../components/ui/button';

import { useState, type FormEvent } from 'react';
import { Field, FormMessage, inputClass } from '../../../components/ui/form-controls';
import { LocalTime } from '../../../components/ui/local-time';
import { localTimeZone } from '../../../lib/time';
import {
  TEMPLATE_LIMIT,
  nextTemplateStart,
  templateCadenceLabel,
  templateCadences,
  templateDraftSchema,
  templatesViewSchema,
  type StoredTemplate,
  type TemplateDraft,
} from '../operation-templates';
import { operationKindLabel, operationKinds, operationRoleLabel, operationRoles } from '../operations';
import { weekdayLabels } from '../zoned-time';
import { useLogistics } from './use-logistics';

function blank(): TemplateDraft {
  return {
    id: crypto.randomUUID(),
    name: '',
    kind: 'spice-run',
    title: '',
    details: '',
    meetingPoint: '',
    durationMinutes: 120,
    roles: [
      { role: 'pilot', capacity: 1 },
      { role: 'scout', capacity: 2 },
    ],
    preparation: [],
    briefings: {},
    waypoints: [],
    notes: '',
    cadence: 'weekly',
    weekday: 6,
    time: '19:00',
    timeZone: localTimeZone(),
  };
}

function TemplateForm({
  initial,
  busy,
  onSave,
  onCancel,
}: {
  initial: TemplateDraft;
  busy: boolean;
  onSave: (template: TemplateDraft) => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState(initial);
  const [prep, setPrep] = useState(initial.preparation.map((entry) => entry.text).join('\n'));
  const [capacities, setCapacities] = useState(() =>
    Object.fromEntries(
      operationRoles.map((role) => [role, initial.roles.find((slot) => slot.role === role)?.capacity ?? 0]),
    ),
  );
  const [error, setError] = useState('');
  function submit(event: FormEvent) {
    event.preventDefault();
    const lines = prep
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);
    const input = templateDraftSchema.safeParse({
      ...draft,
      roles: operationRoles
        .filter((role) => capacities[role] > 0)
        .map((role) => ({ role, capacity: capacities[role] })),
      // Keep IDs for unchanged lines so a template edit does not churn every item.
      preparation: lines.map((text, index) => ({
        id: initial.preparation[index]?.text === text ? initial.preparation[index].id : crypto.randomUUID(),
        text,
      })),
      briefings: Object.fromEntries(Object.entries(draft.briefings).filter(([role]) => capacities[role] > 0)),
      ...(draft.cadence === 'none' ? { weekday: null, time: null, timeZone: null } : {}),
    });
    if (!input.success) {
      setError(
        'Enter a template name, operation title, meeting point, 15 minutes to 24 hours, 1–50 role slots, up to 20 preparation items and, for recurring templates, a weekday, time and valid timezone.',
      );
      return;
    }
    setError('');
    onSave(input.data);
  }
  return (
    <form
      aria-label="Operation template"
      onSubmit={submit}
      className="grid min-w-0 gap-4 border border-sand-200/20 p-4"
    >
      <FormMessage error={error} />
      <div className="grid min-w-0 grid-cols-1 gap-4 md:grid-cols-2">
        <Field label="Template name">
          <input
            required
            maxLength={80}
            value={draft.name}
            onChange={(event) => setDraft({ ...draft, name: event.target.value })}
            className={inputClass}
          />
        </Field>
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
            onChange={(event) => setDraft({ ...draft, kind: event.target.value as TemplateDraft['kind'] })}
            className={inputClass}
          >
            {operationKinds.map((kind) => (
              <option key={kind} value={kind}>
                {operationKindLabel[kind]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Duration in minutes">
          <input
            type="number"
            min={15}
            max={1440}
            value={draft.durationMinutes}
            onChange={(event) => setDraft({ ...draft, durationMinutes: Number(event.target.value) })}
            className={inputClass}
          />
        </Field>
      </div>
      <Field label="Template meeting point">
        <input
          required
          maxLength={200}
          value={draft.meetingPoint}
          onChange={(event) => setDraft({ ...draft, meetingPoint: event.target.value })}
          className={inputClass}
        />
      </Field>
      <Field label="Template details">
        <textarea
          rows={3}
          maxLength={2000}
          value={draft.details}
          onChange={(event) => setDraft({ ...draft, details: event.target.value })}
          className={inputClass}
        />
      </Field>
      <fieldset className="grid min-w-0 grid-cols-2 gap-3 sm:grid-cols-3">
        <legend className="mb-3 text-sm font-bold text-sand-200">Role slots</legend>
        {operationRoles.map((role) => (
          <Field key={role} label={`${operationRoleLabel[role]} seats`}>
            <input
              type="number"
              min={0}
              max={50}
              value={capacities[role]}
              onChange={(event) => setCapacities({ ...capacities, [role]: Number(event.target.value) })}
              className={inputClass}
            />
          </Field>
        ))}
      </fieldset>
      <Field label="Preparation list" hint="One item per line, up to 20">
        <textarea rows={4} value={prep} onChange={(event) => setPrep(event.target.value)} className={inputClass} />
      </Field>
      <fieldset className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2">
        <legend className="mb-3 text-sm font-bold text-sand-200">Schedule</legend>
        <Field label="Repeats">
          <select
            value={draft.cadence}
            onChange={(event) => setDraft({ ...draft, cadence: event.target.value as TemplateDraft['cadence'] })}
            className={inputClass}
          >
            {templateCadences.map((cadence) => (
              <option key={cadence} value={cadence}>
                {templateCadenceLabel[cadence]}
              </option>
            ))}
          </select>
        </Field>
        {draft.cadence !== 'none' && (
          <>
            <Field label="Weekday">
              <select
                value={draft.weekday ?? 6}
                onChange={(event) => setDraft({ ...draft, weekday: Number(event.target.value) })}
                className={inputClass}
              >
                {weekdayLabels.map((label, index) => (
                  <option key={label} value={index}>
                    {label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Start time">
              <input
                type="time"
                value={draft.time ?? '19:00'}
                onChange={(event) => setDraft({ ...draft, time: event.target.value })}
                className={inputClass}
              />
            </Field>
            <Field label="Schedule timezone" hint="IANA name, for example Europe/Berlin">
              <input
                maxLength={80}
                value={draft.timeZone ?? ''}
                onChange={(event) => setDraft({ ...draft, timeZone: event.target.value })}
                className={inputClass}
              />
            </Field>
          </>
        )}
      </fieldset>
      <Field label="Template notes">
        <textarea
          rows={3}
          maxLength={1000}
          value={draft.notes}
          onChange={(event) => setDraft({ ...draft, notes: event.target.value })}
          className={inputClass}
        />
      </Field>
      <p className="text-xs text-sand-400">
        Role briefings and waypoints come from the operation a template was saved from. A schedule only suggests the
        next start; each operation is still reviewed and saved by a leader.
      </p>
      <div className="flex flex-wrap gap-3">
        <Button type="submit" className="btn btn-primary" disabled={busy}>
          Save template
        </Button>
        <Button type="button" className="btn btn-secondary" disabled={busy} onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

/** N061 recurring operation templates. */
export function OperationTemplates({ guildId }: { guildId: string }) {
  const state = useLogistics(guildId, 'templates', templatesViewSchema);
  const [editing, setEditing] = useState<TemplateDraft | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);
  const view = state.data;
  const [now] = useState(() => Date.now());
  async function save(template: TemplateDraft) {
    if (await state.run({ action: 'save', revision: view?.revision ?? null, template }, 'Template saved.'))
      setEditing(null);
  }
  function edit(template: StoredTemplate) {
    const { updatedAt: _at, updatedBy: _by, ...draft } = template;
    void _at;
    void _by;
    setEditing(draft);
  }
  return (
    <section aria-label="Operation templates">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-base">Operation templates</h3>
          <p className="mt-1 max-w-prose text-sm text-sand-400">
            Reuse roles, meeting points, preparation lists and notes for runs you plan again and again. Use “New from
            template” in the operations planner to schedule one.
          </p>
        </div>
        {view?.canEdit && !editing && (
          <Button
            type="button"
            className="btn btn-primary"
            disabled={state.saving || (view.templates.length ?? 0) >= TEMPLATE_LIMIT}
            onClick={() => setEditing(blank())}
          >
            New template
          </Button>
        )}
      </div>
      <div className="mt-3">
        <FormMessage error={state.error} status={state.status} />
      </div>
      {state.loading && (
        <p role="status" className="mt-3 text-sm text-sand-400">
          Loading templates…
        </p>
      )}
      {editing && (
        <div className="mt-4">
          <TemplateForm
            key={editing.id}
            initial={editing}
            busy={state.saving}
            onSave={save}
            onCancel={() => setEditing(null)}
          />
        </div>
      )}
      {view && !view.templates.length && <p className="mt-4 text-sm text-sand-400">No templates yet.</p>}
      <ul aria-label="Saved templates" className="mt-4 grid gap-4">
        {view?.templates.map((template) => {
          const next = nextTemplateStart(template, now);
          return (
            <li key={template.id} className="min-w-0 border border-sand-200/15 p-4">
              <p className="font-mono text-xs uppercase tracking-wider text-spice-300">
                {operationKindLabel[template.kind]} · {templateCadenceLabel[template.cadence]}
                {template.cadence !== 'none' && template.weekday !== null
                  ? ` · ${weekdayLabels[template.weekday]} ${template.time} ${template.timeZone}`
                  : ''}
              </p>
              <h4 className="mt-2 break-words text-sm text-sand-100">{template.name}</h4>
              <p className="mt-1 break-words text-sm text-sand-300">
                {template.title} · meet at {template.meetingPoint} · {template.durationMinutes} minutes
              </p>
              <p className="mt-1 text-xs text-sand-400">
                {template.roles.map((slot) => `${operationRoleLabel[slot.role]} ${slot.capacity}`).join(' · ')} ·{' '}
                {template.preparation.length} preparation items · {template.waypoints.length} waypoints
              </p>
              {next && (
                <p className="mt-1 text-xs text-sand-300">
                  Next suggested start: <LocalTime value={next} />
                </p>
              )}
              {template.notes && (
                <p className="mt-2 whitespace-pre-wrap break-words text-sm text-sand-300">{template.notes}</p>
              )}
              <p className="mt-2 text-xs text-sand-500">
                Updated by {template.updatedBy} · <LocalTime value={template.updatedAt} />
              </p>
              {view.canEdit && (
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button
                    type="button"
                    className="btn btn-secondary"
                    disabled={state.saving || Boolean(editing)}
                    onClick={() => edit(template)}
                  >
                    Edit template
                  </Button>
                  {confirm === template.id ? (
                    <>
                      <Button
                        type="button"
                        className="btn btn-primary"
                        disabled={state.saving}
                        onClick={async () => {
                          await state.run(
                            { action: 'delete', revision: view.revision, id: template.id },
                            'Template removed.',
                          );
                          setConfirm(null);
                        }}
                      >
                        Confirm removal
                      </Button>
                      <Button type="button" className="btn btn-secondary" onClick={() => setConfirm(null)}>
                        Keep template
                      </Button>
                    </>
                  ) : (
                    <Button
                      type="button"
                      className="btn btn-secondary"
                      disabled={state.saving}
                      onClick={() => setConfirm(template.id)}
                    >
                      Remove template
                    </Button>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
