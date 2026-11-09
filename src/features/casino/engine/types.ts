import type { Rng } from '../fairness/rng';

/**
 * What a game must provide. Games are PURE: all randomness comes from the supplied Rng at `start`,
 * and `act` is a deterministic function of (state, action). That is what makes every round replayable
 * from the revealed seed plus the recorded action list.
 *
 * State must be JSON-serialisable (amounts as decimal strings). It is stored server-side only;
 * clients only ever receive `view(...)`, which must not reveal hidden information while the round is open.
 */
export type Settlement = { payout: bigint; result: Record<string, unknown> };

/** Server clock values handed to games. Only the engine supplies them; clients can never set them. */
export type GameContext = { now: number };

export type GameModule<State = unknown, Action = unknown> = {
  id: string;
  minWager: bigint;
  maxWager: bigint;
  parseParams(raw: unknown): unknown;
  /** Optional cross-check of the total wager against the parsed params; runs BEFORE any funds are reserved. */
  validate?(wager: bigint, params: unknown): void;
  parseAction(raw: unknown): Action;
  /** `ctx.now` is the round's creation time (stable across crash recovery), so replays are deterministic. */
  start(rng: Rng, wager: bigint, params: unknown, ctx: GameContext): { state: State; settlement?: Settlement };
  /** Adds the server's clock to a parsed action before it is stored and applied (timed games only). */
  stamp?(action: Action, now: number): Action;
  /**
   * What to do with a round the player has left open for 24 hours. Return the action to apply (for example stand
   * every hand, or cash out). Return undefined ONLY when the player has learned nothing from the round, in which
   * case it is refunded: refunding a round the player has seen would be a free option to walk away from bad hands.
   */
  abandon?(state: State): Action | undefined;
  /** An action the SERVER must apply because time has run out (for example a crash). Applied before any player action. */
  due?(state: State, now: number): Action | undefined;
  /** `additionalWager` asks the engine to reserve more funds (double down, split) before the action applies. */
  act(state: State, action: Action): { state: State; settlement?: Settlement; additionalWager?: bigint };
  view(state: State, finished: boolean, now: number): unknown;
};

export type RoundStatus = 'reserving' | 'open' | 'settling' | 'settled' | 'voided';

export type RoundRecord = {
  id: string;
  owner: string;
  server: string;
  game: string;
  status: RoundStatus;
  /** Decimal string. The initial wager; extra holds are tracked by `holds`. */
  wager: string;
  params: unknown;
  /** Number of wager holds in force (h0 is the initial wager). */
  holds: number;
  /** Increments on every stored change; compare-and-set uses it. */
  version: number;
  seed?: { commitment: string; clientSeed: string; nonce: number };
  state?: unknown;
  /** Accepted actions in order, for independent replay. */
  actions: unknown[];
  /** An extra hold being added together with the action that needs it; any caller completes it. */
  pending?: { action: unknown; amount: string };
  settlement?: { payout: string; result: Record<string, unknown> };
  failureCode?: string;
  createdAt: number;
  updatedAt: number;
};

export type RoundRef = { owner: string; server: string; id: string };

export type RoundView = {
  id: string;
  game: string;
  status: RoundStatus;
  wager: string;
  holds: number;
  version: number;
  fairness: { commitment: string; clientSeed: string; nonce: number } | null;
  game_view: unknown;
  settlement: { payout: string; result: Record<string, unknown> } | null;
  failureCode: string | null;
};

export type SeedAllocation = { serverSeed: string; commitment: string; clientSeed: string; nonce: number };

export type EngineError = Error & { code: string };
export function engineError(code: string, message: string): EngineError {
  return Object.assign(new Error(message), { code, name: 'EngineError' });
}
