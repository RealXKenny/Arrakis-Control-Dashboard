import { useEffect, useState } from 'react';

export function useServerStatus() {
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
      const timeout = setTimeout(() => controller.abort(), 10000);
      try {
        const response = await fetch('/api/server/status', { cache: 'no-store', signal: controller.signal });
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
    const timer = setInterval(load, 30000);
    document.addEventListener('visibilitychange', load);
    return () => {
      disposed = true;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', load);
      request?.abort();
    };
  }, []);
  return { activePlayers, totalPlayers, serverStatusError };
}
