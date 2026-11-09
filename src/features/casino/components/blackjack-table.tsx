'use client';

import { useState } from 'react';
import { formatCredits } from '../contracts';
import { ErrorBanner, Outcome, PlayingCard, WagerField, netText, type TableProps } from './parts';
import { useRound } from './use-casino';

type Hand = { cards: number[]; total: number; soft: boolean; doubled: boolean; done: boolean };
type View = {
  hands: Hand[];
  active: number | null;
  dealer: number[];
  dealerHidden: boolean;
  dealerTotal: number | null;
  actions: string[];
};
type Result = { hands?: Array<{ outcome: string; payout: string; bet: string }> };

const LABELS: Record<string, string> = { hit: 'Hit', stand: 'Stand', double: 'Double down', split: 'Split' };
const OUTCOMES: Record<string, string> = {
  blackjack: 'Blackjack',
  win: 'Win',
  push: 'Push',
  lose: 'Lose',
  bust: 'Bust',
};

export function BlackjackTable({ game, paused, maxWager, onSettled }: TableProps) {
  const [wager, setWager] = useState('100');
  const { round, busy, error, start, act, reset, finished, open } = useRound(game.id, onSettled);
  const view = round?.game_view as View | null;
  const result = round?.settlement?.result as Result | undefined;
  const stake = round ? BigInt(round.wager) * BigInt(round.holds) : 0n;
  const outcome = round?.status === 'settled' ? netText(stake, round.settlement?.payout) : null;

  return (
    <div className="flex flex-col gap-6">
      {!round && (
        <div className="max-w-sm">
          <WagerField value={wager} onChange={setWager} min={game.min} max={maxWager} disabled={busy} />
        </div>
      )}

      {view && (
        <div className="grid gap-6">
          <section aria-label="Dealer">
            <h3 className="font-mono text-[0.6875rem] uppercase tracking-widest text-sand-400">
              Dealer{view.dealerTotal !== null ? ` · ${view.dealerTotal}` : ''}
            </h3>
            <div className="mt-2 flex flex-wrap gap-2">
              {view.dealer.map((card, index) => (
                <PlayingCard key={`d${index}`} id={card} />
              ))}
              {view.dealerHidden && <PlayingCard id={null} />}
            </div>
          </section>
          {view.hands.map((hand, index) => {
            const line = result?.hands?.[index];
            return (
              <section key={`h${index}`} aria-label={view.hands.length > 1 ? `Your hand ${index + 1}` : 'Your hand'}>
                <h3 className="font-mono text-[0.6875rem] uppercase tracking-widest text-sand-400">
                  {view.hands.length > 1 ? `Hand ${index + 1}` : 'Your hand'} · {hand.total}
                  {hand.soft ? ' (soft)' : ''}
                  {hand.doubled ? ' · doubled' : ''}
                  {open && view.active === index && view.hands.length > 1 ? ' · playing' : ''}
                  {line ? ` · ${OUTCOMES[line.outcome] ?? line.outcome}` : ''}
                </h3>
                <div className="mt-2 flex flex-wrap gap-2">
                  {hand.cards.map((card, cardIndex) => (
                    <PlayingCard key={`p${index}-${cardIndex}`} id={card} />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}

      <ErrorBanner message={error} />
      {outcome && <Outcome tone={outcome.tone}>{outcome.text}</Outcome>}
      {round?.status === 'voided' && (
        <Outcome tone="neutral">This round was cancelled and your wager was returned.</Outcome>
      )}

      <div className="flex flex-wrap items-center gap-3">
        {!round && (
          <button
            type="button"
            className="btn btn-primary disabled:opacity-50"
            disabled={busy || paused || !/^[1-9][0-9]*$/.test(wager)}
            onClick={() => void start(wager, {})}
          >
            {busy ? 'Dealing...' : 'Deal'}
          </button>
        )}
        {open &&
          view?.actions.map((action) => (
            <button
              key={action}
              type="button"
              className="btn btn-ghost disabled:opacity-50"
              disabled={busy}
              onClick={() => void act({ type: action })}
            >
              {LABELS[action] ?? action}
            </button>
          ))}
        {finished && (
          <button type="button" className="btn btn-primary" onClick={reset}>
            New hand
          </button>
        )}
        {round && <span className="text-xs text-sand-500">In play: {formatCredits(stake)}</span>}
      </div>
    </div>
  );
}
