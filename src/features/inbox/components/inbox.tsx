'use client';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { categoryNames, inboxCategories, inboxViewSchema, type InboxCategory, type InboxView } from '../model';
import styles from './inbox.module.css';

export function Inbox() {
  const [data, setData] = useState<InboxView | null>(null);
  const [category, setCategory] = useState<InboxCategory | 'all'>('all');
  const [urgent, setUrgent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const request = useRef<AbortController | null>(null);
  async function refresh() {
    if (request.current) return;
    const controller = new AbortController();
    request.current = controller;
    setBusy(true);
    setError('');
    // Clear private details immediately: a failed refresh must not preserve stale guild access.
    setData(null);
    const deadline = setTimeout(() => controller.abort('timeout'), 45000);
    try {
      const response = await fetch('/api/v2/inbox', { cache: 'no-store', signal: controller.signal });
      if (!response.ok)
        throw new Error(
          response.status === 401
            ? 'Your session ended. Sign in again.'
            : 'Inbox could not be checked. Try again shortly.',
        );
      const body: unknown = await response.json();
      const parsed = inboxViewSchema.safeParse((body as { data?: unknown })?.data);
      if (!parsed.success) throw new Error('Inbox returned an unreadable response. Try again shortly.');
      if (!controller.signal.aborted) setData(parsed.data);
    } catch (failure) {
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
        request.current = null;
        setData(null);
        setBusy(false);
      }
    };
    document.addEventListener('visibilitychange', hide);
    return () => {
      request.current?.abort();
      request.current = null;
      document.removeEventListener('visibilitychange', hide);
    };
  }, []);
  const alerts =
    data?.alerts.filter(
      (alert) => (category === 'all' || alert.category === category) && (!urgent || alert.priority === 'urgent'),
    ) ?? [];
  return (
    <section className={styles.root} aria-label="Actionable inbox">
      <div className={styles.toolbar}>
        <p>
          Review reported needs, then act in the source workspace. Checking this inbox never moves resources or changes
          a sign-up.
        </p>
        <button className="btn btn-secondary min-h-11" disabled={busy} onClick={() => void refresh()}>
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
      </div>
      {error && (
        <p role="alert" className={styles.notice}>
          {error}
        </p>
      )}
      <p role="status" className={styles.notice}>
        {busy
          ? 'Checking your authorized sources.'
          : data
            ? `${alerts.length} actionable alerts shown. Sources checked ${new Date(data.checkedAt).toLocaleString()}. Readings may be cached for up to 15 seconds; this is not an atomic game snapshot.`
            : 'No current inbox reading.'}
      </p>
      {data && (
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
                <Link href={alert.href} className={styles.link}>
                  {alert.action} →
                </Link>
              </article>
            ))}
          </div>
          <div className={styles.sources} aria-label="Source coverage">
            {data.sources.map((source) => (
              <div key={source.category} className={styles.source}>
                <h2>
                  {categoryNames[source.category]} · {source.status.replaceAll('-', ' ')}
                </h2>
                <p>{source.detail}</p>
                {source.category === 'market' && (
                  <Link href="/market" className={styles.link}>
                    Browse current market
                  </Link>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
