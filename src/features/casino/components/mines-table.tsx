'use client';

import { useState } from 'react';
import { formatCredits } from '../contracts';
import { ErrorBanner, Outcome, WagerField, netText, type TableProps } from './parts';
import styles from './casino.module.css';
import { useRound } from './use-casino';

type View = {
  tiles: number;
  hazardCount: number;
  revealed: number[];
  multiplierBps: number;
  nextMultiplierBps: number | null;
  cashoutValue: string | null;
  hazards?: number[];
  hit?: number | null;
};

const x = (bps: number) => `${(bps / 10_000).toFixed(2)}x`;

export function MinesTable({ game, paused, maxWager, onSettled }: TableProps) {
  const [hazards, setHazards] = useState(3);
  const [wager, setWager] = useState('100');
  const { round, busy, error, start, act, reset, finished, open } = useRound(game.id, onSettled);
  const view = round?.game_view as View | null;
  const outcome = round?.status === 'settled' ? netText(BigInt(round.wager), round.settlement?.payout) : null;
  const revealed = new Set(view?.revealed ?? []);
  const hazardSet = new Set(view?.hazards ?? []);

  const label = (tile: number) => {
    const where = `Tile ${Math.floor(tile / 5) + 1}, ${(tile % 5) + 1}`;
    if (hazardSet.has(tile)) return `${where}: sandworm hazard${view?.hit === tile ? ' (you revealed this)' : ''}`;
    if (revealed.has(tile)) return `${where}: spice cache`;
    return `${where}: hidden`;
  };

  return (
    <div className="grid grid-cols-1 gap-8 md:grid-cols-[1fr_auto]">
      <div className="flex flex-col gap-5">
        {!round && (
          <>
            <div className="flex flex-col gap-2">
              <label
                htmlFor="mines-hazards"
                className="font-mono text-[0.6875rem] uppercase tracking-widest text-sand-400"
              >
                Sandworm hazards: {hazards}
              </label>
              <input
                id="mines-hazards"
                type="range"
                min={1}
                max={24}
                value={hazards}
                onChange={(event) => setHazards(Number(event.target.value))}
                className="accent-spice-500"
              />
              <p className="text-xs text-sand-500">
                More hazards means a bigger payout per safe tile, and a higher chance of losing.
              </p>
            </div>
            <div className="max-w-sm">
              <WagerField value={wager} onChange={setWager} min={game.min} max={maxWager} disabled={busy} />
            </div>
          </>
        )}

        {view && (
          <div className="grid max-w-md grid-cols-5 gap-2" role="group" aria-label="Spice field">
            {Array.from({ length: view.tiles }, (_, tile) => {
              const safe = revealed.has(tile);
              const hazard = hazardSet.has(tile);
              return (
                <button
                  key={tile}
                  type="button"
                  disabled={!open || busy || safe}
                  aria-label={label(tile)}
                  onClick={() => void act({ type: 'reveal', tile })}
                  className={`${styles.tile} ${safe ? styles.tileSafe : ''} ${hazard ? styles.tileHazard : ''}`}
                >
                  {safe ? '✦' : hazard ? '✹' : ''}
                </button>
              );
            })}
          </div>
        )}

        <ErrorBanner message={error} />
        {outcome && (
          <Outcome tone={outcome.tone}>
            {(round?.settlement?.result as { outcome?: string } | undefined)?.outcome === 'hazard'
              ? 'A sandworm surfaced. '
              : 'Harvest banked. '}
            {outcome.text}
          </Outcome>
        )}

        <div className="flex flex-wrap gap-3">
          {!round && (
            <button
              type="button"
              className="btn btn-primary disabled:opacity-50"
              disabled={busy || paused || !/^[1-9][0-9]*$/.test(wager)}
              onClick={() => void start(wager, { hazards })}
            >
              {busy ? 'Starting...' : 'Begin expedition'}
            </button>
          )}
          {open && (
            <button
              type="button"
              className="btn btn-primary disabled:opacity-50"
              disabled={busy || !view?.cashoutValue}
              onClick={() => void act({ type: 'cashout' })}
            >
              Cash out{view?.cashoutValue ? ` ${formatCredits(view.cashoutValue)}` : ''}
            </button>
          )}
          {finished && (
            <button type="button" className="btn btn-ghost" onClick={reset}>
              New expedition
            </button>
          )}
        </div>
      </div>

      <dl className="grid grid-cols-2 content-start gap-3 text-sm md:w-56 md:grid-cols-1">
        <div className="panel p-3">
          <dt className="text-xs text-sand-500">Hazards</dt>
          <dd className="font-bold text-sand-50">{view?.hazardCount ?? hazards}</dd>
        </div>
        <div className="panel p-3">
          <dt className="text-xs text-sand-500">Caches found</dt>
          <dd className="font-bold text-sand-50">{view?.revealed.length ?? 0}</dd>
        </div>
        <div className="panel p-3">
          <dt className="text-xs text-sand-500">Multiplier</dt>
          <dd className="font-bold text-sand-50">{view ? x(view.multiplierBps) : '1.00x'}</dd>
        </div>
        <div className="panel p-3">
          <dt className="text-xs text-sand-500">Next safe tile</dt>
          <dd className="font-bold text-sand-50">{view?.nextMultiplierBps ? x(view.nextMultiplierBps) : '-'}</dd>
        </div>
      </dl>
    </div>
  );
}
