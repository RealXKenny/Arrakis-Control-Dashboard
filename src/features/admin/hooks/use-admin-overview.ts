import { useEffect, useState } from 'react';
import { guildRequest } from '../../guilds/client-api';
import type { AdminOverview } from '../overview';

export default function useAdminOverview(enabled: boolean) {
  const [data, setData] = useState<AdminOverview | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [revision, setRevision] = useState(0);
  const [history, setHistory] = useState<{ time: string; online: number | null; cpu: number | null }[]>([]);
  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    let polling = false;
    let failures = 0;
    async function poll() {
      if (polling || controller.signal.aborted) return;
      clearTimeout(timer);
      if (!document.hidden) {
        polling = true;
        setLoading(true);
        try {
          const value: AdminOverview = await guildRequest(
            '/api/v2/admin/overview',
            undefined,
            AbortSignal.any([controller.signal, AbortSignal.timeout(25000)]),
          );
          if (!controller.signal.aborted) {
            setData(value);
            setError('');
            failures = 0;
            const metric = (id: string) => {
              const result = value.metrics.find((entry) => entry.id === id)?.value;
              return typeof result === 'number' ? result : null;
            };
            setHistory((current) =>
              [...current, { time: value.observedAt, online: metric('online'), cpu: metric('cpu') }].slice(-20),
            );
          }
        } catch {
          if (!controller.signal.aborted) {
            setError('Unable to refresh administration statistics. The last successful reading is kept below.');
            failures++;
          }
        } finally {
          polling = false;
          if (!controller.signal.aborted) setLoading(false);
        }
      }
      if (!controller.signal.aborted) timer = setTimeout(poll, Math.min(120000, 30000 * 2 ** Math.min(failures, 2)));
    }
    const visible = () => {
      if (!document.hidden) void poll();
    };
    document.addEventListener('visibilitychange', visible);
    void poll();
    return () => {
      controller.abort();
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', visible);
    };
  }, [enabled, revision]);
  return { data, error, loading, history, refresh: () => setRevision((value) => value + 1) };
}
