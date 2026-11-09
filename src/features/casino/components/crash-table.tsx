'use client';

import { useEffect, useRef, useState } from 'react';
import { formatCredits } from '../contracts';
import { multiplierAt } from '../games/crash-curve';
import { ErrorBanner, Outcome, WagerField, netText, type TableProps } from './parts';
import styles from './casino.module.css';
import { useRound } from './use-casino';

type OpenView = { running: true; startedAt: number; serverNow: number; multiplierBps: number };
type Result = { outcome?: string; cashedOutBps?: number | null; crashBps?: number };

const x = (bps: number) => `${(bps / 10_000).toFixed(2)}x`;

export function CrashTable({ game, paused, maxWager, onSettled }: TableProps) {
  const [wager, setWager] = useState('100');
  const { round, busy, error, start, act, reset, refreshRound, finished, open } = useRound(game.id, onSettled);
  const view = open ? (round?.game_view as OpenView | null) : null;
  const result = round?.settlement?.result as Result | undefined;
  const outcome = round?.status === 'settled' ? netText(BigInt(round.wager), round.settlement?.payout) : null;

  // The server's clock is the only authority. The browser interpolates between updates purely for display.
  const [shown, setShown] = useState(10_000);
  const offset = useRef(0);
  const reduceMotion = useRef(false);
  useEffect(() => {
    reduceMotion.current = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }, []);
  useEffect(() => {
    if (view) offset.current = view.serverNow - Date.now();
  }, [view]);
  useEffect(() => {
    if (!view) return;
    const tick = () => setShown(multiplierAt(Date.now() + offset.current - view.startedAt));
    tick();
    const timer = window.setInterval(tick, reduceMotion.current ? 1000 : 100);
    return () => window.clearInterval(timer);
  }, [view]);
  // Resynchronise with the server regularly; this is also how a crash is noticed if the tab was idle.
  useEffect(() => {
    if (!open) return;
    const timer = window.setInterval(() => void refreshRound(), 1500);
    return () => window.clearInterval(timer);
  }, [open, refreshRound]);

  const progress = Math.min(Math.log(shown / 10_000) / Math.log(20), 1);
  const final = finished && result?.crashBps ? result.crashBps : null;
  const headline = view ? shown : (result?.cashedOutBps ?? final ?? 10_000);

  return (
    <div className="grid grid-cols-1 gap-8 md:grid-cols-[1fr_20rem]">
      <div className="flex flex-col gap-4">
        <div className={styles.flightScene} aria-hidden="true">
          <div className={styles.storm} style={{ width: `${18 + (view ? progress * 10 : 0)}%` }} />
          <svg viewBox="0 0 600 220" preserveAspectRatio="none" className="absolute inset-0 size-full">
            <circle cx="480" cy="55" r="24" fill="#b89a6b" opacity=".4" />
            <path d="M0 185Q170 95 340 175T600 150V220H0Z" fill="#5a4530" />
            <path d="M0 210Q150 145 300 195T600 180V220H0Z" fill="#92704a" />
            <path d="M45 175Q200 165 465 40" fill="none" stroke="#b6d2d1" strokeDasharray="4 5" opacity=".4" />
          </svg>
          <div
            className={styles.thopter}
            style={{ transform: `translate(${20 + progress * 190}px, -${2 + progress * 8}rem)`, maxWidth: '100%' }}
          >
            <svg
              viewBox="0 0 64 32"
              className="size-16 text-sand-100"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
            >
              <path d="M8 18h32l10-6 6 6-8 4H20zM14 14l-8-8M26 14l-6-8M38 14l-6-8" />
            </svg>
          </div>
        </div>
        <p className="text-center text-6xl font-bold text-sand-50" aria-hidden="true">
          {x(headline)}
        </p>
        <p className="sr-only" role="status" aria-live="polite">
          {open ? 'Flight in progress.' : outcome ? `Flight over. ${outcome.text}` : ''}
        </p>
      </div>

      <div className="flex flex-col gap-4">
        {!round && <WagerField value={wager} onChange={setWager} min={game.min} max={maxWager} disabled={busy} />}
        <ErrorBanner message={error} />
        {outcome && (
          <Outcome tone={outcome.tone}>
            {result?.outcome === 'crashed'
              ? `The storm caught the ornithopter at ${x(result.crashBps ?? 10_000)}. `
              : `Cashed out at ${x(result?.cashedOutBps ?? 0)}. `}
            {outcome.text}
          </Outcome>
        )}
        {!round && (
          <button
            type="button"
            className="btn btn-primary disabled:opacity-50"
            disabled={busy || paused || !/^[1-9][0-9]*$/.test(wager)}
            onClick={() => void start(wager, {})}
          >
            {busy ? 'Launching...' : 'Launch'}
          </button>
        )}
        {open && (
          <button
            type="button"
            className="btn btn-primary !min-h-16 disabled:opacity-50"
            disabled={busy}
            onClick={() => void act({ type: 'cashout' })}
          >
            Cash out · {formatCredits((BigInt(round?.wager ?? '0') * BigInt(shown)) / 10_000n)}
          </button>
        )}
        {finished && (
          <button type="button" className="btn btn-ghost" onClick={reset}>
            New flight
          </button>
        )}
        <p className="text-xs text-sand-500">
          The server clock decides every outcome. If your connection lags you may cash out later than you pressed. About
          1% of flights crash immediately.
        </p>
      </div>
    </div>
  );
}
