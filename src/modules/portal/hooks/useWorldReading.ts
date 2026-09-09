import { cachedFetch } from '../../../lib/client-cache';
import { useEffect, useState } from 'react';
import type { WorldReading } from '../utils/world';
import { useSiteConfig } from '../../../components/SiteConfigProvider';

export function useWorldReading(map: string, partitionId: string | null = null) {
  const site = useSiteConfig();
  const [reading, setReading] = useState<WorldReading | null>(null);
  const [error, setError] = useState(false);
  const [expired, setExpired] = useState(false);
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    let disposed = false;
    let request: AbortController | null = null;
    let unauthorized = false;
    async function load() {
      if (disposed || request || unauthorized || document.visibilityState === 'hidden') return;
      request = new AbortController();
      const timeout = setTimeout(() => request?.abort(), site.requestTimeoutMs);
      try {
        const query = new URLSearchParams({ map });
        if (partitionId) query.set('partitionId', partitionId);
        const response = await cachedFetch(`/api/portal/world?${query}`, {
          signal: request.signal,
          onCached: async (cached) => {
            if (!disposed) setReading(await cached.json());
          },
        });
        if (response.status === 401) unauthorized = true;
        if (!response.ok) throw new Error('World reading unavailable');
        const data: WorldReading = await response.json();
        if (!disposed) {
          setReading(data);
          setError(false);
          setExpired(false);
        }
      } catch {
        if (!disposed) {
          setError(true);
          setExpired(unauthorized);
          if (unauthorized) setReading(null);
        }
      } finally {
        clearTimeout(timeout);
        request = null;
      }
    }
    void load();
    const polling = setInterval(load, site.pollIntervalMs);
    const clock = setInterval(() => {
      if (document.visibilityState !== 'hidden') setNow(Date.now());
    }, 10000);
    document.addEventListener('visibilitychange', load);
    return () => {
      disposed = true;
      clearInterval(polling);
      clearInterval(clock);
      document.removeEventListener('visibilitychange', load);
      request?.abort();
    };
  }, [map, partitionId, site.pollIntervalMs, site.requestTimeoutMs]);
  return {
    reading: reading?.map === map && (reading.partitionId ?? null) === partitionId ? reading : null,
    error,
    expired,
    now,
  };
}
