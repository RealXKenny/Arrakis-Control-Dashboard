import { useEffect, useState } from 'react';
import type { WorldReading } from '../utils/world';

export function useWorldReading(map: string) {
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
      const timeout = setTimeout(() => request?.abort(), 15000);
      try {
        const response = await fetch(`/api/portal/world?map=${map}`, { signal: request.signal, cache: 'no-store' });
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
    const polling = setInterval(load, 30000);
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
  }, [map]);
  return { reading: reading?.map === map ? reading : null, error, expired, now };
}
