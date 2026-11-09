export function HarvestTileArt({ kind }: { kind: 'cache' | 'hazard' | 'hidden' }) {
  return (
    <svg
      viewBox="0 0 60 60"
      className="mx-auto w-4/5"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.3"
    >
      {kind === 'cache' ? (
        <>
          <path d="M15 42l8-23 8 9 8-14 8 28-17 9z" fill="#b98037" />
          <path d="M23 19l7 32 9-37M15 42l16-14 16 14" stroke="#f0ce88" />
          <path d="M9 12v8m-4-4h8M46 6v8m-4-4h8" stroke="#8ab3bd" />
        </>
      ) : kind === 'hazard' ? (
        <>
          <ellipse cx="30" cy="31" rx="20" ry="15" fill="#42251b" />
          <ellipse cx="30" cy="31" rx="12" ry="9" fill="#17130e" />
          <path d="M11 28l10 3-8 8 12-4 5 11 4-12 12 5-7-9 10-4-14 1-5-11-4 12z" stroke="#dcad6f" />
        </>
      ) : (
        <>
          <path d="M6 36q14-15 28 0t20 0M6 44q14-12 28 0t20 0" stroke="#b7946244" />
          <path d="M30 13v12m-6-6h12" stroke="#b7946266" />
        </>
      )}
    </svg>
  );
}
