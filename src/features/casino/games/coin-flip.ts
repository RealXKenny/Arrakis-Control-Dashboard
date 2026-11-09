import { engineError, type GameModule } from '../engine/types';
import { payoutFromBps } from '../fairness/rng';

/**
 * The Great Houses: a two-sided coin between two original rival-House symbols.
 *
 *   outcome = rng.int(2): 0 -> scarab, 1 -> crescent        (each exactly 50%)
 *   win     = outcome equals the chosen side
 *   payout  = floor(wager * 19600 / 10000), i.e. 1.96x       (return to player 98%, house edge 2%)
 *
 * Verification: replay `start` with the revealed server seed, the round's client seed and nonce.
 */

export const COIN_SIDES = ['scarab', 'crescent'] as const;
export type CoinSide = (typeof COIN_SIDES)[number];
export const COIN_PAYOUT_BPS = 19_600n;

type CoinState = { chosen: CoinSide; landed: CoinSide; won: boolean };

export const coinFlip: GameModule<CoinState, never> = {
  id: 'great-houses',
  minWager: 10n,
  maxWager: 100_000n,
  parseParams(raw) {
    const side = (raw as { side?: unknown } | null)?.side;
    if (side !== 'scarab' && side !== 'crescent') throw engineError('INVALID_PARAMS', 'Choose a House');
    return { side };
  },
  parseAction() {
    throw engineError('INVALID_ACTION', 'This game has no actions');
  },
  start(rng, wager, params) {
    const chosen = (params as { side: CoinSide }).side;
    const landed = COIN_SIDES[rng.int(2)]!;
    const won = landed === chosen;
    return {
      state: { chosen, landed, won },
      settlement: {
        payout: won ? payoutFromBps(wager, COIN_PAYOUT_BPS) : 0n,
        result: { chosen, landed, won, multiplierBps: Number(COIN_PAYOUT_BPS), chance: '50%' },
      },
    };
  },
  act: (state) => ({ state }),
  view: (state) => state,
};
