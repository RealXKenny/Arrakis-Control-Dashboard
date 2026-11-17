import { MAX_BALANCE, formatAmount, parseAmount } from '../ledger/amount';
import { LedgerError, type Operation } from '../ledger/ledger';
import { Rng } from '../fairness/rng';
import {
  engineError,
  type GameModule,
  type RoundRecord,
  type RoundRef,
  type RoundStatus,
  type RoundView,
  type SeedAllocation,
  type Settlement,
} from './types';

/**
 * Shared round lifecycle for every game. The browser only ever submits an action; the server
 * validates it, derives the outcome from the committed seed, and settles money through the ledger.
 *
 *   reserving -> open -> settling -> settled          (voided from reserving/open: full refund)
 *
 * Crash safety: every step is idempotent (ledger keys derive from the round id, seed allocation is
 * keyed by round id, game start is a deterministic function of the allocation) and every stored
 * change is a version-checked compare-and-set, so a round can be resumed or settled by `recoverRounds`
 * and can never settle twice. Only Solaris is wagered, from the member's casino wallet. The server-side activation
 * gate and the table limits live in the service layer; the engine itself enforces the per-round payout ceiling.
 */

export const MAX_HOLDS = 4;

export type RoundStorePort = {
  create(round: RoundRecord): Promise<{ round: RoundRecord; created: boolean }>;
  get(ref: RoundRef): Promise<RoundRecord | null>;
  /** Atomic: applies `patch` only if the stored version and status equal `round`'s; throws STATE_CONFLICT otherwise. */
  cas(round: RoundRecord, patch: Partial<RoundRecord>): Promise<RoundRecord>;
  /** Non-terminal rounds, oldest update first, one page at a time. */
  listOpen(offset?: number, limit?: number): Promise<RoundRef[]>;
  forget(ref: RoundRef): Promise<void>;
};
export type SeedPort = {
  /** Idempotent per round id: the same id always gets the same nonce. Marks the round as open on the seed. */
  allocate(owner: string, server: string, roundId: string): Promise<SeedAllocation>;
  /** Idempotent. Seeds can only be rotated (and thereby revealed) when no round is open. */
  release(owner: string, server: string, roundId: string): Promise<void>;
};
export type EngineDeps = {
  games: Record<string, GameModule>;
  wallet: { apply(owner: string, server: string, currency: 'solaris', op: Operation): Promise<unknown> };
  rounds: RoundStorePort;
  seeds: SeedPort;
  now(): number;
  /** Largest amount one round may pay out, in whole Solaris. Real stakes need a ceiling; see `serialise`. */
  maxPayout: bigint;
  audit(event: { event: string; outcome: 'success' | 'failure'; actor?: string; data?: Record<string, unknown> }): void;
};

const KEY = /^[A-Za-z0-9_.-]{8,64}$/;
const SWEEP_PAGE = 200;
const SWEEP_PAGES = 5;
const holdId = (round: { id: string }, index: number) => `${round.id}.h${index}`;
const code = (error: unknown) => (error as { code?: string } | null)?.code;

function game(deps: EngineDeps, id: string): GameModule {
  const found = deps.games[id];
  if (!found) throw engineError('UNKNOWN_GAME', 'Unknown game');
  return found;
}

export function toView(deps: EngineDeps, round: RoundRecord): RoundView {
  const finished = round.status === 'settling' || round.status === 'settled' || round.status === 'voided';
  return {
    id: round.id,
    game: round.game,
    status: round.status,
    wager: round.wager,
    holds: round.holds,
    version: round.version,
    fairness: round.seed ?? null,
    // Hidden information stays hidden until the game says the round is finished.
    game_view: round.state === undefined ? null : game(deps, round.game).view(round.state, finished, deps.now()),
    settlement: round.settlement ?? null,
    failureCode: round.failureCode ?? null,
  };
}

function serialise(deps: EngineDeps, settlement: Settlement): { payout: string; result: Record<string, unknown> } {
  if (settlement.payout < 0n || settlement.payout > MAX_BALANCE) throw engineError('INVALID_PAYOUT', 'Invalid payout');
  // A round never pays more than the table ceiling. Only the extreme tail of Mines and Crash can reach it, and the
  // round's result says so, so a capped payout is never silent.
  const capped = settlement.payout > deps.maxPayout;
  return {
    payout: formatAmount(capped ? deps.maxPayout : settlement.payout),
    result: capped ? { ...settlement.result, payoutCapped: true } : settlement.result,
  };
}

async function ignoringMissingHold(run: () => Promise<unknown>) {
  try {
    await run();
  } catch (error) {
    if (!(error instanceof LedgerError && error.code === 'HOLD_NOT_FOUND')) throw error;
  }
}

/** Consume every hold (payout on the first, nothing on extras) and close the round. Safe to repeat. */
async function finishSettle(deps: EngineDeps, round: RoundRecord): Promise<RoundRecord> {
  if (round.status !== 'settling' || !round.settlement) throw engineError('INVALID_STATE', 'Round is not settling');
  const payout = BigInt(round.settlement.payout);
  for (let index = 0; index < round.holds; index += 1)
    await deps.wallet.apply(round.owner, round.server, 'solaris', {
      type: 'settle',
      key: `${round.id}.settle${index}`,
      holdId: holdId(round, index),
      payout: index === 0 ? payout : 0n,
    });
  // A hold reserved for an action that never applied is returned, not confiscated.
  for (let index = round.holds; index < MAX_HOLDS; index += 1)
    await ignoringMissingHold(() =>
      deps.wallet.apply(round.owner, round.server, 'solaris', {
        type: 'release',
        key: `${round.id}.release${index}`,
        holdId: holdId(round, index),
      }),
    );
  await deps.seeds.release(round.owner, round.server, round.id);
  return deps.rounds.cas(round, { status: 'settled', pending: undefined, updatedAt: deps.now() });
}

async function voidRound(deps: EngineDeps, round: RoundRecord, failureCode: string): Promise<RoundRecord> {
  if (round.status !== 'reserving' && round.status !== 'open')
    throw engineError('INVALID_STATE', 'Round cannot be voided');
  for (let index = 0; index < MAX_HOLDS; index += 1)
    await ignoringMissingHold(() =>
      deps.wallet.apply(round.owner, round.server, 'solaris', {
        type: 'release',
        key: `${round.id}.void${index}`,
        holdId: holdId(round, index),
      }),
    );
  await deps.seeds.release(round.owner, round.server, round.id);
  const voided = await deps.rounds.cas(round, {
    status: 'voided',
    pending: undefined,
    failureCode,
    updatedAt: deps.now(),
  });
  deps.audit({
    event: 'casino.round.voided',
    outcome: 'failure',
    actor: round.owner,
    data: { id: round.id, game: round.game, failureCode },
  });
  return voided;
}

async function begin(deps: EngineDeps, round: RoundRecord): Promise<RoundRecord> {
  const mod = game(deps, round.game);
  const wager = BigInt(round.wager);
  try {
    await deps.wallet.apply(round.owner, round.server, 'solaris', {
      type: 'reserve',
      key: `${round.id}.reserve0`,
      holdId: holdId(round, 0),
      purpose: 'wager',
      amount: wager,
    });
  } catch (error) {
    if (error instanceof LedgerError && error.code === 'INSUFFICIENT_FUNDS') {
      await voidRound(deps, round, 'INSUFFICIENT_FUNDS');
      throw engineError('INSUFFICIENT_FUNDS', 'Insufficient balance');
    }
    throw error;
  }
  const seed = await deps.seeds.allocate(round.owner, round.server, round.id);
  const { state, settlement } = mod.start(new Rng(seed.serverSeed, seed.clientSeed, seed.nonce), wager, round.params, {
    now: round.createdAt,
  });
  const meta = { commitment: seed.commitment, clientSeed: seed.clientSeed, nonce: seed.nonce };
  if (!settlement) return deps.rounds.cas(round, { status: 'open', seed: meta, state, updatedAt: deps.now() });
  const settling = await deps.rounds.cas(round, {
    status: 'settling',
    seed: meta,
    state,
    settlement: serialise(deps, settlement),
    updatedAt: deps.now(),
  });
  return finishSettle(deps, settling);
}

async function latest(deps: EngineDeps, ref: RoundRef, fallback: RoundRecord): Promise<RoundRecord> {
  return (await deps.rounds.get(ref)) ?? fallback;
}

export type StartInput = {
  owner: string;
  server: string;
  game: string;
  wager: unknown;
  params?: unknown;
  idempotencyKey: string;
};

/** `owner` and `server` must come from the verified session, never from the request body. */
export async function startRound(deps: EngineDeps, input: StartInput): Promise<RoundView> {
  const mod = game(deps, input.game);
  if (!KEY.test(input.idempotencyKey)) throw engineError('INVALID_REQUEST', 'Invalid idempotency key');
  const wager = parseAmount(input.wager);
  if (wager < mod.minWager || wager > mod.maxWager)
    throw engineError('INVALID_WAGER', 'Wager outside the table limits');
  const params = mod.parseParams(input.params);
  mod.validate?.(wager, params);
  const now = deps.now();
  const { round: stored, created } = await deps.rounds.create({
    id: `r_${input.idempotencyKey}`,
    owner: input.owner,
    server: input.server,
    game: input.game,
    status: 'reserving',
    wager: formatAmount(wager),
    params,
    holds: 1,
    version: 0,
    actions: [],
    createdAt: now,
    updatedAt: now,
  });
  if (
    !created &&
    (stored.game !== input.game ||
      stored.wager !== formatAmount(wager) ||
      JSON.stringify(stored.params) !== JSON.stringify(params))
  )
    throw engineError('IDEMPOTENCY_CONFLICT', 'Idempotency key reused with different parameters');
  if (stored.status !== 'reserving') return toView(deps, stored);
  try {
    return toView(deps, await begin(deps, stored));
  } catch (error) {
    if (code(error) !== 'STATE_CONFLICT') throw error;
    return toView(deps, await latest(deps, stored, stored)); // a concurrent identical request won
  }
}

async function applyResult(
  deps: EngineDeps,
  round: RoundRecord,
  action: unknown,
  result: { state: unknown; settlement?: Settlement },
  extra: Partial<RoundRecord> = {},
): Promise<RoundRecord> {
  const base: Partial<RoundRecord> = {
    ...extra,
    state: result.state,
    actions: [...round.actions, action],
    pending: undefined,
    updatedAt: deps.now(),
  };
  if (!result.settlement) return deps.rounds.cas(round, base);
  const settling = await deps.rounds.cas(round, {
    ...base,
    status: 'settling',
    settlement: serialise(deps, result.settlement),
  });
  return finishSettle(deps, settling);
}

async function completePending(deps: EngineDeps, round: RoundRecord): Promise<RoundRecord> {
  const pending = round.pending;
  if (!pending || round.status !== 'open') return round;
  const mod = game(deps, round.game);
  try {
    await deps.wallet.apply(round.owner, round.server, 'solaris', {
      type: 'reserve',
      key: `${round.id}.reserve${round.holds}`,
      holdId: holdId(round, round.holds),
      purpose: 'wager',
      amount: BigInt(pending.amount),
    });
  } catch (error) {
    if (error instanceof LedgerError && error.code === 'INSUFFICIENT_FUNDS') {
      await deps.rounds.cas(round, { pending: undefined, updatedAt: deps.now() });
      throw engineError('INSUFFICIENT_FUNDS', 'Insufficient balance for this action');
    }
    throw error;
  }
  const result = mod.act(round.state, pending.action);
  return applyResult(deps, round, pending.action, result, { holds: round.holds + 1 });
}

/** Apply one player action to an open round. */
export async function actOnRound(
  deps: EngineDeps,
  input: { owner: string; server: string; roundId: string; action: unknown },
): Promise<RoundView> {
  const ref = { owner: input.owner, server: input.server, id: input.roundId };
  const round = await deps.rounds.get(ref); // keyed by the session's owner: other users' rounds do not exist here
  if (!round) throw engineError('NOT_FOUND', 'Unknown round');
  const mod = game(deps, round.game);
  if (round.status === 'settling') return toView(deps, await finishSettle(deps, round));
  if (round.status !== 'open') throw engineError('ROUND_CLOSED', 'Round is not open');
  if (round.pending) return toView(deps, await completePending(deps, round)); // finish the earlier action first
  // Time-driven outcomes (a crash) happen first: a player action that arrives afterwards is too late.
  const overdue = await settleDue(deps, round);
  if (overdue !== round) return toView(deps, overdue);
  const parsed = mod.parseAction(input.action);
  const action = mod.stamp ? mod.stamp(parsed, deps.now()) : parsed;
  const result = mod.act(round.state, action);
  if (result.additionalWager === undefined) return toView(deps, await applyResult(deps, round, action, result));
  if (result.additionalWager <= 0n || round.holds >= MAX_HOLDS)
    throw engineError('ILLEGAL_ACTION', 'Action not allowed');
  const marked = await deps.rounds.cas(round, {
    pending: { action, amount: formatAmount(result.additionalWager) },
    updatedAt: deps.now(),
  });
  return toView(deps, await completePending(deps, marked));
}

/** Apply a server-owned, time-driven action if one is due (for example a crash). Returns the same record when none is. */
async function settleDue(deps: EngineDeps, round: RoundRecord): Promise<RoundRecord> {
  if (round.status !== 'open' || round.pending) return round;
  const mod = game(deps, round.game);
  const due = mod.due?.(round.state, deps.now());
  if (due === undefined) return round;
  try {
    return await applyResult(deps, round, due, mod.act(round.state, due));
  } catch (error) {
    if (code(error) !== 'STATE_CONFLICT') throw error;
    return (await deps.rounds.get(round)) ?? round; // a concurrent request settled it
  }
}

export async function getRoundView(deps: EngineDeps, ref: RoundRef): Promise<RoundView> {
  const round = await deps.rounds.get(ref);
  if (!round) throw engineError('NOT_FOUND', 'Unknown round');
  return toView(deps, await settleDue(deps, round));
}

/**
 * Recovery sweep. Completes settlements, finishes interrupted multi-hold actions, and refunds rounds
 * that were never fully set up (`staleMs`) or abandoned while open (`abandonedMs`, default 24 hours).
 */
export async function recoverRounds(
  deps: EngineDeps,
  options: { staleMs?: number; abandonedMs?: number } = {},
): Promise<{ settled: number; voided: number; resumed: number; failed: number }> {
  const { staleMs = 120_000, abandonedMs = 24 * 3_600_000 } = options;
  const summary = { settled: 0, voided: 0, resumed: 0, failed: 0 };
  // Read the whole open set first (bounded), so rounds leaving the set cannot shift later pages.
  const refs: RoundRef[] = [];
  for (let page = 0; page < SWEEP_PAGES; page += 1) {
    const batch = await deps.rounds.listOpen(page * SWEEP_PAGE, SWEEP_PAGE);
    refs.push(...batch);
    if (batch.length < SWEEP_PAGE) break;
  }
  for (const ref of refs) {
    const round = await deps.rounds.get(ref);
    if (!round || round.status === 'settled' || round.status === 'voided') {
      await deps.rounds.forget(ref);
      continue;
    }
    const age = deps.now() - round.updatedAt;
    try {
      const overdue = await settleDue(deps, round);
      if (overdue !== round) {
        summary.settled += 1;
        continue;
      }
      if (round.status === 'settling') {
        await finishSettle(deps, round);
        summary.settled += 1;
      } else if (round.status === 'open' && round.pending && age >= staleMs) {
        await completePending(deps, round);
        summary.resumed += 1;
      } else if (round.status === 'reserving' && age >= staleMs) {
        await voidRound(deps, round, 'SETUP_INTERRUPTED');
        summary.voided += 1;
      } else if (round.status === 'open' && age >= abandonedMs) {
        // Dev note: closing the tab is not a fold; the house stands on your behalf and the dunes keep the change.
        // A round the player has seen is played out by the game's own rule, never refunded (see GameModule.abandon).
        const mod = game(deps, round.game);
        const forced = mod.abandon?.(round.state);
        if (forced === undefined) {
          await voidRound(deps, round, 'ABANDONED');
          summary.voided += 1;
        } else {
          const action = mod.stamp ? mod.stamp(forced, deps.now()) : forced;
          await applyResult(deps, round, action, mod.act(round.state, action));
          deps.audit({
            event: 'casino.round.abandoned',
            outcome: 'success',
            actor: round.owner,
            data: { id: round.id, game: round.game },
          });
          summary.settled += 1;
        }
      }
    } catch (error) {
      // Another worker got there first, or this round is short of funds: not a failure. Anything else is isolated
      // so one poisoned round can never stop the sweep reaching the rest.
      if (code(error) === 'STATE_CONFLICT' || code(error) === 'INSUFFICIENT_FUNDS') continue;
      summary.failed += 1;
      deps.audit({
        event: 'casino.round.recovery_failed',
        outcome: 'failure',
        actor: round.owner,
        data: { id: round.id, status: round.status, code: code(error) ?? 'UNKNOWN' },
      });
    }
  }
  return summary;
}

export type RoundStatusName = RoundStatus;
