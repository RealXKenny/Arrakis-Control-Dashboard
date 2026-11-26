import { useEffect, useRef, useState } from 'react';
import { Button } from '../../../components/ui/button';
import type { Assignment, Progress, Totals } from '../contracts';
import { readSeasonResponse, retryDelayMs, SeasonResponseError } from '../response';

type SyncReply = {
  progress: Progress;
  totals: Totals;
  assignment?: Assignment | null;
  tracking: { startedAt: string; newGameXp: string; newJourneys: number; objectives?: Record<string, number> };
};

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
      failures = 0,
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
        const data = await readSeasonResponse<SyncReply>(response, 'Progress verification unavailable.');
        failures = 0;
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
        if (disposed) return;
        if (document.hidden) {
          setState('Automatic progress paused while this page is hidden.');
          return;
        }
        const reason =
          e instanceof Error && e.name === 'AbortError'
            ? 'the game took longer than 15 seconds to answer'
            : e instanceof Error
              ? e.message.replace(/\.$/, '')
              : 'Progress verification unavailable';
        // A timeout, network drop or proxy page is temporary: keep trying on a widening schedule instead of stopping.
        const retryable = !(e instanceof SeasonResponseError) || e.retryable;
        if (retryable) {
          failures++;
          const wait = retryDelayMs(failures);
          setState(`Progress sync paused: ${reason}. Trying again in ${Math.round(wait / 1000)} seconds.`);
          timer = setTimeout(sync, wait);
        } else {
          setState(`Progress sync stopped: ${reason}. Refresh to reconcile safely.`);
        }
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
