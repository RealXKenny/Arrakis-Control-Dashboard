import Image from 'next/image';
import { artworkUrl, type Reward } from '../contracts';

export function RewardArt({ reward, seasonId }: { reward: Reward; seasonId?: string }) {
  if (reward.artwork && seasonId)
    return (
      <Image
        src={artworkUrl(seasonId, reward.artwork.id)}
        alt={reward.artwork.alt}
        width={180}
        height={158}
        className="season-art season-uploaded-art"
        unoptimized
      />
    );
  return (
    <svg
      viewBox="0 0 160 140"
      role="img"
      aria-label={`${reward.name} cosmetic artwork`}
      className={`season-art season-art-${reward.color}`}
    >
      <defs>
        <linearGradient id={`art-${reward.id}`} x2="0" y2="1">
          <stop stopColor="currentColor" stopOpacity=".3" />
          <stop offset="1" stopColor="currentColor" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d="M80 8 140 42v56l-60 34-60-34V42Z" fill={`url(#art-${reward.id})`} stroke="currentColor" opacity=".6" />
      <path d="m80 18 51 29v46l-51 29-51-29V47Z" fill="none" stroke="currentColor" opacity=".25" />
      {reward.motif === 'dune' && (
        <>
          <circle cx="100" cy="49" r="12" fill="currentColor" />
          <path d="m31 95 35-40 19 24 14-10 30 26Z" fill="none" stroke="currentColor" strokeWidth="3" />
        </>
      )}
      {reward.motif === 'star' && (
        <path
          d="m80 32 10 25 27 2-21 18 7 27-23-15-23 15 7-27-21-18 27-2Z"
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
        />
      )}
      {reward.motif === 'spire' && (
        <path
          d="m47 101 12-42 12 42M70 101 80 29l11 72M90 101l12-42 12 42M38 105h84"
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
        />
      )}
      {reward.motif === 'sun' && (
        <>
          <circle cx="80" cy="67" r="25" fill="none" stroke="currentColor" strokeWidth="3" />
          <path d="M40 93h80M48 101h64M80 27v-9M80 116v-9M40 67h-9M129 67h-9" stroke="currentColor" strokeWidth="2" />
        </>
      )}
      {reward.motif === 'wing' && (
        <path
          d="m80 93-9-31-34-17 12 26 22 12M80 93l9-31 34-17-12 26-22 12M80 46v47"
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
        />
      )}
      <path d="M15 44V31h20M125 31h20v13M15 98v13h20M125 111h20V98" stroke="currentColor" fill="none" opacity=".4" />
    </svg>
  );
}
