'use client';
import { Button } from '../../../components/ui/button';
import { Card } from '../../../components/ui/card';

import { buttonClass, cardClass } from '../../../components/ui/control-styles';
import Link from 'next/link';
import { useEffect, useEffectEvent, useRef, useState } from 'react';
import {
  activityEnvelopeSchema,
  activityRecordSchema,
  activityViewSchema,
  activityHref,
  defaultActivity,
  type ActivityInput,
  type ActivityRecord,
  type ActivityView,
} from '../model';
import {
  portalWidgetIds,
  portalWidgetCatalog,
  personalPortalLayout,
  recommendedPortalLayout,
} from '../../portal/layout';
import styles from './activity-views.module.css';
type Plans = { id: string; kind: 'project' | 'goal'; title: string }[];
const blank = (): ActivityView => ({ ...defaultActivity(), id: crypto.randomUUID(), name: '' });
export function ActivityManager() {
  const [record, setRecord] = useState<ActivityRecord | null>(null);
  const [draft, setDraft] = useState(blank);
  const [plans, setPlans] = useState<Plans>([]);
  const [planningAvailable, setPlanningAvailable] = useState(false);
  const [busy, setBusy] = useState(false);
  const [blocked, setBlocked] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [deleting, setDeleting] = useState<ActivityView | null>(null);
  const request = useRef<AbortController | null>(null);
  const editorHeading = useRef<HTMLHeadingElement | null>(null);
  const savedHeading = useRef<HTMLHeadingElement | null>(null);
  async function send(input?: ActivityInput) {
    if (request.current) return;
    const controller = new AbortController();
    request.current = controller;
    const timer = setTimeout(() => controller.abort('timeout'), 10000);
    setBusy(true);
    setError('');
    setMessage('');
    let failureMessage = 'Saved view change could not be confirmed. Reload before another change. Your draft is kept.';
    try {
      const response = await fetch('/api/v2/activity-views', {
        method: input ? 'POST' : 'GET',
        cache: 'no-store',
        signal: controller.signal,
        headers: input ? { 'Content-Type': 'application/json' } : undefined,
        body: input ? JSON.stringify(input) : undefined,
      });
      if (!response.ok) {
        if (response.status === 409)
          failureMessage = 'Saved views or planning context changed. Reload before trying again. Your draft is kept.';
        throw new Error('Request failed');
      }
      const raw: unknown = await response.json();
      const next = input
        ? activityRecordSchema.parse((raw as { record?: unknown }).record)
        : activityEnvelopeSchema.parse(raw).record;
      if (controller.signal.aborted) return;
      setRecord(next);
      setBlocked(false);
      setDeleting(null);
      if (input?.action === 'delete') requestAnimationFrame(() => savedHeading.current?.focus());
      if (!input) {
        const envelope = activityEnvelopeSchema.parse(raw);
        setPlans(envelope.plans as Plans);
        setPlanningAvailable(envelope.planningAvailable);
        setDraft(blank());
      }
      setMessage(input ? 'Activity views saved.' : 'Saved activity views loaded.');
    } catch {
      if (!controller.signal.aborted || controller.signal.reason === 'timeout') {
        setError(
          controller.signal.reason === 'timeout'
            ? 'Request timed out and may have completed. Reload before another change. Your draft is kept.'
            : failureMessage,
        );
        setBlocked(true);
      }
    } finally {
      clearTimeout(timer);
      if (request.current === controller) request.current = null;
      if (!controller.signal.aborted || controller.signal.reason === 'timeout') setBusy(false);
    }
  }
  const initial = useEffectEvent(() => void send());
  useEffect(() => {
    initial();
    return () => request.current?.abort();
  }, []);
  function edit(view: ActivityView, copy = false) {
    setDraft(
      copy
        ? { ...structuredClone(view), id: crypto.randomUUID(), name: `${view.name.slice(0, 54)} copy` }
        : structuredClone(view),
    );
    setDeleting(null);
    setError('');
    editorHeading.current?.focus();
  }
  function move(id: (typeof portalWidgetIds)[number], delta: number) {
    const widgets = [...draft.portal.widgets];
    const from = widgets.indexOf(id);
    const to = from + delta;
    if (from < 0 || to < 0 || to >= widgets.length) return;
    [widgets[from], widgets[to]] = [widgets[to], widgets[from]];
    setDraft({ ...draft, portal: { ...draft.portal, widgets } });
    setMessage(`${portalWidgetCatalog[id].name} moved to position ${to + 1}. Save the view to keep this order.`);
  }
  const missingPlan =
    draft.planning && !plans.some((p) => p.id === draft.planning!.id && p.kind === draft.planning!.kind);
  return (
    <section className={styles.root} aria-label="Saved activity views">
      <p>
        Private named setups for different activities. Save widget order, density, briefing map, inbox/task filters and
        an optional existing project or goal. Views never copy game readings, task notes or unsaved editor text. They do
        not change notification preferences or your normal portal layout.
      </p>
      <div className={styles.actions}>
        <Button className={buttonClass()} disabled={busy} onClick={() => void send()}>
          Reload views and discard draft
        </Button>
        <Button
          className={buttonClass()}
          disabled={busy}
          onClick={() => {
            setDraft(blank());
            setDeleting(null);
            editorHeading.current?.focus();
          }}
        >
          Discard draft and start new
        </Button>
      </div>
      <p role="status">{busy ? 'Reading or saving activity settings…' : message}</p>
      {error && (
        <p role="alert" className={styles.notice}>
          {error}
        </p>
      )}
      {!planningAvailable && (
        <p className={styles.notice}>
          Planning options are unavailable. Views without planning context can still be saved. Reload to check projects
          and goals again.
        </p>
      )}
      <Card as="div" className={cardClass({ className: styles.card })}>
        <h2 ref={editorHeading} tabIndex={-1}>
          {record?.views.some((v) => v.id === draft.id) ? 'Edit activity view' : 'Create activity view'}
        </h2>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const parsed = activityViewSchema.safeParse(draft);
            if (!parsed.success) {
              setError('Enter a name and valid view settings.');
              return;
            }
            if (record && !blocked && !busy)
              void send({ action: 'save', revision: record.revision, view: parsed.data });
          }}
        >
          <fieldset disabled={busy}>
            <label>
              Activity name
              <input
                maxLength={60}
                required
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              />
            </label>
            <div className={styles.grid}>
              <label>
                Briefing map
                <select
                  value={draft.map}
                  onChange={(e) => setDraft({ ...draft, map: e.target.value as ActivityView['map'] })}
                >
                  <option value="HaggaBasin">Hagga Basin</option>
                  <option value="DeepDesert">Deep Desert</option>
                </select>
              </label>
              <label>
                Widget density
                <select
                  value={draft.portal.density}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      portal: { ...draft.portal, density: e.target.value as ActivityView['portal']['density'] },
                    })
                  }
                >
                  <option value="compact">Compact</option>
                  <option value="comfortable">Comfortable</option>
                </select>
              </label>
            </div>
            <fieldset>
              <legend>Portal widgets and order</legend>
              <div className={styles.actions}>
                <Button
                  type="button"
                  className={buttonClass()}
                  onClick={() => setDraft({ ...draft, portal: personalPortalLayout() })}
                >
                  Use personal widgets
                </Button>
                <Button
                  type="button"
                  className={buttonClass()}
                  onClick={() => setDraft({ ...draft, portal: recommendedPortalLayout(true) })}
                >
                  Use all widgets
                </Button>
              </div>
              <ul className={styles.widgets}>
                {[...draft.portal.widgets, ...portalWidgetIds.filter((id) => !draft.portal.widgets.includes(id))].map(
                  (id) => {
                    const at = draft.portal.widgets.indexOf(id);
                    return (
                      <li key={id}>
                        <label className={styles.check}>
                          <input
                            type="checkbox"
                            checked={at >= 0}
                            onChange={(e) =>
                              setDraft({
                                ...draft,
                                portal: {
                                  ...draft.portal,
                                  widgets: e.target.checked
                                    ? [...draft.portal.widgets, id]
                                    : draft.portal.widgets.filter((v) => v !== id),
                                },
                              })
                            }
                          />
                          {portalWidgetCatalog[id].name}
                        </label>
                        <div className={styles.actions}>
                          <Button
                            type="button"
                            className={buttonClass()}
                            aria-label={`Move ${portalWidgetCatalog[id].name} up`}
                            disabled={at <= 0}
                            onClick={() => move(id, -1)}
                          >
                            Up
                          </Button>
                          <Button
                            type="button"
                            className={buttonClass()}
                            aria-label={`Move ${portalWidgetCatalog[id].name} down`}
                            disabled={at < 0 || at === draft.portal.widgets.length - 1}
                            onClick={() => move(id, 1)}
                          >
                            Down
                          </Button>
                        </div>
                      </li>
                    );
                  },
                )}
              </ul>
            </fieldset>
            <fieldset>
              <legend>Inbox filters</legend>
              <label>
                Saved alert category
                <select
                  value={draft.inbox.category}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      inbox: { ...draft.inbox, category: e.target.value as ActivityView['inbox']['category'] },
                    })
                  }
                >
                  {['all', 'assets', 'supply', 'market', 'operations'].map((v) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}
                </select>
              </label>
              <label className={styles.check}>
                <input
                  type="checkbox"
                  checked={draft.inbox.urgent}
                  onChange={(e) => setDraft({ ...draft, inbox: { ...draft.inbox, urgent: e.target.checked } })}
                />
                Saved urgent only
              </label>
              <label className={styles.check}>
                <input
                  type="checkbox"
                  checked={draft.inbox.showMuted}
                  onChange={(e) => setDraft({ ...draft, inbox: { ...draft.inbox, showMuted: e.target.checked } })}
                />
                Saved show muted alerts
              </label>
            </fieldset>
            <fieldset>
              <legend>Task filters and planning context</legend>
              <div className={styles.grid}>
                <label>
                  Saved entry status
                  <select
                    value={draft.tasks.status}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        tasks: { ...draft.tasks, status: e.target.value as ActivityView['tasks']['status'] },
                      })
                    }
                  >
                    {['open', 'completed', 'all'].map((v) => (
                      <option key={v} value={v}>
                        {v}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Saved entry type
                  <select
                    value={draft.tasks.kind}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        tasks: { ...draft.tasks, kind: e.target.value as ActivityView['tasks']['kind'] },
                      })
                    }
                  >
                    {['all', 'task', 'project', 'goal'].map((v) => (
                      <option key={v} value={v}>
                        {v}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <label>
                Saved task search
                <input
                  type="search"
                  maxLength={200}
                  value={draft.tasks.query}
                  onChange={(e) => setDraft({ ...draft, tasks: { ...draft.tasks, query: e.target.value } })}
                />
              </label>
              <label>
                Project or goal context
                <select
                  value={draft.planning?.id ?? ''}
                  onChange={(e) => {
                    const plan = plans.find((p) => p.id === e.target.value);
                    setDraft({ ...draft, planning: plan ? { kind: plan.kind, id: plan.id } : null });
                  }}
                >
                  <option value="">No planning context</option>
                  {missingPlan && (
                    <option value={draft.planning!.id}>Unavailable planning reference — choose again</option>
                  )}
                  {plans.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.kind}: {p.title}
                    </option>
                  ))}
                </select>
              </label>
              <p>
                Context shows the selected project/goal and its directly linked tasks. Deleted or unavailable context
                shows an explicit empty state, never unrelated plans. References are checked again when saving and
                opening tasks.
              </p>
            </fieldset>
            <Button
              className={buttonClass({ variant: 'primary' })}
              disabled={blocked || !record || Boolean(missingPlan)}
            >
              Save activity view
            </Button>
          </fieldset>
        </form>
      </Card>
      <h2 ref={savedHeading} tabIndex={-1}>
        Saved setups ({record?.views.length ?? 'unknown'} / 12)
      </h2>
      {record?.views.length === 0 && (
        <p>No views saved yet. Create a named activity above or capture current settings from a workspace.</p>
      )}
      <div className={styles.grid}>
        {record?.views.map((view) => (
          <Card className={cardClass({ className: styles.card })} aria-label={view.name} key={view.id}>
            <h3>{view.name}</h3>
            <p>
              {view.portal.widgets.length} widgets · {view.portal.density} ·{' '}
              {view.map === 'DeepDesert' ? 'Deep Desert' : 'Hagga Basin'}
              {view.planning ? ` · ${view.planning.kind} context` : ''}
            </p>
            <div className={styles.actions}>
              {(['portal', 'inbox', 'tasks'] as const).map((area) => (
                <Link key={area} prefetch={false} href={activityHref(area, view.id)}>
                  Open {area}
                </Link>
              ))}
            </div>
            <div className={styles.actions}>
              <Button className={buttonClass()} disabled={busy || blocked} onClick={() => edit(view)}>
                Edit view
              </Button>
              <Button className={buttonClass()} disabled={busy || blocked} onClick={() => edit(view, true)}>
                Duplicate view
              </Button>
              <Button className={buttonClass()} disabled={busy || blocked} onClick={() => setDeleting(view)}>
                Review view deletion
              </Button>
            </div>
            {deleting?.id === view.id && (
              <div className={styles.notice}>
                <p>Delete {view.name}? This removes this saved setup, not its tasks or game data. There is no undo.</p>
                <div className={styles.actions}>
                  <Button
                    className={buttonClass({ variant: 'primary' })}
                    disabled={busy || blocked || !record.revision}
                    onClick={() =>
                      void send({ action: 'delete', revision: record.revision!, id: view.id, confirmed: true })
                    }
                  >
                    Confirm delete view
                  </Button>
                  <Button className={buttonClass()} disabled={busy} onClick={() => setDeleting(null)}>
                    Keep view
                  </Button>
                </div>
              </div>
            )}
          </Card>
        ))}
      </div>
      <p>
        Settings expire after 90 days of inactivity. Existing exports or open tabs may contain copies. Use the personal
        data center to export or erase all saved view settings. A deleted view URL never selects another account or
        falls back silently.
      </p>
      <Link href="/personal-data" prefetch={false}>
        Personal data controls
      </Link>
    </section>
  );
}
