import { cachedFetch } from '../../../lib/client-cache';
import { useEffect, useState } from 'react';
import { useSiteConfig } from '../../../components/SiteConfigProvider';

export function useServerStatus() {
  const site = useSiteConfig();
  const [activePlayers, setActivePlayers] = useState<number | null>(null);
  const [totalPlayers, setTotalPlayers] = useState<number | null>(null);
  const [serverStatusError, setServerStatusError] = useState(false);
  useEffect(() => {
    let request: AbortController | null = null;
    let disposed = false;
    async function load() {
      if (request || disposed || document.visibilityState === 'hidden') return;
      const controller = new AbortController();
      request = controller;
      const timeout = setTimeout(() => controller.abort(), site.requestTimeoutMs);
      try {
        const response = await cachedFetch('/api/server/status', {
          signal: controller.signal,
          onCached: async (cached) => {
            const data = await cached.json();
            if (!disposed) {
              setActivePlayers(data.activePlayers ?? null);
              setTotalPlayers(data.totalPlayers ?? null);
            }
          },
        });
        if (!response.ok) throw new Error('Status unavailable');
        const data = await response.json();
        if (disposed) return;
        const count = (value: unknown) => (value != null && Number.isFinite(Number(value)) ? Number(value) : null);
        setActivePlayers(count(data.activePlayers));
        setTotalPlayers(count(data.totalPlayers));
        setServerStatusError(false);
      } catch {
        if (!disposed) {
          setServerStatusError(true);
          setActivePlayers(null);
          setTotalPlayers(null);
        }
      } finally {
        clearTimeout(timeout);
        request = null;
      }
    }
    void load();
    const timer = setInterval(load, site.pollIntervalMs);
    document.addEventListener('visibilitychange', load);
    return () => {
      disposed = true;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', load);
      request?.abort();
    };
  }, [site.pollIntervalMs, site.requestTimeoutMs]);
  return { activePlayers, totalPlayers, serverStatusError };
}
