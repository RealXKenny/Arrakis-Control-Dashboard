'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Keep a shared, server-cached reading current without page reloads.
 *
 * - Starts from server-rendered data, so opening a page costs no extra request.
 * - Checks back at `intervalMs` only while the tab is visible; a hidden tab makes no requests at all, and becoming
 *   visible again checks once if the last check is older than the interval.
 * - A failed check keeps the last good reading on screen and reports `failed`; it never blanks the view.
 * - Every check goes to the dashboard's own cached endpoint, so many open tabs never multiply upstream traffic.
 */
export function useSharedReading<T>(
  url: string | null,
  options: {
    initial: T | null;
    intervalMs: number;
    parse: (body: unknown) => T | null;
    /** Skip the first fetch when the initial value already matches `url`. `parse` must be a stable function. */
    initialMatchesUrl?: boolean;
  },
) {
  const { intervalMs, parse } = options;
  const [data, setData] = useState<T | null>(options.initial);
  const [loading, setLoading] = useState(options.initial === null && url !== null);
  const [failed, setFailed] = useState(false);
  const lastCheck = useRef(0);
  const skipFirst = useRef(Boolean(options.initialMatchesUrl && options.initial !== null));
  const active = useRef<AbortController | null>(null);

  const check = useCallback(
    async (target: string) => {
      if (typeof document !== 'undefined' && document.hidden) return;
      active.current?.abort();
      const controller = new AbortController();
      active.current = controller;
      const timeout = setTimeout(() => controller.abort(), 15_000);
      try {
        const response = await fetch(target, { cache: 'no-store', signal: controller.signal });
        const body: unknown = await response.json().catch(() => null);
        const parsed = response.ok ? parse(body) : null;
        if (controller.signal.aborted && active.current !== controller) return;
        lastCheck.current = Date.now();
        if (parsed === null) setFailed(true);
        else {
          setData(parsed);
          setFailed(false);
        }
      } catch {
        if (active.current === controller) setFailed(true);
      } finally {
        clearTimeout(timeout);
        if (active.current === controller) {
          active.current = null;
          setLoading(false);
        }
      }
    },
    [parse],
  );

  useEffect(() => {
    if (!url) return;
    if (skipFirst.current) {
      // The server already rendered this reading; the first check waits for the normal interval.
      skipFirst.current = false;
      lastCheck.current = Date.now();
    } else if (!lastCheck.current) {
      setLoading(true);
      void check(url);
    }
    const timer = setInterval(
      () => {
        if (Date.now() - lastCheck.current >= intervalMs) void check(url);
      },
      Math.min(intervalMs, 30_000),
    );
    const visibility = () => {
      if (document.hidden) active.current?.abort();
      else if (Date.now() - lastCheck.current >= intervalMs) void check(url);
    };
    document.addEventListener('visibilitychange', visibility);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', visibility);
      active.current?.abort();
      // A new URL (filter or page change) must fetch once even if the previous one was checked recently.
      lastCheck.current = 0;
    };
  }, [url, intervalMs, check]);

  const retry = useCallback(() => {
    if (url) void check(url);
  }, [url, check]);

  return { data, loading, failed, retry };
}
