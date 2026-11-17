import { engineError, type GameModule, type Settlement } from '../engine/types';
import { payoutFromBps } from '../fairness/rng';

/**
 * Spice Harvest: Mines as a spice-harvesting expedition on a 5 x 5 section of the Arrakis desert.
 *
 * - 25 tiles. Before the first reveal the server picks `hazards` distinct tiles (sandworm activity)
 *   with `rng.sample(25, hazards)` from the committed seed and keeps them in server-side state only.
 * - Reveal a tile: a safe tile is a spice cache and raises the multiplier; a hazard ends the round and loses the wager.
 * - Cash out after at least one safe reveal to bank `wager * multiplier`. Clearing every safe tile cashes out automatically.
 *
 * Multiplier after k safe reveals with h hazards (exact, in basis points):
 *     fair      = prod_{i=0}^{k-1} (25 - i) / (25 - h - i)        (the reciprocal of the survival probability)
 *     multiplier = floor(9900 * N / D) / 10000   for fair = N / D   (a 1% house edge, rounded down)
 * so cashing out after k reveals returns between 98.99% and 99% of the wager on average, for every h and k.
 *
 * The hazard positions are never part of the open-round view; they are revealed only when the round ends.
 */

export const TILES = 25;
export const MIN_HAZARDS = 1;
export const MAX_HAZARDS = 24;

type MinesState = { hazards: number[]; hazardCount: number; revealed: number[]; wager: string; hit?: number };
export type MinesAction = { type: 'reveal'; tile: number } | { type: 'cashout' };

/** Multiplier in basis points after `safe` safe reveals. 10000 (1.00x) before the first reveal. */
export function multiplierBps(hazards: number, safe: number): bigint {
  if (safe === 0) return 10_000n;
  let numerator = 1n;
  let denominator = 1n;
  for (let i = 0; i < safe; i += 1) {
    numerator *= BigInt(TILES - i);
    denominator *= BigInt(TILES - hazards - i);
  }
  return (9_900n * numerator) / denominator;
}

const safeTiles = (state: MinesState) => TILES - state.hazardCount;

function bank(state: MinesState, outcome: 'cashed_out' | 'cleared'): Settlement {
  const bps = multiplierBps(state.hazardCount, state.revealed.length);
  return {
    payout: payoutFromBps(BigInt(state.wager), bps),
    result: { outcome, multiplierBps: Number(bps), revealed: state.revealed, hazards: state.hazards },
  };
}

export const mines: GameModule<MinesState, MinesAction> = {
  id: 'spice-harvest',
  minWager: 10n,
  maxWager: 100_000n,
  parseParams(raw) {
    const hazards = (raw as { hazards?: unknown } | null)?.hazards;
    if (typeof hazards !== 'number' || !Number.isInteger(hazards) || hazards < MIN_HAZARDS || hazards > MAX_HAZARDS)
      throw engineError('INVALID_PARAMS', `Choose between ${MIN_HAZARDS} and ${MAX_HAZARDS} hazards`);
    return { hazards };
  },
  parseAction(raw) {
    const action = (raw ?? {}) as { type?: unknown; tile?: unknown };
    if (action.type === 'cashout') return { type: 'cashout' };
    if (
      action.type === 'reveal' &&
      typeof action.tile === 'number' &&
      Number.isInteger(action.tile) &&
      action.tile >= 0 &&
      action.tile < TILES
    )
      return { type: 'reveal', tile: action.tile };
    throw engineError('INVALID_ACTION', 'Unknown action');
  },
  // Walking away after revealing something banks it; before the first reveal the player learned nothing, so it is refunded.
  abandon: (state) => (state.revealed.length > 0 ? { type: 'cashout' } : undefined),
  start(rng, wager, params) {
    const hazardCount = (params as { hazards: number }).hazards;
    const hazards = rng.sample(TILES, hazardCount).sort((a, b) => a - b);
    return { state: { hazards, hazardCount, revealed: [], wager: wager.toString() } };
  },
  act(previous, action) {
    const state: MinesState = structuredClone(previous);
    if (action.type === 'cashout') {
      if (state.revealed.length === 0) throw engineError('ILLEGAL_ACTION', 'Reveal a tile first');
      return { state, settlement: bank(state, 'cashed_out') };
    }
    if (state.revealed.includes(action.tile)) throw engineError('ILLEGAL_ACTION', 'Tile already revealed');
    if (state.hazards.includes(action.tile)) {
      state.hit = action.tile;
      return {
        state,
        settlement: {
          payout: 0n,
          result: { outcome: 'hazard', tile: action.tile, revealed: state.revealed, hazards: state.hazards },
        },
      };
    }
    state.revealed.push(action.tile);
    if (state.revealed.length === safeTiles(state)) return { state, settlement: bank(state, 'cleared') };
    return { state };
  },
  view(state, finished) {
    const k = state.revealed.length;
    const hasNext = k < safeTiles(state);
    return {
      tiles: TILES,
      hazardCount: state.hazardCount,
      revealed: state.revealed,
      multiplierBps: Number(multiplierBps(state.hazardCount, k)),
      nextMultiplierBps: hasNext ? Number(multiplierBps(state.hazardCount, k + 1)) : null,
      cashoutValue: k > 0 ? payoutFromBps(BigInt(state.wager), multiplierBps(state.hazardCount, k)).toString() : null,
      // The board is withheld until the round is over.
      ...(finished ? { hazards: state.hazards, hit: state.hit ?? null } : {}),
    };
  },
};
