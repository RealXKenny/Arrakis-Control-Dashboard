'use client';
import { StatePanel } from '../../../components/ui/state-panel';
import { Button } from '../../../components/ui/button';
import { Card } from '../../../components/ui/card';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import {
  taskDraftSchema,
  taskRecordSchema,
  taskTargetHref,
  type TaskDraft,
  type TaskInput,
  type TaskRecord,
  type TaskTarget,
  type PersonalTask,
} from '../model';
import styles from './tasks.module.css';
import { ActivityCapture } from '../../activity-views/components/activity-capture';
import { defaultActivity, type ActivityView } from '../../activity-views/model';
const blank = (target: TaskTarget | null = null): TaskDraft => ({
  id: crypto.randomUUID(),
  kind: 'task',
  title: '',
  notes: '',
  priority: 'normal',
  dueDate: null,
  target: target ?? { type: 'none' },
});
function newTarget(type: TaskTarget['type']): TaskTarget {
  if (type === 'none') return { type };
  if (type === 'project' || type === 'goal') return { type, ref: '' };
  if (type === 'item') return { type, ref: '', label: '' };
  return { type, ref: '', label: '', view: 'owned' };
}
export function Tasks({
  seed,
  focus,
  activity = null,
}: {
  seed: TaskTarget | null;
  focus: string | null;
  activity?: ActivityView | null;
}) {
  const [record, setRecord] = useState<TaskRecord | null>(null);
  const [draft, setDraft] = useState<TaskDraft>(() => blank(seed));
  const [editing, setEditing] = useState(Boolean(seed));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [filter, setFilter] = useState<string>(activity?.tasks.status ?? 'open');
  const [kind, setKind] = useState<string>(activity?.tasks.kind ?? 'all');
  const [query, setQuery] = useState(activity?.tasks.query ?? '');
  const [deleting, setDeleting] = useState<string | null>(null);
  const active = useRef<AbortController | null>(null);
  const focusedOnce = useRef(false);
  useEffect(() => {
    if (!focus || !record || focusedOnce.current) return;
    const target = document.getElementById(`task-${focus}`);
    if (target) {
      focusedOnce.current = true;
      target.scrollIntoView({ block: 'start' });
    }
  }, [focus, record]);
  async function request(input?: TaskInput, discard = false) {
    if (active.current) return;
    const controller = new AbortController();
    active.current = controller;
    setBusy(true);
    setError('');
    setMessage('');
    const deadline = setTimeout(() => controller.abort('timeout'), 10000);
    try {
      const response = await fetch('/api/v2/tasks', {
        method: input ? 'POST' : 'GET',
        cache: 'no-store',
        signal: controller.signal,
        headers: input ? { 'Content-Type': 'application/json' } : undefined,
        body: input ? JSON.stringify(input) : undefined,
      });
      const raw: unknown = await response.json();
      if (!response.ok)
        throw new Error(
          response.status === 401
            ? 'Your session ended. Sign in again.'
            : typeof (raw as { error?: unknown })?.error === 'string'
              ? (raw as { error: string }).error
              : 'Personal tasks are unavailable. Reload before trying again.',
        );
      const parsed = taskRecordSchema.safeParse((raw as { record?: unknown })?.record);
      if (!parsed.success || (input && !parsed.data.revision))
        throw new Error('Task change could not be confirmed. Reload the saved list before trying again.');
      if (controller.signal.aborted) return;
      setRecord(parsed.data);
      setDeleting(null);
      if (input?.action === 'save' || discard) setEditing(false);
      setMessage(input ? 'Personal task list saved.' : 'Saved task list loaded.');
    } catch (failure) {
      if (!controller.signal.aborted || controller.signal.reason === 'timeout')
        setError(
          controller.signal.reason === 'timeout'
            ? 'The request timed out. Reload the saved list before trying again; your draft is kept.'
            : failure instanceof Error
              ? failure.message
              : 'Tasks are unavailable.',
        );
    } finally {
      clearTimeout(deadline);
      if (active.current === controller) active.current = null;
      if (!controller.signal.aborted || controller.signal.reason === 'timeout') setBusy(false);
    }
  }
  useEffect(() => {
    void request();
    return () => {
      active.current?.abort();
      active.current = null;
    };
  }, []);
  function edit(task: PersonalTask) {
    setDraft({
      id: task.id,
      kind: task.kind,
      title: task.title,
      notes: task.notes,
      priority: task.priority,
      dueDate: task.dueDate,
      target: task.target,
    });
    setEditing(true);
    setDeleting(null);
    setError('');
    document.getElementById('task-editor')?.scrollIntoView({ block: 'start' });
  }
  const tasks =
    record?.tasks
      .filter(
        (task) =>
          (!activity?.planning ||
            task.id === activity.planning.id ||
            (task.target.type === activity.planning.kind && task.target.ref === activity.planning.id)) &&
          (!activity?.planning ||
            record?.tasks.some((p) => p.id === activity.planning!.id && p.kind === activity.planning!.kind)) &&
          (filter === 'all' || task.status === filter) &&
          (kind === 'all' || task.kind === kind) &&
          `${task.title} ${task.notes}`.toLowerCase().includes(query.trim().toLowerCase()),
      )
      .sort(
        (a, b) =>
          Number(b.priority === 'high') - Number(a.priority === 'high') ||
          (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999') ||
          b.createdAt.localeCompare(a.createdAt),
      ) ?? [];
  const focused = focus && record?.tasks.find((task) => task.id === focus);
  const shown = focused && !tasks.some((task) => task.id === focused.id) ? [focused, ...tasks] : tasks;
  return (
    <section className={styles.root} aria-label="Personal task list">
      <ActivityCapture
        definition={{
          ...(activity ?? defaultActivity()),
          tasks: {
            status: filter as ActivityView['tasks']['status'],
            kind: kind as ActivityView['tasks']['kind'],
            query,
          },
        }}
      />
      {activity?.planning &&
        record &&
        !record.tasks.some((p) => p.id === activity.planning!.id && p.kind === activity.planning!.kind) && (
          <p role="alert">
            The saved project or goal context is no longer available. Edit the activity view to choose another context.
            No unrelated plans are shown.
          </p>
        )}
      <p className={styles.note}>
        Private plans for your dashboard account. Completion is your own checklist, not proof of in-game activity. Links
        open the current authorized workspace; saved references do not grant access.
      </p>
      <div className={styles.actions}>
        <Button
          className="btn btn-primary"
          disabled={busy || !record || editing}
          onClick={() => {
            setDraft(blank());
            setEditing(true);
            setError('');
          }}
        >
          New entry
        </Button>
        <Button className="btn btn-secondary" disabled={busy} onClick={() => void request(undefined, true)}>
          Reload saved list
        </Button>
      </div>
      <p role="status" className={styles.note}>
        {busy ? 'Saving or loading your tasks…' : message}
      </p>
      {error && (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      )}
      {record && (
        <>
          <p className={styles.note}>
            {record.tasks.filter((t) => t.status === 'completed').length} completed · {record.tasks.length} / 100
            entries. Reloading the saved list discards an open editor. Delete old entries to make room. The list expires
            after 90 days without being opened or updated.
          </p>
          <div id="task-editor" className={styles.editor}>
            {editing && (
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  const parsed = taskDraftSchema.safeParse(draft);
                  if (!parsed.success) {
                    setError(
                      'Check the title, date and linked reference. Create a personal project or goal before linking it.',
                    );
                    return;
                  }
                  void request({ action: 'save', revision: record.revision, task: parsed.data });
                }}
              >
                <fieldset className={styles.fields} disabled={busy}>
                  <legend>
                    {record.tasks.some((t) => t.id === draft.id) ? 'Edit personal entry' : 'Create personal entry'}
                  </legend>
                  <label>
                    Entry kind
                    <select
                      value={draft.kind}
                      onChange={(e) =>
                        setDraft({
                          ...draft,
                          kind: e.target.value as TaskDraft['kind'],
                          target: ['project', 'goal'].includes(draft.target.type) ? { type: 'none' } : draft.target,
                        })
                      }
                    >
                      <option value="task">Task</option>
                      <option value="project">Personal project</option>
                      <option value="goal">Personal goal</option>
                    </select>
                  </label>
                  <label>
                    Entry title
                    <input
                      required
                      maxLength={120}
                      value={draft.title}
                      onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                    />
                  </label>
                  <label>
                    Notes
                    <textarea
                      rows={3}
                      maxLength={1500}
                      value={draft.notes}
                      onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
                    />
                  </label>
                  <div className={styles.actions}>
                    <label>
                      Priority
                      <select
                        value={draft.priority}
                        onChange={(e) => setDraft({ ...draft, priority: e.target.value as TaskDraft['priority'] })}
                      >
                        <option value="normal">Normal</option>
                        <option value="high">High</option>
                      </select>
                    </label>
                    <label>
                      Due date (optional)
                      <input
                        type="date"
                        value={draft.dueDate ?? ''}
                        onChange={(e) => setDraft({ ...draft, dueDate: e.target.value || null })}
                      />
                    </label>
                  </div>
                  <div className={styles.fields}>
                    <label htmlFor="task-link-type">Link to</label>
                    <select
                      id="task-link-type"
                      value={draft.target.type}
                      onChange={(e) => setDraft({ ...draft, target: newTarget(e.target.value as TaskTarget['type']) })}
                    >
                      <option value="none">No linked reference</option>
                      <option value="item">Item search</option>
                      <option value="vehicle">Vehicle</option>
                      <option value="base">Base</option>
                      {draft.kind === 'task' && (
                        <>
                          <option value="project">Personal project</option>
                          <option value="goal">Personal goal</option>
                        </>
                      )}
                    </select>
                  </div>
                  {draft.target.type === 'project' || draft.target.type === 'goal' ? (
                    <label>
                      Planning entry
                      <select
                        required
                        value={draft.target.ref}
                        onChange={(e) =>
                          setDraft({
                            ...draft,
                            target: { type: draft.target.type as 'project' | 'goal', ref: e.target.value },
                          })
                        }
                      >
                        <option value="">Choose an existing {draft.target.type}</option>
                        {record.tasks
                          .filter((t) => t.kind === draft.target.type)
                          .map((t) => (
                            <option key={t.id} value={t.id}>
                              {t.title}
                            </option>
                          ))}
                      </select>
                    </label>
                  ) : (
                    draft.target.type !== 'none' && (
                      <>
                        <label>
                          {draft.target.type === 'item' ? 'Item name or template to find' : 'Asset reference ID'}
                          <input
                            required
                            maxLength={128}
                            value={draft.target.ref}
                            onChange={(e) =>
                              setDraft({ ...draft, target: { ...draft.target, ref: e.target.value } as TaskTarget })
                            }
                          />
                        </label>
                        <label>
                          Reference label
                          <input
                            required
                            maxLength={160}
                            value={draft.target.label}
                            onChange={(e) =>
                              setDraft({ ...draft, target: { ...draft.target, label: e.target.value } as TaskTarget })
                            }
                          />
                        </label>
                        {(draft.target.type === 'base' || draft.target.type === 'vehicle') && (
                          <label>
                            Asset view
                            <select
                              value={draft.target.view}
                              onChange={(e) =>
                                setDraft({ ...draft, target: { ...draft.target, view: e.target.value } as TaskTarget })
                              }
                            >
                              <option value="owned">Owned</option>
                              <option value="shared">Shared</option>
                            </select>
                          </label>
                        )}
                      </>
                    )
                  )}
                  <p className={styles.note}>
                    Projects and goals here are personal planning entries, not guild budgets or game achievements. Item
                    links prepare a finder search; you choose when to run it.
                  </p>
                  <div className={styles.actions}>
                    <Button type="submit" className="btn btn-primary">
                      Save entry
                    </Button>
                    <Button type="button" className="btn btn-secondary" onClick={() => setEditing(false)}>
                      Cancel editing
                    </Button>
                  </div>
                </fieldset>
              </form>
            )}
          </div>
          <div className={styles.actions}>
            <label>
              Entry status
              <select value={filter} onChange={(e) => setFilter(e.target.value)}>
                <option value="open">Open</option>
                <option value="completed">Completed</option>
                <option value="all">All statuses</option>
              </select>
            </label>
            <label>
              Entry type
              <select value={kind} onChange={(e) => setKind(e.target.value)}>
                <option value="all">All types</option>
                <option value="task">Tasks</option>
                <option value="project">Projects</option>
                <option value="goal">Goals</option>
              </select>
            </label>
            <label>
              Search entries
              <input type="search" maxLength={200} value={query} onChange={(e) => setQuery(e.target.value)} />
            </label>
          </div>
          {focus && !focused && <p className={styles.note}>That linked entry is not in your current list.</p>}
          {!shown.length && (
            <StatePanel title="No matching entries">
              No entries match this view. Create a task, personal project or goal to get started.
            </StatePanel>
          )}
          <div className={styles.list}>
            {shown.map((task) => {
              const href = taskTargetHref(task.target);
              const targetRef = 'ref' in task.target ? task.target.ref : null;
              const parent = record.tasks.find((t) => t.id === targetRef);
              return (
                <Card
                  id={`task-${task.id}`}
                  key={task.id}
                  className={styles.card}
                  aria-label={task.title}
                  data-focused={focus === task.id ? 'true' : undefined}
                >
                  <p className={styles.eyebrow}>
                    {task.kind} · {task.priority === 'high' ? 'High priority' : 'Normal priority'} · {task.status}
                  </p>
                  <h2>{task.title}</h2>
                  {task.notes && <p className={styles.notes}>{task.notes}</p>}
                  {task.dueDate && <p>Due {task.dueDate} (calendar date)</p>}
                  {href && (
                    <Link href={href} className={styles.link}>
                      Open {'label' in task.target ? task.target.label : (parent?.title ?? 'planning entry')} →
                    </Link>
                  )}
                  <div className={styles.actions}>
                    <Button
                      className="btn btn-secondary"
                      disabled={busy}
                      onClick={() =>
                        void request({
                          action: 'status',
                          revision: record.revision!,
                          id: task.id,
                          status: task.status === 'open' ? 'completed' : 'open',
                        })
                      }
                    >
                      {task.status === 'open' ? 'Mark complete' : 'Reopen entry'}
                    </Button>
                    <Button className="btn btn-secondary" disabled={busy || editing} onClick={() => edit(task)}>
                      Edit entry
                    </Button>
                    <Button
                      className="btn btn-secondary"
                      disabled={busy || editing}
                      onClick={() => setDeleting(task.id)}
                    >
                      Delete entry
                    </Button>
                  </div>
                  {deleting === task.id && (
                    <div className={styles.confirm} role="group" aria-label="Confirm entry deletion">
                      <p>Delete this private entry? This cannot be undone.</p>
                      <Button
                        className="btn btn-secondary"
                        disabled={busy}
                        onClick={() => void request({ action: 'delete', revision: record.revision!, id: task.id })}
                      >
                        Confirm delete
                      </Button>
                      <Button className="btn btn-secondary" disabled={busy} onClick={() => setDeleting(null)}>
                        Keep entry
                      </Button>
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        </>
      )}
    </section>
  );
}
