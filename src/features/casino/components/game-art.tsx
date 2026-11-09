import type { GameId } from '../contracts';

/**
 * Original geometric emblems for the six game cards. Plain SVG, no animation, drawn for this project
 * (no official artwork or protected marks).
 */
export function GameArt({ id, className = 'size-20' }: { id: GameId; className?: string }) {
  return (
    <svg
      viewBox="0 0 96 96"
      className={`${className} text-spice-300`}
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="square"
      aria-hidden="true"
      focusable="false"
    >
      {id === 'emperors-hand' && (
        <>
          <rect x="22" y="14" width="40" height="58" />
          <rect x="34" y="24" width="40" height="58" />
          <path d="M54 44l8 8-8 8-8-8z" />
        </>
      )}
      {id === 'spice-wheel' && (
        <>
          <circle cx="48" cy="48" r="34" />
          <circle cx="48" cy="48" r="12" />
          <path d="M48 14v20M48 62v20M14 48h20M62 48h20M24 24l14 14M58 58l14 14M72 24L58 38M38 58L24 72" />
        </>
      )}
      {id === 'fate-of-arrakis' && (
        <>
          <path d="M48 10l32 18v40L48 86 16 68V28z" />
          <path d="M16 28l32 18 32-18M48 46v40" />
        </>
      )}
      {id === 'spice-harvest' && (
        <>
          <path d="M8 70c14-14 26-14 40 0s26 14 40 0" />
          <path d="M8 56c14-14 26-14 40 0s26 14 40 0" />
          <path d="M48 12l8 14-8 14-8-14z" />
        </>
      )}
      {id === 'ornithopter-run' && (
        <>
          <path d="M14 52h42l14-8 10 8-12 6H30z" />
          <path d="M26 46L12 28M42 46L34 26M58 46l-4-20" />
          <path d="M6 76h84M18 84h60" />
        </>
      )}
      {id === 'great-houses' && (
        <>
          <circle cx="48" cy="48" r="32" />
          <path d="M48 20l12 12-12 24-12-24z" />
          <path d="M60 66a16 16 0 1 1 0-16 11 11 0 1 0 0 16z" />
        </>
      )}
    </svg>
  );
}
