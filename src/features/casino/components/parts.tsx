'use client';

import Link from 'next/link';
import { type ReactNode, useEffect, useState } from 'react';
import { STAKES_NOTICE, formatCredits, type GameInfo, type WalletSnapshot } from '../contracts';
import styles from './casino.module.css';

/** Wager input with quick amounts. The table limits are enforced again by the server. */
export function WagerField({
  value,
  onChange,
  min,
  max,
  disabled,
  label = 'Wager (Solaris)',
}: {
  value: string;
  onChange: (value: string) => void;
  min: number;
  max: number;
  disabled?: boolean;
  label?: string;
}) {
  const quick = [min, min * 10, min * 100, max].filter(
    (amount, index, all) => amount <= max && all.indexOf(amount) === index,
  );
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor="casino-wager" className="font-mono text-[0.6875rem] uppercase tracking-widest text-sand-400">
        {label}
      </label>
      <input
        id="casino-wager"
        inputMode="numeric"
        autoComplete="off"
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value.replace(/[^0-9]/g, '').slice(0, 7))}
        aria-describedby="casino-wager-hint"
        className="w-full border border-sand-200/20 bg-obsidian-900 px-3 py-2.5 text-sm text-sand-50 focus:border-spice-400 disabled:opacity-50"
      />
      <div className="flex flex-wrap gap-2" role="group" aria-label="Quick wager amounts">
        {quick.map((amount) => (
          <button
            key={amount}
            type="button"
            disabled={disabled}
            onClick={() => onChange(String(amount))}
            className="btn btn-ghost !min-h-9 !px-3 !text-[0.6875rem] disabled:opacity-50"
          >
            {formatCredits(amount)}
          </button>
        ))}
      </div>
      <p id="casino-wager-hint" className="text-xs text-sand-500">
        Table limits: {formatCredits(min)} to {formatCredits(max)}.
      </p>
    </div>
  );
}

const SUITS = [
  { glyph: '♠', name: 'spades', red: false },
  { glyph: '♥', name: 'hearts', red: true },
  { glyph: '♦', name: 'diamonds', red: true },
  { glyph: '♣', name: 'clubs', red: false },
];
const RANK_NAMES = ['Ace', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'Jack', 'Queen', 'King'];
const RANK_LABELS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

/** A playing card from a shoe card id (rank = id % 13, suit = floor(id / 13) % 4), or a face-down card. */
export function PlayingCard({ id }: { id: number | null }) {
  if (id === null)
    return <span className={`${styles.card} ${styles.cardBack}`} role="img" aria-label="Face-down card" />;
  const suit = SUITS[Math.floor(id / 13) % 4]!;
  const rank = id % 13;
  return (
    <span
      className={`${styles.card} ${suit.red ? styles.cardRed : ''}`}
      role="img"
      aria-label={`${RANK_NAMES[rank]} of ${suit.name}`}
    >
      <span>{RANK_LABELS[rank]}</span>
      <span className="self-end text-xl">{suit.glyph}</span>
    </span>
  );
}

export function ErrorBanner({ message }: { message: string | null }) {
  return (
    <div role="alert" aria-live="assertive">
      {message && (
        <p className="border border-status-danger bg-status-danger/10 px-4 py-3 text-sm text-sand-50">{message}</p>
      )}
    </div>
  );
}

/** A polite live region announcing the result of a round to assistive technology. */
export function Outcome({ tone, children }: { tone: 'win' | 'loss' | 'neutral'; children: ReactNode }) {
  const color =
    tone === 'win'
      ? 'border-spice-400 text-spice-200'
      : tone === 'loss'
        ? 'border-sand-200/20 text-sand-300'
        : 'border-sand-200/20 text-sand-100';
  return (
    <p
      role="status"
      aria-live="polite"
      className={`border-l-4 bg-obsidian-950/60 px-4 py-3 text-sm font-semibold ${color}`}
    >
      {children}
    </p>
  );
}

const REMINDER_KEY = 'casino-play-reminder';
const REMINDER_MS = 30 * 60_000;

/** Optional time-on-table reminder. Off by default, stored only in this browser, never an incentive to keep playing. */
export function PlayReminder() {
  const [enabled, setEnabled] = useState(false);
  const [due, setDue] = useState(false);

  useEffect(() => {
    try {
      setEnabled(localStorage.getItem(REMINDER_KEY) === 'on');
    } catch {
      // storage unavailable: the reminder simply stays off
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    const timer = window.setInterval(() => setDue(true), REMINDER_MS);
    return () => window.clearInterval(timer);
  }, [enabled]);

  const toggle = (next: boolean) => {
    setEnabled(next);
    setDue(false);
    try {
      localStorage.setItem(REMINDER_KEY, next ? 'on' : 'off');
    } catch {
      // ignore
    }
  };

  return (
    <div className="flex flex-col gap-2 text-sm text-sand-400">
      <label className="flex items-center gap-3">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(event) => toggle(event.target.checked)}
          className="size-4 accent-spice-500"
        />
        Remind me to take a break every 30 minutes
      </label>
      {due && (
        <p role="alert" className="border border-spice-400/60 bg-spice-500/10 px-4 py-3 text-sand-100">
          You have been at the table for a while. Consider a break.{' '}
          <Link href="/casino/wallet#limits" className="underline">
            Pause play
          </Link>{' '}
          <button type="button" onClick={() => setDue(false)} className="ml-2 underline">
            Dismiss
          </button>
        </p>
      )}
    </div>
  );
}

/** Common frame for a game: title, real-stakes notice, balance, rules and the optional reminder. */
export function GameFrame({
  game,
  wallet,
  children,
}: {
  game: GameInfo;
  wallet: WalletSnapshot | null;
  children: ReactNode;
}) {
  const paused = wallet?.pausedUntil ? new Date(wallet.pausedUntil) : null;
  return (
    <section aria-labelledby="game-title" className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">{game.genre}</p>
          <h2 id="game-title" className="mt-2 text-2xl">
            {game.name}
          </h2>
          <p className="mt-1 max-w-prose text-sm text-sand-400">{game.tagline}</p>
        </div>
        <div className="panel px-4 py-3 text-right" aria-live="polite">
          <p className="font-mono text-[0.6875rem] uppercase tracking-widest text-sand-400">Casino wallet · Solaris</p>
          <p className="text-xl font-bold text-sand-50">{wallet ? formatCredits(wallet.solaris.available) : '...'}</p>
          {wallet && wallet.solaris.reserved !== '0' && (
            <p className="text-xs text-sand-500">{formatCredits(wallet.solaris.reserved)} in play</p>
          )}
        </div>
      </header>
      <p className="text-xs text-sand-300">{STAKES_NOTICE}</p>
      {paused && (
        <p role="status" className="border border-spice-400/60 bg-spice-500/10 px-4 py-3 text-sm text-sand-100">
          You paused play until {paused.toLocaleString()}. You can still look around, but new rounds are unavailable.
        </p>
      )}
      <div className={`${styles.table} p-5 sm:p-8`}>{children}</div>
      <details className="panel p-4 text-sm text-sand-300">
        <summary className="cursor-pointer font-semibold text-sand-100">Rules and odds</summary>
        <p className="mt-3 text-sand-100">{game.odds}</p>
        <ul className="mt-3 list-disc space-y-1 pl-5">
          {game.rules.map((rule) => (
            <li key={rule}>{rule}</li>
          ))}
        </ul>
        <p className="mt-3">
          Every round is verifiable once its seed is retired. See{' '}
          <Link href="/casino/fairness" className="underline">
            Fairness
          </Link>
          .
        </p>
      </details>
      <PlayReminder />
    </section>
  );
}

export type TableProps = { game: GameInfo; paused: boolean; maxWager: number; onSettled: () => void };

/** Net result of a finished round in plain words, from the settlement the server returned. */
export function netText(stake: bigint, payout: string | undefined): { tone: 'win' | 'loss' | 'neutral'; text: string } {
  const returned = BigInt(payout ?? '0');
  const net = returned - stake;
  if (net > 0n) return { tone: 'win', text: `You won ${formatCredits(net)} Solaris.` };
  if (net === 0n) return { tone: 'neutral', text: 'Push: your wager was returned.' };
  return { tone: 'loss', text: `You lost ${formatCredits(-net)} Solaris.` };
}
