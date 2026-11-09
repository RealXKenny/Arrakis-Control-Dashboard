/**
 * Fate of Arrakis odds, with no imports so the browser can show them. The server applies the same
 * functions when it settles; the browser's copy is display-only.
 */

export const DICE_SIDES = 10_000;
export const MIN_WINNING = 100;
export const MAX_WINNING = 9_800;
export const EDGE_NUMERATOR = 99_000_000n;

export type DiceParams = { direction: 'over' | 'under'; target: number };

export function winningOutcomes(params: DiceParams): number {
  return params.direction === 'under' ? params.target : DICE_SIDES - 1 - params.target;
}

export function multiplierBps(params: DiceParams): bigint {
  return EDGE_NUMERATOR / BigInt(winningOutcomes(params));
}

export function isWin(roll: number, params: DiceParams): boolean {
  return params.direction === 'under' ? roll < params.target : roll > params.target;
}
