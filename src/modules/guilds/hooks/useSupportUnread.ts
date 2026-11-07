import { useEffect, useState } from 'react';
import { guildRequest, GuildRequestError } from '../client-api';

export default function useSupportUnread({
  guildId,
  guildIds = [],
  admin = false,
  enabled = true,
}: {
  guildId?: string;
  guildIds?: string[];
  admin?: boolean;
  enabled?: boolean;
}) {
  const [counts, setCounts] = useState<{ total: number; guilds: Record<string, number> }>({ total: 0, guilds: {} });
  const ids = [...new Set(guildIds)].join(',');
  useEffect(() => {
    if (!enabled || (!admin && !guildId)) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    let polling = false;
    let stopped = false;
    let refresh = false;
    let version = 0;
    let failures = 0;
    setCounts({ total: 0, guilds: {} });
    async function poll() {
      if (polling || stopped || controller.signal.aborted) return;
      clearTimeout(timer);
      if (!document.hidden) {
        polling = true;
        refresh = false;
        const revision = version;
        try {
          const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]);
          if (admin) {
            const batches: string[][] = [[]];
            for (const id of ids ? ids.split(',') : []) {
              let batch = batches[batches.length - 1];
              if (batch.length === 20 || [...batch, id].join(',').length > 1500) batches.push((batch = []));
              batch.push(id);
            }
            const results = await Promise.all(
              batches.map((batch) =>
                guildRequest(
                  `/api/admin/guild-support-status${batch.length ? `?guildIds=${encodeURIComponent(batch.join(','))}` : ''}`,
                  undefined,
                  signal,
                ),
              ),
            );
            if (!controller.signal.aborted && revision === version)
              setCounts({
                total: results.at(-1).total,
                guilds: Object.assign({}, ...results.map((result) => result.guilds)),
              });
          } else {
            const result = await guildRequest(
              `/api/guilds/${encodeURIComponent(guildId!)}/support/status`,
              undefined,
              signal,
            );
            if (!controller.signal.aborted && revision === version)
              setCounts({ total: result.unreadCount, guilds: { [guildId!]: result.unreadCount } });
          }
          failures = 0;
        } catch (error) {
          if (!controller.signal.aborted) {
            failures++;
            if (error instanceof GuildRequestError && [401, 403, 404].includes(error.status)) {
              stopped = true;
              setCounts({ total: 0, guilds: {} });
            }
          }
        } finally {
          polling = false;
        }
      }
      if (!controller.signal.aborted && !stopped)
        timer = setTimeout(poll, refresh ? 0 : Math.min(30000, 10000 * 2 ** Math.min(failures, 2)));
    }
    const visible = () => {
      if (!document.hidden) void poll();
    };
    const changed = (event: Event) => {
      const detail = (event as CustomEvent<{ admin: boolean; guildId: string; unreadCount: number }>).detail;
      if (!detail || detail.admin !== admin || (!admin && detail.guildId !== guildId)) return;
      version++;
      refresh = true;
      setCounts((current) => ({
        ...current,
        guilds: { ...current.guilds, [detail.guildId]: detail.unreadCount },
        ...(!admin ? { total: detail.unreadCount } : {}),
      }));
      void poll();
    };
    document.addEventListener('visibilitychange', visible);
    window.addEventListener('guild-support-read', changed);
    void poll();
    return () => {
      controller.abort();
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', visible);
      window.removeEventListener('guild-support-read', changed);
    };
  }, [guildId, ids, admin, enabled]);
  return enabled ? counts : { total: 0, guilds: {} };
}
