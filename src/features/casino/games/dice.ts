import { engineError, type GameModule } from '../engine/types';
import { payoutFromBps } from '../fairness/rng';
import {
  DICE_SIDES,
  EDGE_NUMERATOR,
  MAX_WINNING,
  MIN_WINNING,
  isWin,
  multiplierBps,
  winningOutcomes,
  type DiceParams,
} from './dice-math';

export { DICE_SIDES, EDGE_NUMERATOR, MAX_WINNING, MIN_WINNING, isWin, multiplierBps, winningOutcomes };
export type { DiceParams };

/**
 * Fate of Arrakis: Dice.
 *
 * The roll is `r = rng.int(10000)`, an integer 0 to 9999 shown as 0.00 to 99.99 (each value probability 1/10000).
 *  - Roll under T wins when r < T.        winning outcomes = T
 *  - Roll over  T wins when r > T.        winning outcomes = 9999 - T
 * Landing exactly on T loses in both directions. Chance is limited to 1% to 98% (100 to 9,800 winning outcomes).
 *
 * Multiplier (basis points) = floor(99,000,000 / winning outcomes), i.e. 0.99 / chance rounded down, a 1% house edge
 * before rounding (return to player is between 98.99% and 99% for every allowed target). Payout = floor(wager * bps / 10000).
 * At very small wagers on high-chance bets the rounded payout can equal the stake; the table minimum limits that.
 */

export const dice: GameModule<{ roll: number; win: boolean }, never> = {
  id: 'fate-of-arrakis',
  minWager: 100n,
  maxWager: 100_000n,
  parseParams(raw) {
    const { direction, target } = (raw ?? {}) as { direction?: unknown; target?: unknown };
    if ((direction !== 'over' && direction !== 'under') || typeof target !== 'number' || !Number.isInteger(target))
      throw engineError('INVALID_PARAMS', 'Choose over or under and a whole target');
    const params: DiceParams = { direction, target };
    const winning = target >= 0 && target < DICE_SIDES ? winningOutcomes(params) : -1;
    if (winning < MIN_WINNING || winning > MAX_WINNING)
      throw engineError('INVALID_PARAMS', 'Chance must be between 1% and 98%');
    return params;
  },
  parseAction() {
    throw engineError('INVALID_ACTION', 'This game has no actions');
  },
  start(rng, wager, raw) {
    const params = raw as DiceParams;
    const roll = rng.int(DICE_SIDES);
    const win = isWin(roll, params);
    const bps = multiplierBps(params);
    return {
      state: { roll, win },
      settlement: {
        payout: win ? payoutFromBps(wager, bps) : 0n,
        result: {
          roll,
          rollDisplay: (roll / 100).toFixed(2),
          direction: params.direction,
          target: params.target,
          win,
          chance: `${(winningOutcomes(params) / 100).toFixed(2)}%`,
          multiplierBps: Number(bps),
        },
      },
    };
  },
  act: (state) => ({ state }),
  view: (state) => state,
};
