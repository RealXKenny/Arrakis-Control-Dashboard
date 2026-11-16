'use client';

import { useEffect, useState } from 'react';
import { Card } from '../../../components/ui/card';
import { projectRestartQueue, type RestartEntry } from '../restart-queue';

type Reading = { entries: RestartEntry[]; serverTime: number; observedAt: number; received: number };

export function RestartQueue() {
  const [reading, setReading] = useState<Reading | null>(null);
  const [message, setMessage] = useState('Checking restart information…');
  const [clock, setClock] = useState(0);
  useEffect(() => {
    let stopped = false;
    let active: AbortController | null = null;
    const refresh = async () => {
      if (document.hidden || active) return;
      const controller = new AbortController();
      active = controller;
      let timedOut = false;
      const timeout = setTimeout(() => {
        timedOut = true;
        controller.abort();
      }, 8000);
      try {
        const response = await fetch('/api/v2/monitoring/restart-queue', {
          cache: 'no-store',
          signal: controller.signal,
        });
        const value: unknown = await response.json();
        if (!response.ok || !value || typeof value !== 'object') throw new Error('Unavailable');
        const data = value as Record<string, unknown>;
        const entries = projectRestartQueue({ state: { entries: data.entries } });
        if (
          !entries ||
          typeof data.serverTime !== 'number' ||
          !Number.isFinite(data.serverTime) ||
          typeof data.observedAt !== 'number' ||
          !Number.isFinite(data.observedAt)
        )
          throw new Error('Invalid response');
        if (!stopped) {
          const received = performance.now();
          setReading({ entries, serverTime: data.serverTime, observedAt: data.observedAt, received });
          setClock(received);
          setMessage('');
        }
      } catch {
        if (!stopped && (!controller.signal.aborted || timedOut)) {
          setReading(null);
          setMessage('Restart information is unavailable.');
        }
      } finally {
        clearTimeout(timeout);
        if (active === controller) active = null;
      }
    };
    const visibility = () => {
      if (document.hidden) {
        active?.abort();
        setReading(null);
        setMessage('Restart information is paused while this page is hidden.');
      } else void refresh();
    };
    void refresh();
    const updates = setInterval(() => void refresh(), 20000);
    const ticks = setInterval(() => setClock(performance.now()), 1000);
    document.addEventListener('visibilitychange', visibility);
    return () => {
      stopped = true;
      active?.abort();
      clearInterval(updates);
      clearInterval(ticks);
      document.removeEventListener('visibilitychange', visibility);
    };
  }, []);
  const now = reading ? reading.serverTime + Math.max(0, clock - reading.received) : 0;
  return (
    <Card as="section" className="panel mb-6 p-6" aria-labelledby="restart-queue-heading">
      <h2 id="restart-queue-heading" className="text-lg">
        Active restart queue
      </h2>
      {message ? (
        <p role="status" className="mt-3 text-sm text-sand-400">
          {message}
        </p>
      ) : null}
      {reading && (
        <>
          <p className="mt-3 text-sm text-sand-400">
            Confirmed Console queue only. Daily and IP-change restarts may not appear here.
          </p>
          {reading.entries.length === 0 ? (
            <p className="mt-3 text-sm">No active queued restarts were reported.</p>
          ) : (
            <ul className="mt-3 space-y-3">
              {reading.entries.map((entry) => {
                const seconds = Math.max(0, Math.ceil((entry.restartAt - now) / 1000));
                return (
                  <li key={entry.id} className="text-sm">
                    <strong>{entry.target === 'battlegroup' ? 'All servers' : entry.mapLabel}</strong>{' '}
                    {entry.status === 'restarting'
                      ? 'is restarting.'
                      : seconds
                        ? `may restart in ${Math.ceil(seconds / 60)} min.`
                        : 'is awaiting a queue update.'}{' '}
                    Active play may be interrupted. Scheduled time: {new Date(entry.restartAt).toLocaleString()}.
                  </li>
                );
              })}
            </ul>
          )}
          <p className="mt-3 text-xs text-sand-500">Last checked {new Date(reading.observedAt).toLocaleString()}.</p>
        </>
      )}
    </Card>
  );
}
