'use client';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  portalWidgetIds,
  portalWidgetCatalog,
  portalLayoutRecordSchema,
  personalPortalLayout,
  recommendedPortalLayout,
  type PortalLayout,
  type PortalLayoutRecord,
  type PortalWidgetId,
} from '../layout';
import styles from './portal-widgets.module.css';
import { ActivityCapture } from '../../activity-views/components/activity-capture';
import { defaultActivity, type ActivityView } from '../../activity-views/model';

export function PortalWidgets({
  panels,
  initialRecord,
  recommended,
  settingsAvailable,
  activity = null,
  map = 'HaggaBasin',
}: {
  panels: Record<PortalWidgetId, ReactNode>;
  initialRecord: PortalLayoutRecord | null;
  recommended: PortalLayout;
  settingsAvailable: boolean;
  activity?: ActivityView | null;
  map?: 'HaggaBasin' | 'DeepDesert';
}) {
  const [saved, setSaved] = useState<PortalLayoutRecord | null>(initialRecord);
  const [draft, setDraft] = useState(activity?.portal ?? initialRecord?.layout ?? recommended);
  const [editing, setEditing] = useState(false);
  const [available, setAvailable] = useState(settingsAvailable);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(
    settingsAvailable || activity
      ? ''
      : 'Layout settings are unavailable. Showing the recommended view. Reload settings before saving.',
  );
  const [message, setMessage] = useState('');
  const request = useRef<AbortController | null>(null);
  useEffect(() => () => request.current?.abort(), []);
  const changed = JSON.stringify(draft) !== JSON.stringify(activity?.portal ?? saved?.layout ?? recommended);
  function update(layout: PortalLayout, note = 'Layout preview updated. Save to keep these changes.') {
    setDraft(layout);
    setMessage(note);
  }
  function move(id: PortalWidgetId, delta: number) {
    const ids = [...draft.widgets];
    const from = ids.indexOf(id);
    const to = from + delta;
    if (from < 0 || to < 0 || to >= ids.length) return;
    [ids[from], ids[to]] = [ids[to], ids[from]];
    update(
      { ...draft, widgets: ids },
      `${portalWidgetCatalog[id].name} moved to position ${to + 1}. Save to keep this order.`,
    );
  }
  async function persist(reload: boolean) {
    if (activity) return;
    if (busy) return;
    setBusy(true);
    setError('');
    setMessage('');
    const controller = new AbortController();
    request.current = controller;
    const deadline = setTimeout(() => controller.abort('timeout'), 10000);
    try {
      const response = await fetch('/api/v2/portal/layout', {
        method: reload ? 'GET' : 'POST',
        cache: 'no-store',
        headers: reload ? undefined : { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: reload ? undefined : JSON.stringify({ revision: saved?.revision ?? null, layout: draft }),
      });
      const data: unknown = await response.json();
      const result = data as { record?: unknown; error?: unknown };
      if (!response.ok)
        throw new Error(typeof result?.error === 'string' ? result.error : 'Portal settings could not be saved.');
      const parsed = portalLayoutRecordSchema.safeParse(result?.record);
      if (result?.record !== null && (!parsed.success || !parsed.data.revision))
        throw new Error('Portal settings could not be read. Reload the saved layout before trying again.');
      if (!reload && result?.record === null)
        throw new Error('Save could not be confirmed. Reload the saved layout before trying again.');
      const record = parsed.success ? parsed.data : null;
      if (controller.signal.aborted) return;
      setSaved(record);
      setDraft(record?.layout ?? recommended);
      setAvailable(true);
      setMessage(reload ? 'Saved layout loaded.' : 'Portal layout saved.');
    } catch (failure) {
      if (controller.signal.reason === 'timeout')
        setError('The request timed out. Reload the saved layout before trying again.');
      if (!controller.signal.aborted)
        setError(failure instanceof Error ? failure.message : 'Portal settings are unavailable.');
    } finally {
      clearTimeout(deadline);
      if (!controller.signal.aborted || controller.signal.reason === 'timeout') setBusy(false);
    }
  }
  const rows = [...draft.widgets, ...portalWidgetIds.filter((id) => !draft.widgets.includes(id))];
  return (
    <div
      className={`${styles.root} ${draft.density === 'compact' ? styles.compact : ''}`}
      data-portal-density={draft.density}
    >
      <ActivityCapture definition={{ ...(activity ?? defaultActivity()), portal: draft, map }} />
      {activity && (
        <p className="text-sm text-sand-300">
          Activity widgets are shown below. Changes are local previews; capture a new view or edit the saved definition
          in Activity views. Your normal layout is unchanged.
        </p>
      )}
      <section className={styles.customizer} aria-label="Portal layout">
        <div className={styles.toolbar}>
          <div>
            <p className="eyebrow">Your portal</p>
            <p className="text-sm text-sand-300">
              {draft.density === 'compact' ? 'Compact layout' : 'Comfortable layout'} · {draft.widgets.length} widgets
              {changed ? ' · Unsaved changes' : ''}
            </p>
          </div>
          <div className={styles.actions}>
            <button
              className={styles.button}
              disabled={busy}
              onClick={() => {
                update(personalPortalLayout());
                setEditing(true);
              }}
            >
              Personal view
            </button>
            <button
              className={styles.button}
              disabled={busy}
              onClick={() => {
                update(recommendedPortalLayout(true));
                setEditing(true);
              }}
            >
              Full overview
            </button>
            <button
              className={styles.button}
              aria-expanded={editing}
              aria-controls={editing ? 'portal-layout-editor' : undefined}
              onClick={() => setEditing((v) => !v)}
            >
              Customize widgets
            </button>
          </div>
        </div>
        {error && (
          <p role="alert" className={styles.notice}>
            {error}
          </p>
        )}
        {message && (
          <p role="status" className={styles.notice}>
            {message}
          </p>
        )}
        {editing && (
          <div id="portal-layout-editor" className={styles.editor}>
            <p className="text-sm text-sand-300">
              Choose what appears and use Move up or Move down to arrange your briefing. Preview changes below, then
              save. Layouts are private to your dashboard account.
            </p>
            <div className={styles.density}>
              <label htmlFor="portal-panel-density">Panel density</label>
              <select
                id="portal-panel-density"
                value={draft.density}
                disabled={busy}
                onChange={(event) => update({ ...draft, density: event.target.value as PortalLayout['density'] })}
              >
                <option value="comfortable">Comfortable</option>
                <option value="compact">Compact</option>
              </select>
            </div>
            <ul className={styles.list} aria-label="Widget settings">
              {rows.map((id) => {
                const selected = draft.widgets.includes(id);
                const index = draft.widgets.indexOf(id);
                return (
                  <li key={id} className={styles.setting}>
                    <label>
                      <input
                        type="checkbox"
                        checked={selected}
                        disabled={busy}
                        onChange={() =>
                          update({
                            ...draft,
                            widgets: selected ? draft.widgets.filter((value) => value !== id) : [...draft.widgets, id],
                          })
                        }
                      />
                      <span>
                        <strong>{portalWidgetCatalog[id].name}</strong>
                        <small>{portalWidgetCatalog[id].description}</small>
                      </span>
                    </label>
                    {selected && (
                      <div className={styles.actions}>
                        <button
                          className={styles.button}
                          disabled={busy || index === 0}
                          aria-label={`Move ${portalWidgetCatalog[id].name} up`}
                          onClick={() => move(id, -1)}
                        >
                          ↑ Move up
                        </button>
                        <button
                          className={styles.button}
                          disabled={busy || index === draft.widgets.length - 1}
                          aria-label={`Move ${portalWidgetCatalog[id].name} down`}
                          onClick={() => move(id, 1)}
                        >
                          ↓ Move down
                        </button>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
            <div className={styles.actions}>
              <button
                className={`${styles.button} ${styles.primary}`}
                disabled={Boolean(activity) || busy || !available || !changed}
                onClick={() => persist(false)}
              >
                Save layout
              </button>
              <button
                className={styles.button}
                disabled={busy || !changed}
                onClick={() =>
                  update(activity?.portal ?? saved?.layout ?? recommended, 'Unsaved layout changes discarded.')
                }
              >
                Discard changes
              </button>
              <button className={styles.button} disabled={busy} onClick={() => update(recommended)}>
                Reset to recommended
              </button>
              <button className={styles.button} disabled={busy || Boolean(activity)} onClick={() => persist(true)}>
                Reload saved layout
              </button>
            </div>
          </div>
        )}
      </section>
      {!draft.widgets.length && (
        <p className={styles.empty}>
          All widgets are hidden. Use Customize widgets or choose a preset to bring them back.
        </p>
      )}
      <div className={styles.grid} role="region" aria-label="Your portal widgets">
        {draft.widgets.map((id) => (
          <div className={`${styles.widget} ${styles[id]}`} key={id} data-portal-widget={id}>
            {panels[id]}
          </div>
        ))}
      </div>
    </div>
  );
}
