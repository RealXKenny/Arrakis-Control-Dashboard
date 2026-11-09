'use client';

import { useState } from 'react';
import { formatCredits } from '../contracts';
import { ErrorBanner, Outcome, PlayingCard, WagerField, netText, type TableProps } from './parts';
import styles from './casino.module.css';
import { CasinoChip } from './casino-chip';
import { CardBackPicker, useCardBack } from './card-back-picker';
import { audio } from '../../../lib/audio/manager';
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
  const [wagers, setWagers] = useState<string[]>([]);
  const { back, choose } = useCardBack();
  const { round, busy, error, start, act, reset, finished, open } = useRound(game.id, onSettled);
  const view = round?.game_view as View | null;
  const result = round?.settlement?.result as Result | undefined;
  const stake = round ? BigInt(round.wager) * BigInt(round.holds) : 0n;
  const outcome = round?.status === 'settled' ? netText(stake, round.settlement?.payout) : null;
  const pendingChips = [...wagers, wager]
    .map((value, index, values) => Number(value) - (index ? Number(values[index - 1]) : 0))
    .filter((value) => value > 0);

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <CardBackPicker back={back} onChange={choose} />
      <div className={styles.blackjackFelt}>
        <div className={styles.tableInscription}>
          <span>THE SOLARIS EXCHANGE</span>
          <strong>THE EMPEROR’S HAND</strong>
          <span>BLACKJACK PAYS 3 : 2 · DEALER STANDS ON SOFT 17</span>
        </div>
        {!view && (
          <div className={styles.emptyTable}>
            <PlayingCard id={null} back={back} dealing={false} />
            <span>Place your wager to take a seat.</span>
            <div className={styles.bettingCircle}>
              <div className={styles.chipStack} aria-label={`Pending wager: ${wager} Solaris`}>
                {pendingChips.slice(-5).map((value, index) => (
                  <span key={index} style={{ bottom: `${index * 5}px` }}>
                    <CasinoChip value={value} />
                  </span>
                ))}
              </div>
            </div>
            <span>{formatCredits(Number(wager) || 0)} Solaris</span>
          </div>
        )}

        {view && (
          <div className="grid gap-7">
            <section aria-label="Dealer" className={styles.dealerArea}>
              <h3 className="font-mono text-[0.6875rem] uppercase tracking-widest text-sand-400">
                Dealer{view.dealerTotal !== null ? ` · ${view.dealerTotal}` : ''}
              </h3>
              <div className={styles.cardHand}>
                {view.dealer.map((card, index) => (
                  <PlayingCard key={`d${index}`} id={card} back={back} flipping={index === 1 && !view.dealerHidden} />
                ))}
                {view.dealerHidden && <PlayingCard id={null} back={back} />}
              </div>
            </section>
            {view.hands.map((hand, index) => {
              const line = result?.hands?.[index];
              return (
                <section
                  className={`${styles.playerArea} ${open && view.active === index ? styles.activeHand : ''}`}
                  key={`h${index}`}
                  aria-label={view.hands.length > 1 ? `Your hand ${index + 1}` : 'Your hand'}
                >
                  <h3 className="font-mono text-[0.6875rem] uppercase tracking-widest text-sand-400">
                    {view.hands.length > 1 ? `Hand ${index + 1}` : 'Your hand'} · {hand.total}
                    {hand.soft ? ' (soft)' : ''}
                    {hand.doubled ? ' · doubled' : ''}
                    {open && view.active === index && view.hands.length > 1 ? ' · playing' : ''}
                    {line ? ` · ${OUTCOMES[line.outcome] ?? line.outcome}` : ''}
                  </h3>
                  <div className={styles.cardHand}>
                    {hand.cards.map((card, cardIndex) => (
                      <PlayingCard key={`p${index}-${cardIndex}`} id={card} back={back} />
                    ))}
                  </div>
                </section>
              );
            })}
          </div>
        )}
      </div>
      {!round && (
        <div className="max-w-sm">
          <WagerField
            value={wager}
            onChange={(value) => {
              setWager(value);
              setWagers([]);
            }}
            min={game.min}
            max={maxWager}
            disabled={busy}
          />
        </div>
      )}
      {!round && (
        <div className="flex flex-wrap items-center gap-3" role="group" aria-label="Add chips to wager">
          {[10, 50, 100, 500, 1000, 5000]
            .filter((v) => v <= maxWager)
            .map((value) => (
              <CasinoChip
                key={value}
                value={value}
                disabled={busy || Number(wager) + value > maxWager}
                onClick={() => {
                  setWagers((old) => [...old, wager]);
                  setWager(String((Number(wager) || 0) + value));
                  audio.play('chip', 'casino');
                }}
              />
            ))}
          <button
            type="button"
            className="btn btn-ghost"
            disabled={busy || !wagers.length}
            onClick={() => {
              setWager(wagers[wagers.length - 1]);
              setWagers((old) => old.slice(0, -1));
            }}
          >
            Undo chip
          </button>
          <button
            type="button"
            className="btn btn-ghost"
            disabled={busy}
            onClick={() => {
              setWager('0');
              setWagers([]);
            }}
          >
            Clear wager
          </button>
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
