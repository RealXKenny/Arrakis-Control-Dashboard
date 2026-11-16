'use client';
import { useEffect, useState } from 'react';
import { StatusBadge } from '../../../components/ui/status-badge';
import { freshnessLabel, type ReadingHealth } from '../freshness';
import styles from './data-freshness.module.css';
export function DataFreshness({
  label,
  health,
  successLabel = 'Last successful read',
}: {
  label: string;
  health: ReadingHealth;
  successLabel?: string;
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const update = () => {
      if (!document.hidden) setNow(Date.now());
    };
    const timer = window.setInterval(update, 5000);
    document.addEventListener('visibilitychange', update);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', update);
    };
  }, []);
  return (
    <div className={styles.root} role="group" aria-label={label}>
      <p className={styles.state}>
        <StatusBadge
          tone={
            health.phase === 'outage'
              ? 'danger'
              : freshnessLabel(health, now) === 'Fresh'
                ? 'success'
                : health.partial || freshnessLabel(health, now).startsWith('Stale')
                  ? 'warning'
                  : 'neutral'
          }
        >
          {freshnessLabel(health, now)}
        </StatusBadge>
      </p>
      <dl>
        <div>
          <dt>{successLabel}</dt>
          <dd>
            {health.lastSuccessAt ? (
              <time dateTime={health.lastSuccessAt}>{health.lastSuccessAt} (UTC)</time>
            ) : (
              'No successful read recorded in this view'
            )}
          </dd>
        </div>
        <div>
          <dt>Last attempt (device time)</dt>
          <dd>
            {health.lastAttemptAt ? (
              <time dateTime={health.lastAttemptAt}>{health.lastAttemptAt} (UTC)</time>
            ) : (
              'Not attempted in this view'
            )}
          </dd>
        </div>
      </dl>
    </div>
  );
}
