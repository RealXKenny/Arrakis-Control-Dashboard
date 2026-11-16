import { useEffect, useRef, useState } from 'react';
import { Button } from '../../../components/ui/button';
import type { Assignment, Progress, Totals } from '../contracts';

export function AutomaticProgress({
  seasonId,
  manualClaims = false,
  onProgress,
}: {
  seasonId: string;
  manualClaims?: boolean;
  onProgress: (
    progress: Progress,
    totals: Totals,
    plan: { assignment: Assignment | null; objectives: Record<string, number> },
  ) => void;
}) {
  const manual = useRef(manualClaims),
    latest = useRef(onProgress),
    [state, setState] = useState('Checking verified game progress…'),
    [retry, setRetry] = useState(0);
  useEffect(() => {
    latest.current = onProgress;
    manual.current = manualClaims;
  }, [onProgress, manualClaims]);
  useEffect(() => {
    let disposed = false,
      running = false,
      timer: ReturnType<typeof setTimeout>,
      request: AbortController;
    const sync = async () => {
      if (disposed || running || document.hidden) return;
      running = true;
      request = new AbortController();
      const timeout = setTimeout(() => request.abort(), 15000);
      try {
        const response = await fetch('/api/v2/seasons', {
          method: 'POST',
          cache: 'no-store',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'sync', seasonId }),
          signal: request.signal,
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error ?? 'Progress verification unavailable.');
        if (!disposed && !document.hidden) {
          latest.current(data.progress, data.totals, {
            assignment: data.assignment ?? null,
            objectives: data.tracking.objectives ?? {},
          });
          setState(
            `New game progress tracked since ${data.tracking.startedAt}: ${data.tracking.newGameXp} game XP; ${data.tracking.newJourneys} new journey objectives. ${manual.current ? 'Claim unlocked rewards yourself with Claim Reward.' : 'Unlocked cosmetics are claimed automatically.'}`,
          );
        }
        if (!disposed) timer = setTimeout(sync, 60000);
      } catch (e) {
        if (!disposed)
          setState(
            document.hidden
              ? 'Automatic progress paused while this page is hidden.'
              : `Progress sync stopped: ${e.message}. Refresh to reconcile safely.`,
          );
      } finally {
        clearTimeout(timeout);
        running = false;
      }
    };
    const visibility = () => {
      clearTimeout(timer);
      if (document.hidden) {
        request?.abort();
        setState('Automatic progress paused while this page is hidden.');
      } else {
        void sync();
      }
    };
    document.addEventListener('visibilitychange', visibility);
    void sync();
    return () => {
      disposed = true;
      clearTimeout(timer);
      request?.abort();
      document.removeEventListener('visibilitychange', visibility);
    };
  }, [seasonId, retry]);
  return (
    <div className="season-editor-card">
      <p aria-live="polite">{state}</p>
      <Button className="season-button" onClick={() => setRetry((n) => n + 1)}>
        Refresh automatic progress
      </Button>
    </div>
  );
}
