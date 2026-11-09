'use client';

import { useMemo, useState } from 'react';
import { formatCredits } from '../contracts';
import { ErrorBanner, Outcome, netText, type TableProps } from './parts';
import styles from './casino.module.css';
import { useRound } from './use-casino';

const RED = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);
const colorOf = (n: number) => (n === 0 ? 'green' : RED.has(n) ? 'red' : 'black');

type Bet = { key: string; label: string; spec: Record<string, unknown> };
const OUTSIDE: Bet[] = [
  { key: 'color:red', label: 'Red', spec: { type: 'color', value: 'red' } },
  { key: 'color:black', label: 'Black', spec: { type: 'color', value: 'black' } },
  { key: 'parity:odd', label: 'Odd', spec: { type: 'parity', value: 'odd' } },
  { key: 'parity:even', label: 'Even', spec: { type: 'parity', value: 'even' } },
  { key: 'range:low', label: '1 to 18', spec: { type: 'range', value: 'low' } },
  { key: 'range:high', label: '19 to 36', spec: { type: 'range', value: 'high' } },
  ...[1, 2, 3].map((value) => ({ key: `dozen:${value}`, label: `Dozen ${value}`, spec: { type: 'dozen', value } })),
  ...[1, 2, 3].map((value) => ({ key: `column:${value}`, label: `Column ${value}`, spec: { type: 'column', value } })),
];
const straight = (number: number): Bet => ({
  key: `straight:${number}`,
  label: `Number ${number}`,
  spec: { type: 'straight', number },
});
const CHIPS = [10, 50, 100, 500, 1000];
const NUMBER_ROWS = Array.from({ length: 12 }, (_, row) => [3 * row + 1, 3 * row + 2, 3 * row + 3]);

type Result = {
  number?: number;
  bets?: Array<{ type: string; amount: string; returned: string; number?: number; value?: string | number }>;
};

export function RouletteTable({ game, paused, maxWager, onSettled }: TableProps) {
  const [chip, setChip] = useState(100);
  const [placed, setPlaced] = useState<Map<string, { bet: Bet; amount: number }>>(new Map());
  const [last, setLast] = useState<Map<string, { bet: Bet; amount: number }> | null>(null);
  const { round, busy, error, start, reset, finished } = useRound(game.id, onSettled);
  const total = useMemo(() => [...placed.values()].reduce((sum, entry) => sum + entry.amount, 0), [placed]);
  const result = round?.settlement?.result as Result | undefined;
  const landed = result?.number;
  const outcome = round?.status === 'settled' ? netText(BigInt(round.wager), round.settlement?.payout) : null;
  const locked = busy || (round !== null && !finished);

  const place = (bet: Bet) => {
    if (locked) return;
    setPlaced((current) => {
      const next = new Map(current);
      const existing = next.get(bet.key);
      if (!existing && next.size >= 20) return current;
      next.set(bet.key, { bet, amount: (existing?.amount ?? 0) + chip });
      return next;
    });
  };
  const remove = (key: string) =>
    setPlaced((current) => {
      const next = new Map(current);
      next.delete(key);
      return next;
    });

  const spin = async () => {
    const bets = [...placed.values()].map(({ bet, amount }) => ({ ...bet.spec, amount: String(amount) }));
    setLast(new Map(placed));
    await start(String(total), { bets });
  };
  const again = () => {
    reset();
    setPlaced(new Map());
  };
  const tooMuch = total > maxWager;
  const tooLittle = total < game.min;

  const cell = (bet: Bet, text: string, className: string, aria?: string) => {
    const amount = placed.get(bet.key)?.amount;
    return (
      <button
        key={bet.key}
        type="button"
        disabled={locked}
        onClick={() => place(bet)}
        aria-label={`${aria ?? bet.label}${amount ? `, ${formatCredits(amount)} placed` : ''}`}
        className={`relative min-h-10 border border-sand-200/20 px-1 text-sm font-bold text-sand-50 disabled:opacity-60 ${className}`}
      >
        {text}
        {amount ? (
          <span className="absolute -right-1 -top-1 bg-spice-400 px-1 text-[0.625rem] text-obsidian-950">{amount}</span>
        ) : null}
      </button>
    );
  };

  return (
    <div className="grid grid-cols-1 gap-8 lg:grid-cols-[1fr_auto]">
      <div className="flex flex-col gap-5">
        <div role="group" aria-label="Chip value" className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-[0.6875rem] uppercase tracking-widest text-sand-400">Chip</span>
          {CHIPS.map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={chip === value}
              onClick={() => setChip(value)}
              className={`btn !min-h-9 !px-3 !text-[0.6875rem] ${chip === value ? 'btn-primary' : 'btn-ghost'}`}
            >
              {formatCredits(value)}
            </button>
          ))}
        </div>

        <div
          role="group"
          aria-label="Betting table. Activate a cell to place the selected chip."
          className="flex flex-col gap-2 overflow-x-auto"
        >
          <div className="grid grid-cols-3 gap-1">
            {cell(straight(0), '0', 'bg-emerald-900/70 col-span-3', 'Number 0, green')}
            {NUMBER_ROWS.flat().map((n) =>
              cell(
                straight(n),
                String(n),
                colorOf(n) === 'red' ? 'bg-[#7a1d12]' : 'bg-obsidian-950',
                `Number ${n}, ${colorOf(n)}`,
              ),
            )}
          </div>
          <div className="grid grid-cols-3 gap-1 sm:grid-cols-4">
            {OUTSIDE.map((bet) => cell(bet, bet.label, 'bg-obsidian-800'))}
          </div>
        </div>
        <p className="text-xs text-sand-500">
          Straight 35:1. Colour, parity and high/low 1:1. Dozens and columns 2:1. Zero loses outside bets.
        </p>
      </div>

      <div className="flex flex-col items-center gap-5 lg:w-72">
        <div
          key={round?.id ?? 'idle'}
          className={`${styles.wheel} ${finished ? styles.wheelSpin : ''}`}
          style={{ ['--turn' as string]: `${((landed ?? 0) * 360) / 37}deg` }}
        >
          <div className={styles.wheelHub}>
            <span
              className="text-2xl font-bold text-sand-50"
              aria-label={landed === undefined ? 'No spin yet' : `Landed on ${landed}, ${colorOf(landed)}`}
            >
              {landed ?? '·'}
            </span>
          </div>
        </div>
        {outcome && landed !== undefined && (
          <Outcome tone={outcome.tone}>
            {landed} {colorOf(landed)}. {outcome.text}
          </Outcome>
        )}
        <div className="w-full">
          <h3 className="font-mono text-[0.6875rem] uppercase tracking-widest text-sand-400">Your bets</h3>
          {placed.size === 0 ? (
            <p className="mt-2 text-sm text-sand-500">No bets placed.</p>
          ) : (
            <ul className="mt-2 flex flex-col gap-1 text-sm text-sand-200">
              {[...placed.values()].map(({ bet, amount }) => (
                <li key={bet.key} className="flex items-center justify-between gap-2">
                  <span>
                    {bet.label}: {formatCredits(amount)}
                  </span>
                  <button
                    type="button"
                    disabled={locked}
                    onClick={() => remove(bet.key)}
                    className="underline disabled:opacity-50"
                    aria-label={`Remove bet on ${bet.label}`}
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-2 text-sm font-bold text-sand-50">Total: {formatCredits(total)}</p>
          {(tooMuch || (total > 0 && tooLittle)) && (
            <p className="text-xs text-status-warn">
              Total wager must be between {formatCredits(game.min)} and {formatCredits(maxWager)}.
            </p>
          )}
        </div>
        <ErrorBanner message={error} />
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="btn btn-primary disabled:opacity-50"
            disabled={locked || paused || placed.size === 0 || tooMuch || tooLittle}
            onClick={() => void spin()}
          >
            {busy ? 'Spinning...' : 'Spin'}
          </button>
          <button
            type="button"
            className="btn btn-ghost disabled:opacity-50"
            disabled={locked || placed.size === 0}
            onClick={() => setPlaced(new Map())}
          >
            Clear
          </button>
          {finished && (
            <>
              <button type="button" className="btn btn-ghost" onClick={again}>
                New spin
              </button>
              {last && (
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => {
                    reset();
                    setPlaced(new Map(last));
                  }}
                >
                  Repeat bets
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
