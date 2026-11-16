'use client';
import { useEffect, useRef, useState } from 'react';
import { activityEnvelopeSchema, activityRecordSchema, type ActivityDefinition, type ActivityRecord } from '../model';
import styles from './activity-views.module.css';
export function ActivityCapture({ definition }: { definition: ActivityDefinition }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [record, setRecord] = useState<ActivityRecord | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const request = useRef<AbortController | null>(null);
  useEffect(() => () => request.current?.abort(), []);
  async function run(save: boolean) {
    if (request.current) return;
    const controller = new AbortController();
    request.current = controller;
    const timer = setTimeout(() => controller.abort('timeout'), 10000);
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const response = await fetch('/api/v2/activity-views', {
        method: save ? 'POST' : 'GET',
        cache: 'no-store',
        signal: controller.signal,
        headers: save ? { 'Content-Type': 'application/json' } : undefined,
        body: save
          ? JSON.stringify({
              action: 'save',
              revision: record!.revision,
              view: { ...definition, id: crypto.randomUUID(), name },
            })
          : undefined,
      });
      if (!response.ok)
        throw new Error('Saved view change could not be confirmed. Reload saved views before trying again.');
      const raw: unknown = await response.json();
      const next = save
        ? activityRecordSchema.parse((raw as { record?: unknown }).record)
        : activityEnvelopeSchema.parse(raw).record;
      if (controller.signal.aborted) return;
      setRecord(next);
      setMessage(
        save
          ? 'Current settings saved as a new activity view. Manage views to customize the other workspaces.'
          : 'Saved views loaded. Choose a unique name.',
      );
      if (save) {
        setName('');
        setOpen(false);
      }
    } catch {
      if (!controller.signal.aborted || controller.signal.reason === 'timeout') {
        setRecord(null);
        setError('Save/read could not be confirmed and may have completed. Reload saved views before trying again.');
      }
    } finally {
      clearTimeout(timer);
      if (request.current === controller) request.current = null;
      if (!controller.signal.aborted || controller.signal.reason === 'timeout') setBusy(false);
    }
  }
  return (
    <div className={styles.root} role="region" aria-label="Capture activity settings">
      <button
        className="btn btn-secondary"
        disabled={busy}
        onClick={() => {
          setOpen((v) => !v);
          if (!open) void run(false);
        }}
      >
        Save current settings as activity
      </button>
      {message && <p role="status">{message}</p>}
      {error && <p role="alert">{error}</p>}
      {open && (
        <form
          className={styles.card}
          onSubmit={(e) => {
            e.preventDefault();
            if (record && !busy) void run(true);
          }}
        >
          <p>
            Captures this workspace&apos;s filters or widgets, with the saved activity&apos;s other settings when one is
            open. Normal workspaces start with defaults for the other sections. Unsaved task/editor text and source
            readings are excluded.
          </p>
          <label>
            New activity name
            <input maxLength={60} required value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <div className={styles.actions}>
            <button className="btn btn-primary" disabled={busy || !record || !name.trim()}>
              Create from current settings
            </button>
            <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => void run(false)}>
              Reload saved views
            </button>
            <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => setOpen(false)}>
              Cancel capture
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
