import Image from 'next/image';
import { useId, useState } from 'react';
import type { GuildRequirementListing } from '../requirements';
import GuildApplicationForm from './GuildApplicationForm';
import css from '../styles/listings.module.css';

export default function GuildListingCard({ entry }: { entry: GuildRequirementListing }) {
  const [open, setOpen] = useState(false);
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
          <span>{questionCount ? 'Custom application' : 'Joining details'}</span>
          <span>
            {questionCount ? `${questionCount} ${questionCount === 1 ? 'question' : 'questions'}` : 'Guild recruitment'}
          </span>
        </div>
        <div className={css.actions}>
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
            onClick={() => setOpen(!open)}
          >
            {open ? 'Close application' : 'Apply to guild'}
            <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none">
              <path
                d={open ? 'M6 6l12 12M18 6 6 18' : 'M5 12h14m-6-6 6 6-6 6'}
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        </div>
      </div>
      {open && (
        <div id={applicationId} className={css.applicationPanel}>
          <GuildApplicationForm
            guildId={entry.guildId}
            guildName={entry.guildName}
            questions={entry.applicationQuestions ?? []}
          />
        </div>
      )}
    </article>
  );
}
