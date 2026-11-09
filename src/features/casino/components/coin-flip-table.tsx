'use client';

import { useState } from 'react';
import { ErrorBanner, Outcome, WagerField, netText, type TableProps } from './parts';
import styles from './casino.module.css';
import { useRound } from './use-casino';

const HOUSES = [
  { id: 'scarab', name: 'House Scarab' },
  { id: 'crescent', name: 'House Crescent' },
] as const;

function Emblem({ side }: { side: string }) {
  return (
    <svg
      viewBox="0 0 48 48"
      className="size-14"
      aria-hidden="true"
      focusable="false"
      fill="none"
      stroke="currentColor"
      strokeWidth="3"
    >
      {side === 'scarab' ? (
        <>
          <path d="M24 6l12 12-12 24L12 18z" />
          <path d="M24 6v36M12 18h24" />
        </>
      ) : (
        <path d="M32 8a18 18 0 1 0 0 32 14 14 0 1 1 0-32z" />
      )}
    </svg>
  );
}

export function CoinFlipTable({ game, paused, maxWager, onSettled }: TableProps) {
  const [side, setSide] = useState<'scarab' | 'crescent'>('scarab');
  const [wager, setWager] = useState('100');
  const { round, busy, error, start, reset, finished } = useRound(game.id, onSettled);
  const result = round?.settlement?.result as { landed?: string; won?: boolean } | undefined;
  const outcome =
    finished && round?.status === 'settled' ? netText(BigInt(round.wager), round.settlement?.payout) : null;
  const landed = result?.landed ?? side;

  return (
    <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
      <div className="flex flex-col gap-5">
        <fieldset className="flex flex-col gap-3" disabled={busy}>
          <legend className="font-mono text-[0.6875rem] uppercase tracking-widest text-sand-400">
            Choose your House
          </legend>
          <div className="grid grid-cols-2 gap-3">
            {HOUSES.map((house) => (
              <label
                key={house.id}
                className={`flex cursor-pointer flex-col items-center gap-2 border p-4 text-sand-100 ${
                  side === house.id ? 'border-spice-400 bg-spice-500/10' : 'border-sand-200/20'
                } has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-spice-300`}
              >
                <input
                  type="radio"
                  name="house"
                  value={house.id}
                  checked={side === house.id}
                  onChange={() => setSide(house.id)}
                  className="sr-only"
                />
                <Emblem side={house.id} />
                <span className="text-sm font-bold">{house.name}</span>
              </label>
            ))}
          </div>
        </fieldset>
        <WagerField value={wager} onChange={setWager} min={game.min} max={maxWager} disabled={busy} />
        <ErrorBanner message={error} />
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            className="btn btn-primary disabled:opacity-50"
            disabled={busy || paused || !/^[1-9][0-9]*$/.test(wager)}
            onClick={() => void start(wager, { side })}
          >
            {busy ? 'Flipping...' : 'Flip the coin'}
          </button>
          {finished && (
            <button type="button" className="btn btn-ghost" onClick={reset}>
              Play again
            </button>
          )}
        </div>
      </div>
      <div className="flex flex-col items-center justify-center gap-5">
        <div
          key={round?.id ?? 'idle'}
          className={`${styles.coin} ${finished ? styles.coinSpin : ''}`}
          style={{ ['--turn' as string]: landed === 'scarab' ? '0deg' : '180deg' }}
        >
          <Emblem side={landed} />
        </div>
        {outcome && round && (
          <Outcome tone={outcome.tone}>
            {HOUSES.find((house) => house.id === result?.landed)?.name} won the toss. {outcome.text}
          </Outcome>
        )}
        {!finished && <p className="text-sm text-sand-400">Pays 1.96x on a win. Chance: 50%.</p>}
      </div>
    </div>
  );
}
