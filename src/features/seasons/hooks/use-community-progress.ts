'use client';
import { useEffect, useRef, useState } from 'react';
import type { CommunityUpdate } from '../contracts';

/** One visible request at a time; failures keep confirmed totals and back off rather than inventing zero. */
export function useCommunityProgress(seasonId: string | undefined, onUpdate: (update: CommunityUpdate) => void) {
  const latest = useRef(onUpdate);
  const [connection, setConnection] = useState<'connecting' | 'live' | 'paused' | 'stale'>('connecting');
  useEffect(() => {
    latest.current = onUpdate;
  }, [onUpdate]);
  useEffect(() => {
    if (!seasonId) return;
    let disposed = false;
    let running = false;
    let delay = 15000;
    let resumeImmediately = false;
    let next: ReturnType<typeof setTimeout>;
    let request: AbortController | undefined;
    async function poll() {
      if (disposed || running) return;
      if (document.hidden) {
        setConnection('paused');
        return;
      }
      running = true;
      request = new AbortController();
      const deadline = setTimeout(() => request?.abort(), 5000);
      try {
        const response = await fetch(`/api/v2/seasons/${seasonId}/community`, {
          cache: 'no-store',
          signal: request.signal,
        });
        if (!response.ok) throw new Error('Community progress unavailable.');
        const update: CommunityUpdate = await response.json();
        if (!disposed && !document.hidden) {
          latest.current(update);
          setConnection('live');
          delay = 15000;
        }
      } catch {
        if (!disposed) {
          setConnection(document.hidden ? 'paused' : 'stale');
          delay = Math.min(delay * 2, 120000);
        }
      } finally {
        clearTimeout(deadline);
        running = false;
        if (!disposed && !document.hidden) next = setTimeout(poll, resumeImmediately ? 0 : delay);
        resumeImmediately = false;
      }
    }
    const visibility = () => {
      clearTimeout(next);
      if (document.hidden) {
        request?.abort();
        setConnection('paused');
      } else if (!running) void poll();
      else resumeImmediately = true;
    };
    document.addEventListener('visibilitychange', visibility);
    // Give the initial member view time to settle; no need to repeat its aggregates immediately.
    next = setTimeout(poll, 15000);
    return () => {
      disposed = true;
      clearTimeout(next);
      request?.abort();
      document.removeEventListener('visibilitychange', visibility);
    };
  }, [seasonId]);
  return connection;
}
