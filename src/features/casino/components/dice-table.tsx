'use client';

import { useEffect, useState } from 'react';
import { formatCredits } from '../contracts';
import { MAX_WINNING, MIN_WINNING, multiplierBps, winningOutcomes, type DiceParams } from '../games/dice-math';
import { ErrorBanner, Outcome, WagerField, netText, type TableProps } from './parts';
import styles from './casino.module.css';
import { useRound } from './use-casino';

type Result = { roll?: number; rollDisplay?: string; win?: boolean; target?: number; direction?: string };

export function DiceTable({ game, paused, maxWager, onSettled }: TableProps) {
  const [direction, setDirection] = useState<DiceParams['direction']>('under');
  const [target, setTarget] = useState(5000);
  const [wager, setWager] = useState('100');
  const [history, setHistory] = useState<Array<{ id: string; roll: string }>>([]);
  const { round, busy, error, start, reset, finished } = useRound(game.id, onSettled);

  const params: DiceParams = { direction, target };
  const winning = target >= 0 && target < 10_000 ? winningOutcomes(params) : -1;
  const valid = winning >= MIN_WINNING && winning <= MAX_WINNING;
  const chance = valid ? (winning / 100).toFixed(2) : '-';
  const bps = valid ? multiplierBps(params) : 0n;
  const multiplier = valid ? (Number(bps) / 10_000).toFixed(4) : '-';
  const wagerAmount = /^[1-9][0-9]*$/.test(wager) ? BigInt(wager) : 0n;
  const onWin = valid ? (wagerAmount * bps) / 10_000n : 0n;

  const result = round?.settlement?.result as Result | undefined;
  useEffect(() => {
    if (round?.status !== 'settled' || !result?.rollDisplay) return;
    const row = { id: round.id, roll: result.rollDisplay };
    setHistory((current) => (current[0]?.id === row.id ? current : [row, ...current].slice(0, 10)));
  }, [round?.id, round?.status, result?.rollDisplay]);
  const outcome = round?.status === 'settled' ? netText(BigInt(round.wager), round.settlement?.payout) : null;
  const rollPercent = result?.roll !== undefined ? result.roll / 100 : null;
  const winFrom = direction === 'under' ? 0 : (target + 1) / 100;
  const winTo = direction === 'under' ? target / 100 : 100;

  return (
    <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
      <div className="flex flex-col gap-5">
        <div role="radiogroup" aria-label="Direction" className="grid grid-cols-2 gap-3">
          {(['under', 'over'] as const).map((value) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={direction === value}
              disabled={busy}
              onClick={() => setDirection(value)}
              className={`btn ${direction === value ? 'btn-primary' : 'btn-ghost'}`}
            >
              Roll {value}
            </button>
          ))}
        </div>
        <div className="flex flex-col gap-2">
          <label htmlFor="dice-target" className="font-mono text-[0.6875rem] uppercase tracking-widest text-sand-400">
            Target: {(target / 100).toFixed(2)}
          </label>
          <input
            id="dice-target"
            type="range"
            min={0}
            max={9999}
            step={1}
            value={target}
            disabled={busy}
            onChange={(event) => setTarget(Number(event.target.value))}
            className="w-full accent-spice-500"
            aria-describedby="dice-odds"
          />
        </div>
        <dl id="dice-odds" className="grid grid-cols-3 gap-3 text-sm">
          <div className="panel p-3">
            <dt className="text-xs text-sand-500">Win chance</dt>
            <dd className="font-bold text-sand-50">{chance}%</dd>
          </div>
          <div className="panel p-3">
            <dt className="text-xs text-sand-500">Multiplier</dt>
            <dd className="font-bold text-sand-50">{multiplier}x</dd>
          </div>
          <div className="panel p-3">
            <dt className="text-xs text-sand-500">Payout on win</dt>
            <dd className="font-bold text-sand-50">{formatCredits(onWin)}</dd>
          </div>
        </dl>
        {!valid && <p className="text-xs text-status-warn">Choose a target giving a chance between 1% and 98%.</p>}
        <WagerField value={wager} onChange={setWager} min={game.min} max={maxWager} disabled={busy} />
        <ErrorBanner message={error} />
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            className="btn btn-primary disabled:opacity-50"
            disabled={busy || paused || !valid || wagerAmount === 0n}
            onClick={() => void start(wager, params)}
          >
            {busy ? 'Rolling...' : 'Roll'}
          </button>
          {finished && (
            <button type="button" className="btn btn-ghost" onClick={reset}>
              Roll again
            </button>
          )}
        </div>
      </div>

      <div className="flex min-w-0 flex-col justify-center gap-6">
        <div className={styles.rollInstrument} aria-hidden="true">
          <span>FATE OF ARRAKIS</span>
          <div key={round?.id ?? 'idle'} className={finished ? styles.rollReveal : undefined}>
            <strong>{result?.rollDisplay ?? '00.00'}</strong>
          </div>
          <span>0.00 — 99.99 · PRECISION ROLL</span>
        </div>
        <div aria-hidden="true" className="relative h-10 border border-sand-200/20 bg-obsidian-950">
          {valid && (
            <div
              className="absolute inset-y-0 bg-spice-500/35"
              style={{ left: `${winFrom}%`, width: `${Math.max(winTo - winFrom, 0)}%` }}
            />
          )}
          {rollPercent !== null && (
            <div className="absolute inset-y-0 w-0.5 bg-sand-50" style={{ left: `${rollPercent}%` }} />
          )}
        </div>
        <p
          className="text-center text-5xl font-bold text-sand-50"
          aria-label={result?.rollDisplay ? `Rolled ${result.rollDisplay}` : 'No roll yet'}
        >
          {result?.rollDisplay ?? '--.--'}
        </p>
        {outcome && (
          <Outcome tone={outcome.tone}>
            Rolled {result?.rollDisplay}. {result?.win ? 'A win.' : 'No win.'} {outcome.text}
          </Outcome>
        )}
        <div role="group" aria-label="Recent rolls" className="flex flex-wrap gap-2 text-xs text-sand-300">
          {history.length > 0 && <span>Recent rolls:</span>}
          {history.map((row) => (
            <span key={row.id} className="border border-sand-200/20 px-2 py-1 font-mono">
              {row.roll}
            </span>
          ))}
        </div>
        <p className="text-xs text-sand-500">Landing exactly on the target loses. Return to player is 98.99% to 99%.</p>
      </div>
    </div>
  );
}
