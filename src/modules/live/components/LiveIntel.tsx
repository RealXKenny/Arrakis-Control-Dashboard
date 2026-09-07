import { useEffect, useState } from 'react';
import type { LiveReading } from '../types';
import styles from './live.module.css';

export default function LiveIntel() {
  const [reading, setReading] = useState<LiveReading | null>(null);
  const [error, setError] = useState('');
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    let disposed = false;
    let active: AbortController | null = null;
    let expired = false;
    async function load() {
      if (active || expired || document.visibilityState === 'hidden') return;
      setNow(Date.now());
      active = new AbortController();
      const timeout = setTimeout(() => active?.abort(), 10000);
      try {
        const response = await fetch('/api/live', { cache: 'no-store', signal: active.signal });
        if (response.status === 401) expired = true;
        if (!response.ok) throw new Error();
        const data: LiveReading = await response.json();
        if (!disposed) {
          setReading(data);
          setError('');
        }
      } catch {
        if (!disposed) {
          setError(
            expired
              ? 'Session expired. Sign in again to read live intel.'
              : 'Live intel unavailable. Retrying shortly.',
          );
          if (expired) setReading(null);
        }
      } finally {
        clearTimeout(timeout);
        active = null;
      }
    }
    void load();
    const timer = setInterval(load, 15000);
    document.addEventListener('visibilitychange', load);
    return () => {
      disposed = true;
      clearInterval(timer);
      active?.abort();
      document.removeEventListener('visibilitychange', load);
    };
  }, []);
  const connected = reading?.connectedAt && now - reading.connectedAt < 45000;
  return (
    <div className={styles.live}>
      {error && <p role="alert">{error}</p>}
      <section>
        <h2>Observer link</h2>
        <p role="status">
          {!reading
            ? 'Loading…'
            : !reading.enabled
              ? 'Collector not configured'
              : connected
                ? 'Collector connected'
                : 'Collector disconnected or stale'}
        </p>
        <p>
          Read-only observations · Up to 24 hours of bounded history. Capture gaps and retention limits can omit events.
        </p>
      </section>
      {(['status', ...(reading?.admin ? ['chat', 'activity', 'observation'] : [])] as const).map((kind) => {
        const events = reading?.events.filter((event) => event.kind === kind) ?? [];
        const visible =
          kind === 'status'
            ? events.filter((event, index) => events.findIndex((other) => other.source === event.source) === index)
            : events;
        return (
          <section key={kind}>
            <h2>
              {kind === 'status'
                ? 'Instance readings'
                : kind === 'chat'
                  ? 'Chat observations'
                  : kind === 'activity'
                    ? 'Player activity'
                    : 'Other observed traffic'}
            </h2>
            <p>
              {kind === 'status'
                ? 'Numeric states are unmapped. An observed message does not establish server health.'
                : kind === 'activity'
                  ? 'Map and authority transitions are not verified login or logout events.'
                  : kind === 'chat'
                    ? 'Admin-only feed. Private channels are excluded.'
                    : 'Payloads without a confirmed schema are not decoded.'}
            </p>
            {!visible.length && <p>No retained observations yet.</p>}
            <div className={styles.feed}>
              {visible.map((event) => (
                <article key={event.id}>
                  <header>
                    <strong>{event.source}</strong>
                    <time dateTime={new Date(event.receivedAt).toISOString()}>
                      {new Date(event.receivedAt).toLocaleString()}
                    </time>
                  </header>
                  <dl>
                    {Object.entries(event.fields).map(([key, value]) => (
                      <div key={key}>
                        <dt>{key}</dt>
                        <dd>{value === null ? 'Not reported' : String(value)}</dd>
                      </div>
                    ))}
                  </dl>
                </article>
              ))}
            </div>
          </section>
        );
      })}
      {reading && !reading.admin && <p>Chat and player activity require a configured administrator role.</p>}
    </div>
  );
}
