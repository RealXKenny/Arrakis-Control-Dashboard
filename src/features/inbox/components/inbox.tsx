'use client';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { categoryNames, inboxCategories, inboxViewSchema, type InboxCategory, type InboxView } from '../model';
import styles from './inbox.module.css';
import {
  mutedReason,
  notificationEnvelopeSchema,
  type NotificationRecord,
  type NotificationInput,
} from '../preferences';
import { NotificationSettings } from './notification-settings';
import { DataFreshness } from '../../monitoring/components/data-freshness';
import {
  beginCheck,
  emptyHealth,
  failedRead,
  sourceHealth,
  successfulRead,
  type ScopedHealth,
} from '../../monitoring/freshness';

export function Inbox() {
  const [data, setData] = useState<InboxView | null>(null);
  const [health, setHealth] = useState(emptyHealth);
  const [sourceHistory, setSourceHistory] = useState<Record<string, ScopedHealth>>({});
  const [category, setCategory] = useState<InboxCategory | 'all'>('all');
  const [urgent, setUrgent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [preferences, setPreferences] = useState<NotificationRecord | null>(null);
  const [checkedAt, setCheckedAt] = useState(0);
  const [showMuted, setShowMuted] = useState(false);
  const [controlsBusy, setControlsBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [snoozeMinutes, setSnoozeMinutes] = useState<15 | 60 | 480 | 1440>(60);
  const mutation = useRef<AbortController | null>(null);
  async function control(input: NotificationInput): Promise<boolean> {
    if (mutation.current || request.current) return false;
    const controller = new AbortController();
    mutation.current = controller;
    setControlsBusy(true);
    setError('');
    setMessage('');
    const timeout = setTimeout(() => controller.abort('timeout'), 10000);
    try {
      const response = await fetch('/api/v2/inbox/preferences', {
        method: 'POST',
        cache: 'no-store',
        signal: controller.signal,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
      const raw: unknown = await response.json();
      if (!response.ok)
        throw new Error(
          response.status === 409
            ? 'Notification settings changed in another tab. Reload saved settings before trying again. Your draft is kept.'
            : 'Notification change could not be confirmed. Reload saved settings before trying again.',
        );
      const parsed = notificationEnvelopeSchema.safeParse(raw);
      if (!parsed.success)
        throw new Error('Notification change could not be confirmed. Reload saved settings before trying again.');
      if (controller.signal.aborted) return false;
      setPreferences(parsed.data.record);
      setCheckedAt(Date.parse(parsed.data.checkedAt));
      setMessage('Notification controls saved.');
      return true;
    } catch (failure) {
      if (!controller.signal.aborted || controller.signal.reason === 'timeout')
        setError(
          controller.signal.reason === 'timeout'
            ? 'Notification change timed out. Reload saved settings before trying again.'
            : failure instanceof Error
              ? failure.message
              : 'Notification controls are unavailable.',
        );
      return false;
    } finally {
      clearTimeout(timeout);
      if (mutation.current === controller) mutation.current = null;
      if (!controller.signal.aborted || controller.signal.reason === 'timeout') setControlsBusy(false);
    }
  }
  const request = useRef<AbortController | null>(null);
  async function refresh() {
    if (request.current || mutation.current) return;
    const controller = new AbortController();
    request.current = controller;
    const attemptedAt = new Date().toISOString();
    setHealth((previous) => beginCheck(previous));
    setSourceHistory((previous) =>
      Object.fromEntries(
        Object.entries(previous).map(([key, value]) => [
          key,
          { ...value, phase: value.phase === 'unsupported' ? 'unsupported' : 'checking', lastAttemptAt: attemptedAt },
        ]),
      ),
    );
    setBusy(true);
    setError('');
    // Clear private details immediately: a failed refresh must not preserve stale guild access.
    setMessage('');
    setData(null);
    const deadline = setTimeout(() => controller.abort('timeout'), 45000);
    let accessDenied = false;
    try {
      const response = await fetch('/api/v2/inbox', { cache: 'no-store', signal: controller.signal });
      if (!response.ok) {
        accessDenied = [401, 403, 409].includes(response.status);
        throw new Error(
          response.status === 401
            ? 'Your session ended. Sign in again.'
            : 'Inbox could not be checked. Try again shortly.',
        );
      }
      const body: unknown = await response.json();
      const parsed = inboxViewSchema.safeParse((body as { data?: unknown })?.data);
      const settings = notificationEnvelopeSchema.safeParse((body as { notifications?: unknown })?.notifications);
      if (!parsed.success || !settings.success)
        throw new Error('Inbox returned an unreadable response. Try again shortly.');
      if (!controller.signal.aborted) {
        setData(parsed.data);
        setHealth((previous) =>
          successfulRead(
            previous,
            parsed.data.checkedAt,
            parsed.data.sources.some((source) => source.status === 'partial' || source.status === 'unavailable'),
          ),
        );
        setSourceHistory((previous) =>
          Object.fromEntries(
            parsed.data.sources.map((source) => [
              source.category,
              sourceHealth(previous[source.category], source, attemptedAt),
            ]),
          ),
        );
        setPreferences(settings.data.record);
        setCheckedAt(Date.parse(settings.data.checkedAt));
      }
    } catch (failure) {
      if (!controller.signal.aborted || controller.signal.reason === 'timeout') {
        setHealth((previous) => failedRead(previous, accessDenied));
        setSourceHistory((previous) =>
          accessDenied
            ? {}
            : Object.fromEntries(
                Object.entries(previous).map(([key, value]) => [
                  key,
                  { ...value, phase: value.phase === 'unsupported' ? 'unsupported' : 'outage' },
                ]),
              ),
        );
      }
      if (!controller.signal.aborted || controller.signal.reason === 'timeout')
        setError(
          controller.signal.reason === 'timeout'
            ? 'Inbox check timed out. Refresh to try again.'
            : failure instanceof Error
              ? failure.message
              : 'Inbox is unavailable.',
        );
    } finally {
      clearTimeout(deadline);
      if (request.current === controller) request.current = null;
      if (!controller.signal.aborted || controller.signal.reason === 'timeout') setBusy(false);
    }
  }
  useEffect(() => {
    void refresh();
    const hide = () => {
      if (document.hidden) {
        request.current?.abort();
        mutation.current?.abort();
        mutation.current = null;
        setControlsBusy(false);
        request.current = null;
        setData(null);
        setHealth((previous) => ({ ...previous, phase: 'paused' }));
        setSourceHistory({});
        setBusy(false);
      }
    };
    document.addEventListener('visibilitychange', hide);
    return () => {
      request.current?.abort();
      mutation.current?.abort();
      mutation.current = null;
      request.current = null;
      document.removeEventListener('visibilitychange', hide);
    };
  }, []);
  const alerts =
    data?.alerts.filter(
      (alert) =>
        (category === 'all' || alert.category === category) &&
        (!urgent || alert.priority === 'urgent') &&
        (showMuted || (preferences && !mutedReason(alert, preferences, checkedAt))),
    ) ?? [];
  return (
    <section className={styles.root} aria-label="Actionable inbox">
      <div className={styles.toolbar}>
        <p>
          Review reported needs, then act in the source workspace. Checking this inbox never moves resources or changes
          a sign-up.
        </p>
        <button className="btn btn-secondary min-h-11" disabled={busy || controlsBusy} onClick={() => void refresh()}>
          {busy ? 'Checking sources…' : 'Refresh inbox'}
        </button>
      </div>
      <div className={styles.filters}>
        <label>
          Alert category
          <select value={category} onChange={(e) => setCategory(e.target.value as InboxCategory | 'all')}>
            <option value="all">All categories</option>
            {inboxCategories.map((id) => (
              <option key={id} value={id}>
                {categoryNames[id]}
              </option>
            ))}
          </select>
        </label>
        <label className={styles.check}>
          <input type="checkbox" checked={urgent} onChange={(e) => setUrgent(e.target.checked)} />
          Urgent only
        </label>
        <label className={styles.check}>
          <input type="checkbox" checked={showMuted} onChange={(e) => setShowMuted(e.target.checked)} />
          Show muted alerts
        </label>
        <label>
          Snooze duration
          <select
            value={snoozeMinutes}
            onChange={(e) => setSnoozeMinutes(Number(e.target.value) as typeof snoozeMinutes)}
          >
            <option value={15}>15 minutes</option>
            <option value={60}>1 hour</option>
            <option value={480}>8 hours</option>
            <option value={1440}>24 hours</option>
          </select>
        </label>
      </div>
      {error && (
        <p role="alert" className={styles.notice}>
          {error}
        </p>
      )}
      {message && (
        <p className={styles.notice} aria-live="polite">
          {message}
        </p>
      )}
      <p role="status" className={styles.notice}>
        {busy
          ? 'Checking your authorized sources.'
          : data
            ? `${alerts.length} actionable alerts shown. Sources checked ${new Date(data.checkedAt).toLocaleString()}. Readings may be cached for up to 15 seconds; this is not an atomic game snapshot.`
            : 'No current inbox reading.'}
      </p>
      <DataFreshness label="Inbox response freshness" health={health} successLabel="Last successful inbox response" />
      {data && preferences && (
        <>
          {!alerts.length && (
            <p className={styles.notice}>
              No actionable alerts match this view. Check source coverage below; missing and unsupported readings are
              not an all-clear.
            </p>
          )}
          <div className={styles.alerts}>
            {alerts.map((alert) => (
              <article className={styles.card} key={alert.id} aria-label={alert.title}>
                <p className={styles.eyebrow}>
                  {categoryNames[alert.category]} · {alert.priority === 'urgent' ? 'Urgent' : 'Needs attention'}
                </p>
                <h2>{alert.title}</h2>
                <p>{alert.detail}</p>
                {mutedReason(alert, preferences, checkedAt) && <p>{mutedReason(alert, preferences, checkedAt)}</p>}
                <Link href={alert.href} className={styles.link}>
                  {alert.action} →
                </Link>
                <div className={styles.filters}>
                  <button
                    className="btn btn-secondary min-h-11"
                    disabled={controlsBusy}
                    onClick={() => void control({ action: 'review', revision: preferences.revision, id: alert.id })}
                  >
                    Reviewed
                  </button>
                  <button
                    className="btn btn-secondary min-h-11"
                    disabled={controlsBusy}
                    onClick={() =>
                      void control({
                        action: 'snooze',
                        revision: preferences.revision,
                        id: alert.id,
                        minutes: snoozeMinutes,
                      })
                    }
                  >
                    Snooze
                  </button>
                  <button
                    className="btn btn-secondary min-h-11"
                    disabled={controlsBusy || !alert.fingerprint}
                    onClick={() =>
                      void control({
                        action: 'dismiss',
                        revision: preferences.revision,
                        id: alert.id,
                        fingerprint: alert.fingerprint!,
                      })
                    }
                  >
                    Dismiss
                  </button>
                  {preferences.states.some((s) => s.id === alert.id) && (
                    <button
                      className="btn btn-secondary min-h-11"
                      disabled={controlsBusy}
                      onClick={() => void control({ action: 'restore', revision: preferences.revision, id: alert.id })}
                    >
                      Restore alert
                    </button>
                  )}
                </div>
              </article>
            ))}
          </div>
          <NotificationSettings
            record={preferences}
            busy={controlsBusy || busy}
            onSave={(config) => control({ action: 'configure', revision: preferences.revision, config })}
            onReload={() => void refresh()}
          />
        </>
      )}
      <div className={styles.sources} aria-label="Source coverage">
        {inboxCategories.map((id) => {
          const source = data?.sources.find((value) => value.category === id);
          return (
            <div key={id} className={styles.source}>
              <h2>
                {categoryNames[id]} · {(source?.status ?? sourceHistory[id]?.phase ?? 'idle').replaceAll('-', ' ')}
              </h2>
              {source && <p>{source.detail}</p>}
              <DataFreshness
                label={`${categoryNames[id]} source freshness`}
                health={sourceHistory[id] ?? emptyHealth()}
              />
              {id === 'market' && (
                <Link href="/market" className={styles.link}>
                  Browse current market
                </Link>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
