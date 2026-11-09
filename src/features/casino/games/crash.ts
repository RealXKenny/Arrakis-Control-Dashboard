import { engineError, type GameModule, type Settlement } from '../engine/types';
import { payoutFromBps } from '../fairness/rng';
import { CAP_BPS, TICK_MS, multiplierAt } from './crash-curve';

export { CAP_BPS, TICK_MS, multiplierAt };

/**
 * Ornithopter Run: Crash. An ornithopter races a Coriolis storm; the multiplier keeps rising until the
 * storm catches it. Cash out before that to win `wager * multiplier`.
 *
 * Crash point (fixed from the committed seed when the round starts, and hidden until it ends):
 *     u = rng.int(1,000,000);   crash = floor(9900 * 1,000,000 / (1,000,000 - u))   in basis points
 * so P(crash >= m) = 0.99 / m for every m >= 1.00x: cashing out at any target returns 99% on average.
 * About 1% of rounds crash instantly (below 1.00x). The crash point is capped at 1,000x; a flight that is
 * still alive when the cap is reached cashes out automatically at 1,000x.
 *
 * Multiplier curve (deterministic integer maths, identical on every platform):
 *     m(t) = floor(10,000 * 1.005^n) basis points, n = floor(t / 50 ms), capped at 1,000x
 * (about 2.7x after 10 seconds, 10x after about 23 seconds).
 *
 * Time is server-authoritative. `t` is measured by the server clock from the round's creation to the server
 * time stamped on the action when it arrives; client timestamps, frame rates and network messages are ignored.
 * A flight whose crash time has passed is settled by the server itself (`due`), whether or not the player acts.
 */

type CrashState = { crashBps: number; capped: boolean; startedAt: number; wager: string };
export type CrashAction = { type: 'cashout' | 'expire'; at: number };

/** Crash point in basis points from a uniform u in [0, 1,000,000). */
export function crashPointFor(u: number): { crashBps: number; capped: boolean } {
  const raw = (9_900n * 1_000_000n) / BigInt(1_000_000 - u);
  return raw >= BigInt(CAP_BPS) ? { crashBps: CAP_BPS, capped: true } : { crashBps: Number(raw), capped: false };
}

function finish(state: CrashState, cashedOutBps: number | null): Settlement {
  const payout = cashedOutBps === null ? 0n : payoutFromBps(BigInt(state.wager), BigInt(cashedOutBps));
  return {
    payout,
    result: {
      outcome: cashedOutBps === null ? 'crashed' : state.capped && cashedOutBps === CAP_BPS ? 'cap' : 'cashed_out',
      cashedOutBps,
      crashBps: state.crashBps,
    },
  };
}

export const crash: GameModule<CrashState, CrashAction> = {
  id: 'ornithopter-run',
  minWager: 10n,
  maxWager: 100_000n,
  parseParams: () => ({}),
  parseAction(raw) {
    const action = (raw ?? {}) as { type?: unknown; at?: unknown };
    if (action.type !== 'cashout' && action.type !== 'expire') throw engineError('INVALID_ACTION', 'Unknown action');
    // `at` is only honoured when replaying a stored action; the live engine overwrites it with the server clock.
    return { type: action.type, at: typeof action.at === 'number' && Number.isSafeInteger(action.at) ? action.at : 0 };
  },
  stamp: (action, now) => ({ ...action, at: now }),
  start(rng, wager, _params, ctx) {
    const point = crashPointFor(rng.int(1_000_000));
    return { state: { ...point, startedAt: ctx.now, wager: wager.toString() } };
  },
  due(state, now) {
    return multiplierAt(now - state.startedAt) >= state.crashBps ? { type: 'expire', at: now } : undefined;
  },
  act(state, action) {
    const multiplier = multiplierAt(action.at - state.startedAt);
    const reachedCrash = multiplier >= state.crashBps;
    if (action.type === 'expire' && !reachedCrash)
      throw engineError('ILLEGAL_ACTION', 'The flight is still in the air');
    if (!reachedCrash) return { state, settlement: finish(state, multiplier) };
    // The storm got there first, unless the flight survived to the cap, which pays out automatically.
    return { state, settlement: finish(state, state.capped ? CAP_BPS : null) };
  },
  view(state, finished, now) {
    if (finished) return { crashBps: state.crashBps };
    return {
      // The crash point stays hidden; clients only see the server's clock and the multiplier it implies.
      running: true,
      startedAt: state.startedAt,
      serverNow: now,
      multiplierBps: multiplierAt(now - state.startedAt),
      tickMs: TICK_MS,
    };
  },
};
