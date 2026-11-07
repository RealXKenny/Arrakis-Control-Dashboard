'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { batchGuildIds } from '../../../../features/guilds/details';
import { guildRequest } from '../../../../modules/guilds/client-api';
import type { GuildApplicationSummary } from '../../../../modules/guilds/applications';
import type { GuildRequirementListing } from '../../../../modules/guilds/requirements';
import { ListingCard } from './listing-card';

type Statuses = Record<string, GuildApplicationSummary | null>;

/**
 * The rendered page of listings. The server supplies each application status on first paint; this
 * component then refreshes them (every 10-30s while visible) so unread chat badges stay current.
 */
export function GuildDirectory({
  entries,
  initialStatuses,
}: {
  entries: GuildRequirementListing[];
  initialStatuses: Statuses;
}) {
  const [statuses, setStatuses] = useState<Statuses>(initialStatuses);
  const revision = useRef(0);
  const ids = entries.map((entry) => entry.guildId).join(',');

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
          const results = await Promise.all(
            batchGuildIds(ids.split(',')).map((batch) =>
              guildRequest(
                `/api/guilds/application-status?guildIds=${encodeURIComponent(batch.join(','))}`,
                undefined,
                AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]),
              ),
            ),
          );
          // A local edit (submit, mark-read) wins over a poll that started before it.
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
    timer = setTimeout(poll, 10000);
    return () => {
      controller.abort();
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', visible);
    };
  }, [ids]);

  return (
    <ul className="grid items-start gap-5 md:grid-cols-2 xl:grid-cols-3">
      {entries.map((entry) => (
        <li key={entry.guildId} className="min-w-0">
          <ListingCard entry={entry} summary={statuses[entry.guildId] ?? null} onUpdate={update} />
        </li>
      ))}
    </ul>
  );
}
