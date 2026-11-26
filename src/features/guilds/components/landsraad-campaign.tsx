'use client';
import { Button } from '../../../components/ui/button';

import { useState, type FormEvent } from 'react';
import { Field, FormMessage, inputClass } from '../../../components/ui/form-controls';
import { LocalTime } from '../../../components/ui/local-time';
import {
  CAMPAIGN_ASSIGNEE_LIMIT,
  CAMPAIGN_TARGET_LIMIT,
  campaignPriorities,
  campaignPriorityLabel,
  campaignStatusLabel,
  campaignStatuses,
  campaignViewSchema,
  type CampaignView,
} from '../landsraad-campaign';
import { useLogistics } from './use-logistics';

type Target = CampaignView['targets'][number];
type Draft = Pick<Target, 'id' | 'taskKey' | 'title' | 'goal' | 'priority' | 'status'> & { assigneeRefs: string[] };

function TargetForm({
  view,
  initial,
  busy,
  onSave,
  onCancel,
}: {
  view: CampaignView;
  initial: Draft;
  busy: boolean;
  onSave: (draft: Draft) => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState(initial);
  const [error, setError] = useState('');
  const tasks = view.observation.status === 'ok' ? view.observation.tasks : [];
  function submit(event: FormEvent) {
    event.preventDefault();
    if (!draft.title.trim()) {
      setError('Give the target a title.');
      return;
    }
    setError('');
    onSave({ ...draft, title: draft.title.trim(), goal: draft.goal.trim() });
  }
  return (
    <form aria-label="Campaign target" onSubmit={submit} className="grid min-w-0 gap-3 border border-sand-200/20 p-4">
      <FormMessage error={error} />
      <Field label="Target title">
        <input
          required
          maxLength={100}
          value={draft.title}
          onChange={(event) => setDraft({ ...draft, title: event.target.value })}
          className={inputClass}
        />
      </Field>
      <Field label="Landsraad objective" hint="Objectives listed by the server for the current term">
        <select
          value={draft.taskKey ?? ''}
          onChange={(event) => {
            const task = tasks.find((entry) => entry.key === event.target.value);
            setDraft({ ...draft, taskKey: task?.key ?? null, title: draft.title || task?.label.slice(0, 100) || '' });
          }}
          className={inputClass}
        >
          <option value="">Guild-defined target (no linked objective)</option>
          {draft.taskKey && !tasks.some((entry) => entry.key === draft.taskKey) && (
            <option value={draft.taskKey}>Previously linked objective {draft.taskKey}</option>
          )}
          {tasks.map((task) => (
            <option key={task.key} value={task.key}>
              {task.label}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Guild goal">
        <textarea
          rows={3}
          maxLength={500}
          value={draft.goal}
          onChange={(event) => setDraft({ ...draft, goal: event.target.value })}
          className={inputClass}
        />
      </Field>
      <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Priority">
          <select
            value={draft.priority}
            onChange={(event) => setDraft({ ...draft, priority: event.target.value as Draft['priority'] })}
            className={inputClass}
          >
            {campaignPriorities.map((value) => (
              <option key={value} value={value}>
                {campaignPriorityLabel[value]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Target status">
          <select
            value={draft.status}
            onChange={(event) => setDraft({ ...draft, status: event.target.value as Draft['status'] })}
            className={inputClass}
          >
            {campaignStatuses.map((value) => (
              <option key={value} value={value}>
                {campaignStatusLabel[value]}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <fieldset className="grid max-h-60 gap-2 overflow-y-auto">
        <legend className="mb-2 text-sm text-sand-200">Assigned members · up to {CAMPAIGN_ASSIGNEE_LIMIT}</legend>
        {view.members.map((member) => (
          <label key={member.ref} className="flex items-center gap-3 text-sm text-sand-100">
            <input
              type="checkbox"
              className="size-4 accent-spice-500"
              checked={draft.assigneeRefs.includes(member.ref)}
              disabled={
                !draft.assigneeRefs.includes(member.ref) && draft.assigneeRefs.length >= CAMPAIGN_ASSIGNEE_LIMIT
              }
              onChange={(event) =>
                setDraft({
                  ...draft,
                  assigneeRefs: event.target.checked
                    ? [...draft.assigneeRefs, member.ref]
                    : draft.assigneeRefs.filter((ref) => ref !== member.ref),
                })
              }
            />
            {member.name}
            {member.isSelf ? ' (you)' : ''}
          </label>
        ))}
      </fieldset>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" className="btn btn-primary" disabled={busy}>
          Save target
        </Button>
        <Button type="button" className="btn btn-secondary" disabled={busy} onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

/** N070 Landsraad campaign: guild targets and assignments, linked to objectives the Console reports. */
export function LandsraadCampaign({ guildId }: { guildId: string }) {
  const state = useLogistics(guildId, 'landsraad', campaignViewSchema);
  const [editing, setEditing] = useState<Draft | null>(null);
  const view = state.data;
  const observation = view?.observation;
  const task = (key: string | null) =>
    observation?.status === 'ok' && key ? observation.tasks.find((entry) => entry.key === key) : undefined;
  async function save(draft: Draft) {
    if (await state.run({ action: 'save', revision: view?.revision ?? null, target: draft }, 'Campaign target saved.'))
      setEditing(null);
  }
  return (
    <section aria-label="Landsraad campaign">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-base">Landsraad campaign</h3>
          <p className="mt-1 max-w-prose text-sm text-sand-400">
            Turn the current term&apos;s objectives into guild targets and assign members. Objective state comes only
            from what the server reports; progress counts are never estimated.
          </p>
        </div>
        {view?.canEdit && !editing && (
          <Button
            type="button"
            className="btn btn-primary"
            disabled={state.saving || view.targets.length >= CAMPAIGN_TARGET_LIMIT}
            onClick={() =>
              setEditing({
                id: crypto.randomUUID(),
                taskKey: null,
                title: '',
                goal: '',
                priority: 'normal',
                status: 'planned',
                assigneeRefs: [],
              })
            }
          >
            New target
          </Button>
        )}
      </div>
      <div className="mt-3">
        <FormMessage error={state.error} status={state.status} />
      </div>
      {state.loading && (
        <p role="status" className="mt-3 text-sm text-sand-400">
          Loading campaign…
        </p>
      )}
      {observation && (
        <div className="mt-4 border border-sand-200/15 p-3 text-sm">
          {observation.status === 'ok' ? (
            <>
              <p className="text-sand-100">
                {observation.termId}
                {observation.endsAt ? (
                  <>
                    {' '}
                    · ends <LocalTime value={observation.endsAt} />
                  </>
                ) : (
                  ' · end not reported'
                )}
              </p>
              <ul aria-label="Current Landsraad objectives" className="mt-2 grid gap-1 text-xs text-sand-300">
                {observation.tasks.map((entry) => (
                  <li key={entry.key} className="break-words">
                    {entry.label} ·{' '}
                    {entry.completed === null ? 'Completion not reported' : entry.completed ? 'Decided' : 'Open'}
                    {entry.winner ? ` · won by ${entry.winner === 'atreides' ? 'Atreides' : 'Harkonnen'}` : ''}
                  </li>
                ))}
              </ul>
              {observation.unidentified > 0 && (
                <p className="mt-2 text-xs text-sand-500">
                  {observation.unidentified} objective{observation.unidentified === 1 ? '' : 's'} had no stable ID and
                  cannot be linked.
                </p>
              )}
              <p className="mt-2 text-xs text-sand-500">
                Observed <LocalTime value={observation.observedAt} />
              </p>
            </>
          ) : (
            <p className="text-sand-400">
              {observation.status === 'unsupported'
                ? 'This server does not report Landsraad objectives. Guild-defined targets still work.'
                : 'Landsraad objectives are unavailable right now. Guild-defined targets still work.'}
            </p>
          )}
        </div>
      )}
      {view && editing && (
        <div className="mt-4">
          <TargetForm
            key={editing.id}
            view={view}
            initial={editing}
            busy={state.saving}
            onSave={save}
            onCancel={() => setEditing(null)}
          />
        </div>
      )}
      {view && !view.targets.length && <p className="mt-4 text-sm text-sand-400">No campaign targets yet.</p>}
      <ul aria-label="Campaign targets" className="mt-4 grid gap-3">
        {view?.targets.map((target) => {
          const linked = task(target.taskKey);
          const self = target.assignees.some((entry) => entry.isSelf);
          const closed = target.status === 'met' || target.status === 'dropped';
          return (
            <li key={target.id} className="min-w-0 border border-sand-200/15 p-3 text-sm">
              <p className="font-mono text-xs uppercase tracking-wider text-spice-300">
                {campaignStatusLabel[target.status]} · {campaignPriorityLabel[target.priority]}
              </p>
              <h4 className="mt-1 break-words text-sand-100">{target.title}</h4>
              {target.taskKey && (
                <p className="mt-1 break-words text-xs text-sand-300">
                  {linked
                    ? `Objective: ${linked.label} · ${
                        linked.completed === null ? 'completion not reported' : linked.completed ? 'decided' : 'open'
                      }${linked.winner ? ` · won by ${linked.winner === 'atreides' ? 'Atreides' : 'Harkonnen'}` : ''}`
                    : observation?.status === 'ok' && target.termId !== observation.termId
                      ? `Linked to an objective from ${target.termId ?? 'an earlier term'}; not in the current term.`
                      : 'Linked objective state is not available right now.'}
                </p>
              )}
              {target.goal && <p className="mt-1 whitespace-pre-wrap break-words text-sand-300">{target.goal}</p>}
              <p className="mt-1 break-words text-xs text-sand-400">
                Assigned:{' '}
                {target.assignees.length ? target.assignees.map((entry) => entry.name).join(', ') : 'Nobody yet'}
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {!closed && (
                  <Button
                    type="button"
                    className="btn btn-secondary"
                    disabled={state.saving}
                    onClick={() =>
                      state.run(
                        { action: self ? 'unclaim' : 'claim', revision: view.revision, id: target.id },
                        self ? 'You left this target.' : 'You are assigned to this target.',
                      )
                    }
                  >
                    {self ? 'Leave target' : 'Take this target'}
                  </Button>
                )}
                {view.canEdit && (
                  <>
                    <Button
                      type="button"
                      className="btn btn-secondary"
                      disabled={state.saving || Boolean(editing)}
                      onClick={() =>
                        setEditing({
                          id: target.id,
                          taskKey: target.taskKey,
                          title: target.title,
                          goal: target.goal,
                          priority: target.priority,
                          status: target.status,
                          // Members who left the roster are dropped from the draft; the server rejects stale references.
                          assigneeRefs: target.assignees
                            .map((entry) => entry.ref)
                            .filter((ref) => view.members.some((member) => member.ref === ref)),
                        })
                      }
                    >
                      Edit target
                    </Button>
                    <Button
                      type="button"
                      className="btn btn-secondary"
                      disabled={state.saving}
                      onClick={() =>
                        state.run({ action: 'delete', revision: view.revision, id: target.id }, 'Target removed.')
                      }
                    >
                      Remove target
                    </Button>
                  </>
                )}
              </div>
              <p className="mt-2 text-xs text-sand-500">
                Updated by {target.updatedBy} · <LocalTime value={target.updatedAt} />
              </p>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
