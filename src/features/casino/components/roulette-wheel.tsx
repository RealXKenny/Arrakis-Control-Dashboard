import styles from './casino.module.css';

export const EUROPEAN_WHEEL = [
  0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7,
  28, 12, 35, 3, 26,
];

/** Pocket zero is centred at twelve o'clock; the ball uses the exact European pocket index. */
export function RouletteWheel({ landed, roundId }: { landed?: number; roundId?: string }) {
  const angle = landed === undefined ? 0 : (EUROPEAN_WHEEL.indexOf(landed) * 360) / 37;
  return (
    <div
      className={styles.rouletteWheel}
      role="img"
      aria-label={landed === undefined ? 'European single-zero roulette wheel' : `Wheel landed on ${landed}`}
    >
      <svg viewBox="0 0 300 300" aria-hidden="true">
        <circle cx="150" cy="150" r="146" fill="#352a1b" stroke="#c3a05c" strokeWidth="4" />
        <circle cx="150" cy="150" r="135" fill="#151b1a" stroke="#7d6037" strokeWidth="5" />
        <g key={`rotor-${roundId ?? 'idle'}`} className={landed === undefined ? undefined : styles.rotorSpin}>
          {EUROPEAN_WHEEL.map((number, i) => (
            <g key={number} transform={`rotate(${(i * 360) / 37} 150 150)`}>
              <path
                d="M139 19L141 48H159L161 19Z"
                fill={number === 0 ? '#316951' : i % 2 === 1 ? '#8c352c' : '#171b1d'}
                stroke="#c0a675"
                strokeWidth="0.6"
              />
              <text x="150" y="37" textAnchor="middle" fontSize="10" fill="#f3e8cf" fontFamily="serif">
                {number}
              </text>
              <path d="M141 48L145 83M159 48L155 83" stroke="#947747" strokeWidth="0.7" />
            </g>
          ))}
          <circle cx="150" cy="150" r="65" fill="#60472a" stroke="#c3a05c" strokeWidth="3" />
          <circle cx="150" cy="150" r="51" fill="#242b29" stroke="#b89759" />
          <path d="M150 112v76m-38-38h76" stroke="#b89759" strokeWidth="8" />
          <circle cx="150" cy="150" r="12" fill="#d8bd80" />
        </g>
        <g
          key={roundId ?? 'idle'}
          className={landed === undefined ? undefined : styles.ballSpin}
          style={{ ['--ball-angle' as string]: `${angle}deg` }}
        >
          <g transform={`rotate(${angle} 150 150)`}>
            <circle cx="150" cy="67" r="4.5" fill="#fff2d9" stroke="#a48f69" />
          </g>
        </g>
      </svg>
      <span className="font-mono text-xl text-sand-100">{landed ?? 'PLACE YOUR BETS'}</span>
    </div>
  );
}
