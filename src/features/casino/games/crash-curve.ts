/**
 * The Ornithopter Run multiplier curve, with no imports so browsers can use it for DISPLAY ONLY.
 * The server computes every payout from its own clock with the same function; the browser's copy
 * cannot change an outcome.
 *
 *     m(t) = floor(10,000 * 1.005^n) basis points, n = floor(t / 50 ms), capped at 1,000x
 */

export const TICK_MS = 50;
export const CAP_BPS = 10_000_000;
const MAX_TICKS = 1_400; // 1.005^1400 is above 1,000x

/** Multiplier (basis points) after `elapsedMs` of flight. */
export function multiplierAt(elapsedMs: number): number {
  const ticks = Math.min(Math.max(Math.floor(elapsedMs / TICK_MS), 0), MAX_TICKS);
  const bps = (10_000n * 1005n ** BigInt(ticks)) / 1000n ** BigInt(ticks);
  return Number(bps > BigInt(CAP_BPS) ? BigInt(CAP_BPS) : bps);
}
