'use client';

import styles from './casino.module.css';

export const CARD_BACKS = ['Imperial Gold', 'Spice Horizon', 'Sandworm Sigil'] as const;
export type CardBack = (typeof CARD_BACKS)[number];
export const RANK_NAMES = [
  'Ace',
  'Two',
  'Three',
  'Four',
  'Five',
  'Six',
  'Seven',
  'Eight',
  'Nine',
  'Ten',
  'Jack',
  'Queen',
  'King',
];
const SUITS = ['spades', 'hearts', 'diamonds', 'clubs'];
const LABELS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
const PATHS = [
  'M0 -10 C-3 -6 -11 -3 -8 3 Q-5 8 -1 4 L-3 10 H3 L1 4 Q5 8 8 3 C11 -3 3 -6 0 -10Z',
  'M0 9 C-18 -3 -6 -15 0 -6 C6 -15 18 -3 0 9Z',
  'M0 -11 L8 0 0 11 -8 0Z',
  'M-2 4 C-14 9 -13 -6 -5 -4 C-11 -17 11 -17 5 -4 C13 -6 14 9 2 4 L4 10 H-4Z',
];
const PIPS: Record<number, number[][]> = {
  2: [
    [50, 34],
    [50, 106],
  ],
  3: [
    [50, 34],
    [50, 70],
    [50, 106],
  ],
  4: [
    [31, 34],
    [69, 34],
    [31, 106],
    [69, 106],
  ],
  5: [
    [31, 34],
    [69, 34],
    [50, 70],
    [31, 106],
    [69, 106],
  ],
  6: [
    [31, 34],
    [69, 34],
    [31, 70],
    [69, 70],
    [31, 106],
    [69, 106],
  ],
  7: [
    [31, 34],
    [69, 34],
    [50, 52],
    [31, 70],
    [69, 70],
    [31, 106],
    [69, 106],
  ],
  8: [
    [31, 34],
    [69, 34],
    [50, 52],
    [31, 70],
    [69, 70],
    [50, 88],
    [31, 106],
    [69, 106],
  ],
  9: [
    [31, 30],
    [69, 30],
    [31, 56],
    [69, 56],
    [50, 70],
    [31, 84],
    [69, 84],
    [31, 110],
    [69, 110],
  ],
  10: [
    [31, 30],
    [69, 30],
    [50, 43],
    [31, 56],
    [69, 56],
    [31, 84],
    [69, 84],
    [50, 97],
    [31, 110],
    [69, 110],
  ],
};

function Suit({ suit, x = 0, y = 0, scale = 1 }: { suit: number; x?: number; y?: number; scale?: number }) {
  return <path d={PATHS[suit]} transform={`translate(${x} ${y}) scale(${scale})`} fill="currentColor" />;
}

/** Twelve original engraved portraits: distinct headwear, faces, robes and ceremonial instruments. */
function Court({ rank, suit }: { rank: number; suit: number }) {
  const width = 13 + suit * 2;
  return (
    <g stroke="currentColor" strokeWidth="1.2" fill="none">
      <path d={`M24 65 L${50 - width} 44 Q50 ${30 + suit * 3} ${50 + width} 44 L76 65 L73 112 H27Z`} fill="#d4bf91" />
      <path
        d={`M${50 - width} 44 L50 ${rank === 12 ? 19 : rank === 11 ? 25 : 31} L${50 + width} 44Z`}
        fill="currentColor"
      />
      {rank === 12 ? (
        <path d="M33 33l-2-12 11 7 8-12 8 12 11-7-2 12z" fill="#b98c45" />
      ) : rank === 11 ? (
        <>
          <circle cx="50" cy="26" r="6" fill="#b98c45" />
          <path d="M35 40Q50 14 65 40" />
        </>
      ) : (
        <path d={`M28 43 Q40 ${13 + suit * 4} 72 35 L64 42`} />
      )}
      <path d={`M39 45 L${41 + suit} 62 Q50 72 61 60 L63 44 M42 50h4m9 0h4M51 51l-2 8h5m-8 4h9`} />
      <path d={`M27 91 L50 ${69 + suit * 3} 73 91 M31 108l38-26 M31 96l28 16 M50 74v38`} />
      {suit === 0 ? (
        <path d="M29 110V51l-4-10-4 10 4 59" />
      ) : suit === 1 ? (
        <path d="M68 108V76q-14-6-5-13 13-7 11 9" />
      ) : suit === 2 ? (
        <path d="M26 101l9-19 9 19-9 10z" fill="#b98c45" />
      ) : (
        <path d="M68 108V68m-8 6 8-14 8 14m-16 6h16" />
      )}
      <Suit suit={suit} x={50} y={96} scale={0.65} />
    </g>
  );
}

export function PlayingCard({
  id,
  back = 'Imperial Gold',
  selected = false,
  highlighted = false,
  disabled = false,
  dealing = true,
  faceUp = true,
  flipping = false,
}: {
  id: number | null;
  back?: CardBack;
  selected?: boolean;
  highlighted?: boolean;
  disabled?: boolean;
  dealing?: boolean;
  faceUp?: boolean;
  flipping?: boolean;
}) {
  const hidden = id === null || !faceUp;
  const rank = hidden ? 0 : id % 13;
  const suit = hidden ? 0 : Math.floor(id / 13) % 4;
  return (
    <span
      className={`${styles.playingCard} ${flipping ? styles.cardFlip : dealing ? styles.dealing : ''}`}
      data-selected={selected || highlighted}
      data-disabled={disabled || undefined}
      role="img"
      aria-label={
        hidden ? 'Face-down card' : `${rank > 0 && rank < 10 ? rank + 1 : RANK_NAMES[rank]} of ${SUITS[suit]}`
      }
    >
      <svg viewBox="0 0 100 140" aria-hidden="true" style={{ color: suit === 1 || suit === 2 ? '#963f32' : '#242c2d' }}>
        <rect
          x="1"
          y="1"
          width="98"
          height="138"
          rx="5"
          fill={hidden ? '#222a2c' : '#f3e8cf'}
          stroke="#bca574"
          strokeWidth="2"
        />
        <rect x="6" y="6" width="88" height="128" rx="2" fill="none" stroke="#bca574" strokeWidth="0.7" />
        {hidden ? (
          <g stroke="#bc9555" fill="none">
            {Array.from({ length: 7 }, (_, i) => (
              <path key={i} d={`M50 ${12 + i * 7} L88 70 50 ${128 - i * 7} 12 70Z`} />
            ))}
            {back === 'Spice Horizon' ? (
              <>
                <path d="M12 90Q38 50 88 82M12 105Q60 64 88 97" fill="#876943" />
                <circle cx="67" cy="44" r="9" stroke="#7fa5b7" />
              </>
            ) : back === 'Sandworm Sigil' ? (
              <>
                <ellipse cx="50" cy="70" rx="17" ry="29" />
                <path d="M38 48l12 13 12-13M34 60l16 13 16-13M34 77l16 13 16-13M40 92l10 9 10-9" />
              </>
            ) : (
              <path d="M50 40l18 30-18 30-18-30zM35 70h30M50 40v60" strokeWidth="2" />
            )}
          </g>
        ) : (
          <>
            {[false, true].map((flip) => (
              <g key={String(flip)} transform={flip ? 'rotate(180 50 70)' : undefined}>
                <text x="12" y="22" fontSize="15" fontFamily="Georgia" fontWeight="bold" fill="currentColor">
                  {LABELS[rank]}
                </text>
                <Suit suit={suit} x={17} y={32} scale={0.5} />
              </g>
            ))}
            {rank === 0 ? (
              <>
                <path d="M50 25L79 70 50 115 21 70Z" fill="none" stroke="#bca574" />
                <Suit suit={suit} x={50} y={70} scale={2.5} />
                <path d="M30 119h40m-35 4h30" stroke="#bca574" />
              </>
            ) : rank >= 10 ? (
              <Court rank={rank} suit={suit} />
            ) : (
              PIPS[rank + 1].map(([x, y], i) => (
                <g key={i} data-pip="true" transform={y > 70 ? `rotate(180 ${x} ${y})` : undefined}>
                  <Suit suit={suit} x={x} y={y} scale={0.8} />
                </g>
              ))
            )}
          </>
        )}
      </svg>
    </span>
  );
}
