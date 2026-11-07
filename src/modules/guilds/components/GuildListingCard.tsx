import Image from 'next/image';
import { useId, useState } from 'react';
import type { GuildRequirementListing } from '../requirements';
import GuildApplicationForm from './GuildApplicationForm';
import type { GuildApplicationSummary } from '../applications';
import css from '../styles/listings.module.css';

export default function GuildListingCard({
  entry,
  summary,
  onUpdate,
}: {
  entry: GuildRequirementListing;
  summary?: GuildApplicationSummary | null;
  onUpdate: (guildId: string, value: GuildApplicationSummary | null) => void;
}) {
  const [mode, setMode] = useState<'application' | 'status' | 'chat' | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const open = mode !== null;
  const [missingLogo, setMissingLogo] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const applicationId = useId();
  const titleId = useId();
  const detailsId = useId();
  const questionCount = entry.applicationQuestions?.length ?? 0;
  const initials = entry.guildName
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word[0])
    .join('')
    .toUpperCase();
  return (
    <article className={`${css.card} ${open || detailsOpen ? css.openCard : ''}`} aria-labelledby={titleId}>
      <div className={css.topline}>
        <span className={css.recruiting}>
          <span aria-hidden="true" />
          Recruiting
        </span>
        <span className={css.category}>Community guild</span>
      </div>
      <div className={css.identity}>
        {missingLogo ? (
          <span className={css.logoFallback} aria-hidden="true">
            {initials}
          </span>
        ) : (
          <Image
            className={css.logo}
            src={`/api/guilds/${encodeURIComponent(entry.guildId)}/logo?image=1`}
            alt={`${entry.guildName} logo`}
            width={72}
            height={72}
            unoptimized
            onError={() => setMissingLogo(true)}
          />
        )}
        <div className={css.heading}>
          <h3 id={titleId} title={entry.guildName}>
            {entry.guildName}
          </h3>
          <p>{questionCount ? 'Find your place. Join the team.' : 'Meet your next crew on Arrakis.'}</p>
        </div>
      </div>
      <div className={css.details} id={detailsId}>
        <h4>Joining requirements</h4>
        {summary && (
          <button className={css.detailLink} onClick={() => setDetailsOpen(!detailsOpen)}>
            {detailsOpen ? 'Less detail' : 'View details'}
          </button>
        )}
        <p className={detailsOpen ? css.fullText : css.preview}>{entry.requirements}</p>
        {detailsOpen && entry.contact && (
          <div className={css.contact}>
            <h4>How to join</h4>
            <p>{entry.contact}</p>
          </div>
        )}
      </div>
      <div className={css.footer}>
        <div className={css.meta}>
          <span>
            {summary ? `Application ${summary.status}` : questionCount ? 'Custom application' : 'Joining details'}
          </span>
          <span>
            {questionCount ? `${questionCount} ${questionCount === 1 ? 'question' : 'questions'}` : 'Guild recruitment'}
          </span>
        </div>
        <div className={css.actions}>
          {summary ? (
            <>
              <button
                className={css.secondary}
                aria-expanded={mode === 'status'}
                aria-controls={applicationId}
                onClick={() => {
                  setMode('status');
                  setRefreshKey((value) => value + 1);
                }}
              >
                Check status
              </button>
              <button
                className={`${css.primary} ${css.chatButton}`}
                aria-expanded={mode === 'chat'}
                aria-controls={applicationId}
                onClick={() => setMode('chat')}
              >
                Chat with reviewer
                {summary.unreadCount > 0 && (
                  <span className={css.unreadBadge} aria-label={`${summary.unreadCount} unread messages`}>
                    {summary.unreadCount > 99 ? '99+' : summary.unreadCount}
                  </span>
                )}
              </button>
            </>
          ) : (
            <>
              <button
                className={css.secondary}
                aria-expanded={detailsOpen}
                aria-controls={detailsId}
                onClick={() => setDetailsOpen(!detailsOpen)}
              >
                {detailsOpen ? 'Less detail' : 'View details'}
              </button>
              <button
                className={css.primary}
                aria-expanded={open}
                aria-controls={applicationId}
                onClick={() => setMode(open ? null : 'application')}
              >
                {open ? 'Close application' : summary === undefined ? 'Check application' : 'Apply to guild'}
              </button>
            </>
          )}
        </div>
      </div>
      {open && (
        <div id={applicationId} className={css.applicationPanel}>
          {summary && (
            <button className={css.detailLink} onClick={() => setMode(null)}>
              Close panel
            </button>
          )}
          <GuildApplicationForm
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
