import Image from 'next/image';
import { useId, useState } from 'react';
import type { GuildRequirementListing } from '../requirements';
import GuildApplicationForm from './GuildApplicationForm';
import css from '../styles/requirements.module.css';

export default function GuildListingCard({ entry }: { entry: GuildRequirementListing }) {
  const [open, setOpen] = useState(false);
  const [missingLogo, setMissingLogo] = useState(false);
  const applicationId = useId();
  return (
    <article className={css.card}>
      <div className={css.identity}>
        {missingLogo ? (
          <span className={css.logoFallback} aria-hidden="true">
            {entry.guildName.slice(0, 1).toUpperCase()}
          </span>
        ) : (
          <Image
            className={css.logo}
            src={`/api/guilds/${encodeURIComponent(entry.guildId)}/logo?image=1`}
            alt={`${entry.guildName} logo`}
            width={64}
            height={64}
            unoptimized
            onError={() => setMissingLogo(true)}
          />
        )}
        <h3>{entry.guildName}</h3>
      </div>
      <h4>Joining requirements</h4>
      <p>{entry.requirements}</p>
      {entry.contact && (
        <>
          <h4>How to join</h4>
          <p>{entry.contact}</p>
        </>
      )}
      <button aria-expanded={open} aria-controls={applicationId} onClick={() => setOpen(!open)}>
        {open ? 'Close application' : 'Apply to guild'}
      </button>
      {open && (
        <div id={applicationId}>
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
