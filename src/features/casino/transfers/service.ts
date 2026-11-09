import { MAX_TRANSFER, formatAmount, parseAmount } from '../ledger/amount';
import { LedgerError, type Currency, type Operation } from '../ledger/ledger';
import {
  canTransition,
  type AdjustmentOutcome,
  type IntentRef,
  type TransferIntent,
  type TransferKind,
  type TransferState,
} from './types';

/**
 * Deposit / withdrawal orchestration. Pure of I/O: everything external is a port, so the failure
 * matrix is unit-testable. Rules that must never regress:
 *  - The state moves to debit_sent / credit_sent BEFORE the Console is called (compare-and-set), so
 *    at most one caller ever sends a given adjustment, and a crash afterwards leaves a visible record.
 *  - Only a provable rejection (`rejected`) is treated as "nothing happened". Anything else
 *    (`uncertain`) parks the intent in needs_reconciliation. An uncertain adjustment is never retried.
 *  - After the Console confirms (`game_applied`) only idempotent wallet steps remain, which are retried safely.
 *  - Withdrawal funds stay reserved (unavailable) until the transfer is completed or provably failed.
 */

export type TransferError = Error & { code: string };
export function transferError(code: string, message: string): TransferError {
  return Object.assign(new Error(message), { code, name: 'TransferError' });
}

export type ConsolePort = {
  /** Authoritative Solaris balance. Throws when it cannot be read or parsed (nothing was changed). */
  getBalance(playerId: string): Promise<bigint>;
  /** Signed adjustment. Must never throw for a sent request: classify the outcome instead. */
  /**
   * Signed adjustment. `expectedBalance` is the balance the Console must report afterwards; the port reports `applied`
   * only when the Console's own reply confirms the player was offline and the balance is exactly that.
   */
  adjust(playerId: string, delta: bigint, expectedBalance: bigint): Promise<AdjustmentOutcome>;
};
export type WalletPort = {
  apply(owner: string, server: string, currency: Currency, op: Operation): Promise<unknown>;
};
export type IntentPort = {
  create(intent: TransferIntent): Promise<{ intent: TransferIntent; created: boolean }>;
  get(ref: IntentRef): Promise<TransferIntent | null>;
  /** Atomic compare-and-set from `intent.state` to `to`; throws code STATE_CONFLICT when it moved. */
  transition(intent: TransferIntent, to: TransferState, patch?: Partial<TransferIntent>): Promise<TransferIntent>;
  /** Non-terminal intents, oldest first, bounded. */
  listOpen(offset?: number, limit?: number): Promise<IntentRef[]>;
  /** Drop a terminal or missing intent from the open list. */
  forget(ref: IntentRef): Promise<void>;
};
export type TransferDeps = {
  console: ConsolePort;
  wallet: WalletPort;
  intents: IntentPort;
  now(): number;
  audit(event: {
    event: string;
    outcome: 'success' | 'failure' | 'denied';
    actor?: string;
    data?: Record<string, unknown>;
  }): void;
  /** Throws FEATURE_DISABLED unless real Solaris transfers are enabled. */
  assertEnabled(): void;
};

const KEY = /^[A-Za-z0-9_.-]{8,64}$/;
const PLAYER = /^[A-Za-z0-9_-]{1,64}$/;

function stepKey(intent: TransferIntent, step: string) {
  return `${intent.id}.${step}`;
}

async function move(
  deps: TransferDeps,
  intent: TransferIntent,
  to: TransferState,
  patch: Partial<TransferIntent> = {},
): Promise<TransferIntent> {
  if (!canTransition(intent.state, to)) throw transferError('INVALID_TRANSITION', `${intent.state} -> ${to}`);
  return deps.intents.transition(intent, to, { ...patch, updatedAt: deps.now() });
}

function holdOf(intent: TransferIntent) {
  return intent.id;
}

/** Wallet-side completion once the game side is settled. Safe to repeat: every step is idempotent. */
async function finishApplied(deps: TransferDeps, intent: TransferIntent): Promise<TransferIntent> {
  const amount = BigInt(intent.amount);
  if (intent.kind === 'deposit')
    await deps.wallet.apply(intent.owner, intent.server, 'solaris', {
      type: 'deposit_credit',
      key: stepKey(intent, 'credit'),
      amount,
    });
  else
    await deps.wallet.apply(intent.owner, intent.server, 'solaris', {
      type: 'withdrawal_finalize',
      key: stepKey(intent, 'finalize'),
      holdId: holdOf(intent),
    });
  const done = await move(deps, intent, 'completed');
  deps.audit({
    event: `casino.${intent.kind}.completed`,
    outcome: 'success',
    actor: intent.owner,
    data: { id: intent.id, amount: intent.amount },
  });
  return done;
}

async function fail(deps: TransferDeps, intent: TransferIntent, code: string): Promise<TransferIntent> {
  if (intent.kind === 'withdrawal') {
    // Return the reservation first; the release is idempotent, so a crash here is recoverable.
    try {
      await deps.wallet.apply(intent.owner, intent.server, 'solaris', {
        type: 'release',
        key: stepKey(intent, 'release'),
        holdId: holdOf(intent),
      });
    } catch (error) {
      if (!(error instanceof LedgerError && error.code === 'HOLD_NOT_FOUND')) throw error;
    }
  }
  const failed = await move(deps, intent, 'failed', { failureCode: code });
  deps.audit({
    event: `casino.${intent.kind}.failed`,
    outcome: 'failure',
    actor: intent.owner,
    data: { id: intent.id, code },
  });
  return failed;
}

async function park(deps: TransferDeps, intent: TransferIntent): Promise<TransferIntent> {
  const parked = await move(deps, intent, 'needs_reconciliation', { failureCode: 'OUTCOME_UNKNOWN' });
  deps.audit({
    event: `casino.${intent.kind}.needs_reconciliation`,
    outcome: 'failure',
    actor: intent.owner,
    data: { id: intent.id, amount: intent.amount },
  });
  return parked;
}

/** `before` is the player's game balance read just before sending; the Console must confirm `before + change`. */
async function send(deps: TransferDeps, intent: TransferIntent, before: bigint): Promise<TransferIntent> {
  const sending = await move(deps, intent, intent.kind === 'deposit' ? 'debit_sent' : 'credit_sent');
  const amount = BigInt(intent.amount);
  let outcome: AdjustmentOutcome;
  try {
    const change = intent.kind === 'deposit' ? -amount : amount;
    outcome = await deps.console.adjust(intent.playerId, change, before + change);
  } catch {
    outcome = 'uncertain'; // the port must not throw, but a bug must never look like "nothing happened"
  }
  if (outcome === 'rejected') return fail(deps, sending, 'CONSOLE_REJECTED');
  if (outcome === 'uncertain') return park(deps, sending);
  const applied = await move(deps, sending, 'game_applied');
  return finishApplied(deps, applied);
}

type StartInput = {
  kind: TransferKind;
  owner: string;
  server: string;
  playerId: string;
  amount: unknown;
  idempotencyKey: string;
};

/**
 * Begin (or idempotently resume) a transfer. `owner`, `server` and `playerId` MUST come from the
 * verified session / linked character, never from the request body.
 */
export async function startTransfer(deps: TransferDeps, input: StartInput): Promise<TransferIntent> {
  deps.assertEnabled();
  if (!KEY.test(input.idempotencyKey)) throw transferError('INVALID_REQUEST', 'Invalid idempotency key');
  if (!PLAYER.test(input.playerId)) throw transferError('INVALID_REQUEST', 'Invalid player');
  const amount = parseAmount(input.amount, MAX_TRANSFER);
  const now = deps.now();
  const { intent: stored, created } = await deps.intents.create({
    id: `${input.kind === 'deposit' ? 'dep' : 'wd'}_${input.idempotencyKey}`,
    kind: input.kind,
    owner: input.owner,
    server: input.server,
    playerId: input.playerId,
    amount: formatAmount(amount),
    state: 'created',
    createdAt: now,
    updatedAt: now,
  });
  if (!created && (stored.amount !== formatAmount(amount) || stored.playerId !== input.playerId))
    throw transferError('IDEMPOTENCY_CONFLICT', 'Idempotency key reused with different parameters');
  if (stored.state !== 'created') return stored; // replay: report where it is, never re-send
  deps.audit({
    event: `casino.${input.kind}.started`,
    outcome: 'success',
    actor: input.owner,
    data: { id: stored.id, amount: stored.amount },
  });

  if (input.kind === 'withdrawal') {
    try {
      await deps.wallet.apply(input.owner, input.server, 'solaris', {
        type: 'reserve',
        key: stepKey(stored, 'reserve'),
        holdId: holdOf(stored),
        purpose: 'withdrawal',
        amount,
      });
    } catch (error) {
      if (error instanceof LedgerError && error.code === 'INSUFFICIENT_FUNDS')
        return fail(deps, stored, 'INSUFFICIENT_WALLET_FUNDS');
      throw error;
    }
  }

  // Both directions read the game balance first. The caller has already required the player to be offline, so
  // nothing can change it in between; the Console must then confirm exactly `balance + change`.
  let balance: bigint;
  try {
    balance = await deps.console.getBalance(input.playerId);
  } catch {
    return fail(deps, stored, 'BALANCE_UNAVAILABLE'); // nothing was sent; a withdrawal's reservation is released
  }
  if (input.kind === 'deposit' && balance < amount) return fail(deps, stored, 'INSUFFICIENT_GAME_BALANCE');
  return send(deps, stored, balance);
}

/** Admin resolution of an uncertain transfer after the game balance has been checked out-of-band. */
export async function resolveTransfer(
  deps: TransferDeps,
  ref: IntentRef,
  resolution: 'applied' | 'not_applied',
  admin: string,
  note: string,
): Promise<TransferIntent> {
  const intent = await deps.intents.get(ref);
  if (!intent) throw transferError('NOT_FOUND', 'Unknown transfer');
  if (intent.state !== 'needs_reconciliation')
    throw transferError('INVALID_STATE', 'Transfer is not awaiting reconciliation');
  const patch = { resolvedBy: admin, resolutionNote: note.slice(0, 500) };
  deps.audit({
    event: 'casino.transfer.reconciled',
    outcome: 'success',
    actor: admin,
    data: { id: intent.id, resolution },
  });
  if (resolution === 'applied') return finishApplied(deps, await move(deps, intent, 'game_applied', patch));
  return fail(deps, { ...intent, ...patch }, 'RECONCILED_NOT_APPLIED');
}

/**
 * Recovery sweep (run at startup / on a timer / by an admin):
 *  - game_applied: finish the idempotent wallet step;
 *  - debit_sent / credit_sent older than `staleMs`: the process died mid-call, so the outcome is unknown -> reconcile;
 *  - created older than `staleMs`: nothing was sent, so resume safely.
 */
const SWEEP_PAGE = 200;
const SWEEP_PAGES = 5;

export async function recoverTransfers(
  deps: TransferDeps,
  staleMs = 120_000,
): Promise<{ finished: number; parked: number; resumed: number; failed: number }> {
  const summary = { finished: 0, parked: 0, resumed: 0, failed: 0 };
  // Read the whole open set first (bounded), so entries leaving it cannot shift later pages.
  const refs: IntentRef[] = [];
  for (let page = 0; page < SWEEP_PAGES; page += 1) {
    const batch = await deps.intents.listOpen(page * SWEEP_PAGE, SWEEP_PAGE);
    refs.push(...batch);
    if (batch.length < SWEEP_PAGE) break;
  }
  for (const ref of refs) {
    let intent: TransferIntent | null = null;
    try {
      intent = await deps.intents.get(ref);
      if (!intent || intent.state === 'completed' || intent.state === 'failed') {
        await deps.intents.forget(ref);
        continue;
      }
      if (intent.state === 'game_applied') {
        await finishApplied(deps, intent);
        summary.finished += 1;
      } else if (
        (intent.state === 'debit_sent' || intent.state === 'credit_sent') &&
        deps.now() - intent.updatedAt >= staleMs
      ) {
        await park(deps, intent);
        summary.parked += 1;
      } else if (intent.state === 'created' && deps.now() - intent.updatedAt >= staleMs) {
        await startTransfer(deps, {
          kind: intent.kind,
          owner: intent.owner,
          server: intent.server,
          playerId: intent.playerId,
          amount: intent.amount,
          idempotencyKey: intent.id.replace(/^(dep|wd)_/, ''),
        });
        summary.resumed += 1;
      }
    } catch (error) {
      // Another worker moved it: not a failure. Anything else is isolated so one bad transfer cannot block the rest.
      if ((error as { code?: string }).code === 'STATE_CONFLICT') continue;
      summary.failed += 1;
      deps.audit({
        event: 'casino.transfer.recovery_failed',
        outcome: 'failure',
        actor: ref.owner,
        data: { id: ref.id, state: intent?.state ?? 'unknown' },
      });
    }
  }
  return summary;
}
