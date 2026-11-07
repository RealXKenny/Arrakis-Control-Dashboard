'use client';

import Image from 'next/image';
import { useId, useState } from 'react';
import { guildInitials } from '../../../../features/guilds/details';
import type { GuildApplicationSummary } from '../../../../modules/guilds/applications';
import type { GuildRequirementListing } from '../../../../modules/guilds/requirements';
import { UnreadPill } from '../../_components/form-controls';
import { ApplicationPanel } from './application-panel';

type Mode = 'application' | 'status' | 'chat' | null;

export function ListingCard({
  entry,
  summary,
  onUpdate,
}: {
  entry: GuildRequirementListing;
  summary: GuildApplicationSummary | null;
  onUpdate: (guildId: string, value: GuildApplicationSummary | null) => void;
}) {
  const [mode, setMode] = useState<Mode>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [missingLogo, setMissingLogo] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const panelId = useId();
  const titleId = useId();
  const detailsId = useId();
  const questionCount = entry.applicationQuestions?.length ?? 0;
  const open = mode !== null;

  return (
    <article aria-labelledby={titleId} className="panel flex h-full flex-col gap-5 p-5">
      <div className="flex items-center justify-between gap-3">
        <span className="inline-flex items-center gap-2 border border-status-ok/50 px-2 py-1 font-mono text-[0.625rem] font-semibold uppercase tracking-widest text-status-ok">
          <span aria-hidden="true" className="size-1.5 rounded-full bg-status-ok" />
          Recruiting
        </span>
        <span className="font-mono text-[0.625rem] uppercase tracking-widest text-sand-600">Community guild</span>
      </div>

      <div className="flex items-center gap-4">
        {missingLogo ? (
          <span
            aria-hidden="true"
            className="flex size-[4.5rem] shrink-0 items-center justify-center border border-spice-500/40 bg-obsidian-900 font-mono text-xl font-bold text-spice-300"
          >
            {guildInitials(entry.guildName)}
          </span>
        ) : (
          <Image
            src={`/api/guilds/${encodeURIComponent(entry.guildId)}/logo?image=1`}
            alt={`${entry.guildName} logo`}
            width={72}
            height={72}
            unoptimized
            onError={() => setMissingLogo(true)}
            className="size-[4.5rem] shrink-0 border border-sand-200/15 bg-obsidian-900 object-contain"
          />
        )}
        <div className="min-w-0">
          <h3 id={titleId} title={entry.guildName} className="truncate text-base tracking-wide">
            {entry.guildName}
          </h3>
          <p className="mt-1 text-xs text-sand-500">
            {questionCount ? 'Find your place. Join the team.' : 'Meet your next crew on Arrakis.'}
          </p>
        </div>
      </div>

      <div id={detailsId}>
        <h4 className="eyebrow mb-2">Joining requirements</h4>
        <p className={`whitespace-pre-wrap break-words text-sm text-sand-300 ${detailsOpen ? '' : 'line-clamp-4'}`}>
          {entry.requirements}
        </p>
        {detailsOpen && entry.contact && (
          <div className="mt-4">
            <h4 className="eyebrow mb-2">How to join</h4>
            <p className="whitespace-pre-wrap break-words text-sm text-sand-300">{entry.contact}</p>
          </div>
        )}
      </div>

      <div className="mt-auto flex flex-col gap-4">
        <p className="flex flex-wrap justify-between gap-x-4 font-mono text-[0.6875rem] uppercase tracking-widest text-sand-500">
          <span>
            {summary ? `Application ${summary.status}` : questionCount ? 'Custom application' : 'Joining details'}
          </span>
          <span>
            {questionCount ? `${questionCount} ${questionCount === 1 ? 'question' : 'questions'}` : 'Guild recruitment'}
          </span>
        </p>
        <div className="flex flex-wrap gap-3">
          {summary ? (
            <>
              <button
                type="button"
                className="btn btn-ghost"
                aria-expanded={mode === 'status'}
                aria-controls={panelId}
                onClick={() => {
                  setMode('status');
                  setRefreshKey((value) => value + 1);
                }}
              >
                Check status
              </button>
              <button
                type="button"
                className="btn btn-primary"
                aria-expanded={mode === 'chat'}
                aria-controls={panelId}
                onClick={() => setMode('chat')}
              >
                Chat with reviewer
                <UnreadPill count={summary.unreadCount} />
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                className="btn btn-ghost"
                aria-expanded={detailsOpen}
                aria-controls={detailsId}
                onClick={() => setDetailsOpen(!detailsOpen)}
              >
                {detailsOpen ? 'Less detail' : 'View details'}
              </button>
              <button
                type="button"
                className="btn btn-primary"
                aria-expanded={open}
                aria-controls={panelId}
                onClick={() => setMode(open ? null : 'application')}
              >
                {open ? 'Close application' : 'Apply to guild'}
              </button>
            </>
          )}
        </div>
      </div>

      {open && (
        <div id={panelId}>
          {summary && (
            <button type="button" className="mb-2 text-xs text-spice-300 underline" onClick={() => setMode(null)}>
              Close panel
            </button>
          )}
          <ApplicationPanel
            guildId={entry.guildId}
            guildName={entry.guildName}
            questions={entry.applicationQuestions ?? []}
            showChat={mode === 'chat'}
            refreshKey={refreshKey}
            onApplication={(application) =>
              onUpdate(
                entry.guildId,
                application
                  ? {
                      id: application.id,
                      status: application.status,
                      unreadCount: summary?.id === application.id ? summary.unreadCount : 0,
                    }
                  : null,
              )
            }
            onUnreadCount={(unreadCount) => {
              if (summary) onUpdate(entry.guildId, { ...summary, unreadCount });
            }}
          />
        </div>
      )}
    </article>
  );
}
