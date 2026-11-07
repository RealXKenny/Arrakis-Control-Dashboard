'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, useTransition } from 'react';
import { Trend } from './parts/Trend';
import { ui } from './ui';

const REFRESH_MS = 30_000;

/**
 * Refreshes the server-rendered overview in place: a manual button plus a visible-tab timer.
 * `router.refresh()` keeps the last render on screen if a refresh fails.
 */
export function OverviewRefresh() {
  const router = useRouter();
  const [pending, start] = useTransition();
  useEffect(() => {
    const timer = setInterval(() => {
      if (!document.hidden) start(() => router.refresh());
    }, REFRESH_MS);
    return () => clearInterval(timer);
  }, [router]);
  return (
    <button type="button" disabled={pending} onClick={() => start(() => router.refresh())}>
      {pending ? 'Refreshing…' : 'Refresh statistics'}
    </button>
  );
}

/** Session-local trend lines: each fresh server reading appends one point (last 20 kept). */
export function OverviewTrends({
  observedAt,
  online,
  cpu,
}: {
  observedAt: string;
  online: number | null;
  cpu: number | null;
}) {
  const [history, setHistory] = useState([{ observedAt, online, cpu }]);
  const last = useRef(observedAt);
  useEffect(() => {
    if (last.current === observedAt) return;
    last.current = observedAt;
    setHistory((current) => [...current, { observedAt, online, cpu }].slice(-20));
  }, [observedAt, online, cpu]);
  return (
    <div className={ui.trendGrid}>
      <Trend label="Online player trend" values={history.map((entry) => entry.online)} />
      <Trend label="CPU usage trend" values={history.map((entry) => entry.cpu)} />
    </div>
  );
}
