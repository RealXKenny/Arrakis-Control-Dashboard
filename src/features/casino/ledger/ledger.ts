import { MAX_BALANCE, MAX_TRANSFER, parseAmount } from './amount';

/**
 * Reference model of the Solaris Exchange wallet ledger.
 *
 * A pure, synchronous state machine: `applyOperation(state, op)` returns a new state and the ledger
 * entry it appended, or throws a typed LedgerError without changing anything. The Redis adapter must
 * apply the same rules atomically (one Lua script per operation); these tests define the contract.
 *
 * The only currency is `solaris`, the real in-game currency. A balance grows only through a deposit that the
 * game side has confirmed (`deposit_credit`) or a settled payout, and shrinks only through a wager hold or a
 * finalized withdrawal. There is no way to create balance from nothing.
 */

export type Currency = 'solaris';

export type LedgerErrorCode =
  | 'INSUFFICIENT_FUNDS'
  | 'IDEMPOTENCY_CONFLICT'
  | 'HOLD_EXISTS'
  | 'HOLD_NOT_FOUND'
  | 'HOLD_CLOSED'
  | 'ACCOUNT_MISMATCH'
  | 'BALANCE_LIMIT'
  | 'INVALID_OPERATION';

export class LedgerError extends Error {
  constructor(
    readonly code: LedgerErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'LedgerError';
  }
}

export type HoldPurpose = 'wager' | 'withdrawal';
export type HoldState = 'open' | 'settled' | 'released';

export type Hold = {
  id: string;
  purpose: HoldPurpose;
  amount: bigint;
  state: HoldState;
};

export type EntryKind =
  | 'deposit_credit' // verified game->wallet Solaris
  | 'reserve' // available -> reserved
  | 'release' // reserved -> available (refund / cancelled)
  | 'settle' // hold consumed, payout credited
  | 'withdrawal_finalize'; // hold consumed, Solaris left the wallet

export type LedgerEntry = {
  seq: number;
  /** Unique transaction identifier, derived from the idempotency key. */
  id: string;
  idempotencyKey: string;
  kind: EntryKind;
  currency: Currency;
  holdId: string | null;
  /** Signed effect on available and reserved. Sum of all deltas equals the current balance. */
  availableDelta: bigint;
  reservedDelta: bigint;
  availableAfter: bigint;
  reservedAfter: bigint;
  /** Fingerprint of the request, used to reject a reused key with different parameters. */
  fingerprint: string;
};

export type Account = {
  /** Owner: verified player identity on one specific game server. Never a client-supplied value. */
  ownerId: string;
  serverId: string;
  currency: Currency;
  available: bigint;
  reserved: bigint;
  holds: Record<string, Hold>;
  entries: LedgerEntry[];
  byKey: Record<string, number>;
};

export type Operation =
  | { type: 'deposit_credit'; key: string; amount: bigint }
  | { type: 'reserve'; key: string; holdId: string; purpose: HoldPurpose; amount: bigint }
  | { type: 'release'; key: string; holdId: string }
  | { type: 'settle'; key: string; holdId: string; payout: bigint }
  | { type: 'withdrawal_finalize'; key: string; holdId: string };

export function createAccount(ownerId: string, serverId: string, currency: Currency): Account {
  if (!ownerId || !serverId) throw new LedgerError('ACCOUNT_MISMATCH', 'Account owner and server are required');
  return { ownerId, serverId, currency, available: 0n, reserved: 0n, holds: {}, entries: [], byKey: {} };
}

function fingerprint(op: Operation): string {
  const { key: _key, ...rest } = op;
  return JSON.stringify(rest, (_k, v) => (typeof v === 'bigint' ? v.toString() : v));
}

function append(
  account: Account,
  op: Operation,
  kind: EntryKind,
  holdId: string | null,
  dAvailable: bigint,
  dReserved: bigint,
): { account: Account; entry: LedgerEntry } {
  const available = account.available + dAvailable;
  const reserved = account.reserved + dReserved;
  if (available < 0n || reserved < 0n) throw new LedgerError('INSUFFICIENT_FUNDS', 'Insufficient available balance');
  if (available > MAX_BALANCE || reserved > MAX_BALANCE)
    throw new LedgerError('BALANCE_LIMIT', 'Balance limit exceeded');
  const entry: LedgerEntry = {
    seq: account.entries.length + 1,
    id: `tx:${account.ownerId}:${account.serverId}:${account.currency}:${op.key}`,
    idempotencyKey: op.key,
    kind,
    currency: account.currency,
    holdId,
    availableDelta: dAvailable,
    reservedDelta: dReserved,
    availableAfter: available,
    reservedAfter: reserved,
    fingerprint: fingerprint(op),
  };
  return {
    entry,
    account: {
      ...account,
      available,
      reserved,
      holds: account.holds,
      entries: [...account.entries, entry],
      byKey: { ...account.byKey, [op.key]: account.entries.length },
    },
  };
}

function requireHold(account: Account, holdId: string): Hold {
  const hold = account.holds[holdId];
  if (!hold) throw new LedgerError('HOLD_NOT_FOUND', 'Unknown hold');
  if (hold.state !== 'open') throw new LedgerError('HOLD_CLOSED', 'Hold is already closed');
  return hold;
}

function closeHold(account: Account, holdId: string, state: HoldState): Account {
  return { ...account, holds: { ...account.holds, [holdId]: { ...account.holds[holdId]!, state } } };
}

/**
 * Apply one operation. Replaying an operation with the same key and parameters returns the original
 * entry without changing state (`replayed: true`); the same key with different parameters is refused.
 */
export function applyOperation(
  account: Account,
  op: Operation,
): { account: Account; entry: LedgerEntry; replayed: boolean } {
  if (!op.key || op.key.length > 128 || !/^[A-Za-z0-9:_.-]+$/.test(op.key))
    throw new LedgerError('INVALID_OPERATION', 'Invalid idempotency key');

  const prior = account.byKey[op.key];
  if (prior !== undefined) {
    const entry = account.entries[prior]!;
    if (entry.fingerprint !== fingerprint(op))
      throw new LedgerError('IDEMPOTENCY_CONFLICT', 'Idempotency key reused with different parameters');
    return { account, entry, replayed: true };
  }

  let result: { account: Account; entry: LedgerEntry };
  switch (op.type) {
    case 'deposit_credit': {
      const amount = parseAmount(op.amount, MAX_TRANSFER);
      result = append(account, op, 'deposit_credit', null, amount, 0n);
      break;
    }
    case 'reserve': {
      const amount = parseAmount(op.amount);
      if (op.purpose === 'withdrawal') parseAmount(op.amount, MAX_TRANSFER);
      if (account.holds[op.holdId]) throw new LedgerError('HOLD_EXISTS', 'Hold already exists');
      result = append(account, op, 'reserve', op.holdId, -amount, amount);
      result.account = {
        ...result.account,
        holds: { ...result.account.holds, [op.holdId]: { id: op.holdId, purpose: op.purpose, amount, state: 'open' } },
      };
      break;
    }
    case 'release': {
      const hold = requireHold(account, op.holdId);
      result = append(account, op, 'release', hold.id, hold.amount, -hold.amount);
      result.account = closeHold(result.account, hold.id, 'released');
      break;
    }
    case 'settle': {
      const hold = requireHold(account, op.holdId);
      if (hold.purpose !== 'wager') throw new LedgerError('INVALID_OPERATION', 'Only wager holds settle with a payout');
      if (op.payout < 0n) throw new LedgerError('INVALID_OPERATION', 'Payout cannot be negative');
      result = append(account, op, 'settle', hold.id, op.payout, -hold.amount);
      result.account = closeHold(result.account, hold.id, 'settled');
      break;
    }
    case 'withdrawal_finalize': {
      const hold = requireHold(account, op.holdId);
      if (hold.purpose !== 'withdrawal') throw new LedgerError('INVALID_OPERATION', 'Not a withdrawal hold');
      result = append(account, op, 'withdrawal_finalize', hold.id, 0n, -hold.amount);
      result.account = closeHold(result.account, hold.id, 'settled');
      break;
    }
  }
  return { ...result, replayed: false };
}

/** Recompute and verify every ledger invariant. Returns violations; empty means consistent. */
export function checkInvariants(account: Account): string[] {
  const problems: string[] = [];
  let available = 0n;
  let reserved = 0n;
  account.entries.forEach((entry, index) => {
    available += entry.availableDelta;
    reserved += entry.reservedDelta;
    if (entry.seq !== index + 1) problems.push(`entry ${index} has seq ${entry.seq}`);
    if (entry.availableAfter !== available || entry.reservedAfter !== reserved)
      problems.push(`entry ${entry.seq} running balance mismatch`);
    if (entry.currency !== account.currency) problems.push(`entry ${entry.seq} currency mismatch`);
  });
  if (available !== account.available) problems.push('available does not equal sum of entries');
  if (reserved !== account.reserved) problems.push('reserved does not equal sum of entries');
  if (account.available < 0n || account.reserved < 0n) problems.push('negative balance');
  const open = Object.values(account.holds)
    .filter((hold) => hold.state === 'open')
    .reduce((sum, hold) => sum + hold.amount, 0n);
  if (open !== account.reserved) problems.push('reserved does not equal open holds');
  if (new Set(account.entries.map((entry) => entry.id)).size !== account.entries.length)
    problems.push('duplicate transaction id');
  return problems;
}
