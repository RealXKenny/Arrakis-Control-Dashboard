import { useCallback, useEffect, useRef, useState } from 'react';
import type { GuildApplicationSummary } from '../applications';
import { guildRequest } from '../client-api';

export default function useApplicationStatuses(guildIds: string[]) {
  const [statuses, setStatuses] = useState<Record<string, GuildApplicationSummary | null>>({});
  const revision = useRef(0);
  const ids = guildIds.join(',');
  const update = useCallback((guildId: string, value: GuildApplicationSummary | null) => {
    revision.current++;
    setStatuses((current) => ({ ...current, [guildId]: value }));
  }, []);
  useEffect(() => {
    if (!ids) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    let polling = false;
    let failures = 0;
    async function poll() {
      if (polling || controller.signal.aborted) return;
      clearTimeout(timer);
      if (!document.hidden) {
        polling = true;
        const version = revision.current;
        try {
          const batches: string[][] = [[]];
          for (const id of ids.split(',')) {
            let batch = batches[batches.length - 1];
            if (batch.length === 20 || [...batch, id].join(',').length > 1500) batches.push((batch = []));
            batch.push(id);
          }
          const results = await Promise.all(
            batches.map((batch) =>
              guildRequest(
                `/api/guilds/application-status?guildIds=${encodeURIComponent(batch.join(','))}`,
                undefined,
                AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]),
              ),
            ),
          );
          if (!controller.signal.aborted && version === revision.current)
            setStatuses((current) => Object.assign({}, current, ...results.map((result) => result.applications)));
          failures = 0;
        } catch {
          failures++;
        } finally {
          polling = false;
        }
      }
      if (!controller.signal.aborted) timer = setTimeout(poll, Math.min(30000, 10000 * 2 ** Math.min(failures, 2)));
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
  }, [ids]);
  return { statuses, update };
}
