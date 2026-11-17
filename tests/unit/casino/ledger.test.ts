import { describe, expect, it } from 'vitest';
import { AmountError, MAX_TRANSFER, parseAmount } from '../../../src/features/casino/ledger/amount';
import {
  applyOperation,
  checkInvariants,
  createAccount,
  LedgerError,
  type Account,
  type Operation,
} from '../../../src/features/casino/ledger/ledger';

const account = () => createAccount('discord:1', 'hagga', 'solaris');
const solaris = () => createAccount('discord:1', 'hagga', 'solaris');
const run = (account: Account, op: Operation) => applyOperation(account, op).account;
const code = (fn: () => unknown) => {
  try {
    fn();
  } catch (error) {
    return error instanceof LedgerError ? error.code : String(error);
  }
  return 'NO_ERROR';
};

describe('amounts', () => {
  it('parses exact whole numbers up to the wallet cap', () => {
    expect(parseAmount('9000000000000000')).toBe(9000000000000000n);
  });
  it.each(['0', '-5', '1.5', '1e3', ' 5', '', '05', 'abc'])('rejects %j', (value) => {
    expect(() => parseAmount(value)).toThrow(AmountError);
  });
  it('rejects unsafe numbers and enforces the max', () => {
    expect(() => parseAmount(2 ** 53)).toThrow(AmountError);
    expect(() => parseAmount(MAX_TRANSFER + 1n, MAX_TRANSFER)).toThrow(AmountError);
    expect(parseAmount(MAX_TRANSFER, MAX_TRANSFER)).toBe(MAX_TRANSFER);
  });
});

describe('wallet ledger', () => {
  it('credits a confirmed deposit, then reserves and settles with a win', () => {
    let a = run(account(), { type: 'deposit_credit', key: 'g1', amount: 1000n });
    a = run(a, { type: 'reserve', key: 'w1', holdId: 'round1', purpose: 'wager', amount: 100n });
    expect([a.available, a.reserved]).toEqual([900n, 100n]);
    a = run(a, { type: 'settle', key: 's1', holdId: 'round1', payout: 200n });
    expect([a.available, a.reserved]).toEqual([1100n, 0n]);
    expect(checkInvariants(a)).toEqual([]);
  });

  it('settles a loss with zero payout', () => {
    let a = run(account(), { type: 'deposit_credit', key: 'g1', amount: 50n });
    a = run(a, { type: 'reserve', key: 'w1', holdId: 'r', purpose: 'wager', amount: 50n });
    a = run(a, { type: 'settle', key: 's1', holdId: 'r', payout: 0n });
    expect([a.available, a.reserved]).toEqual([0n, 0n]);
  });

  it('refuses to reserve more than available and never goes negative', () => {
    const a = run(account(), { type: 'deposit_credit', key: 'g1', amount: 10n });
    expect(
      code(() => applyOperation(a, { type: 'reserve', key: 'w', holdId: 'r', purpose: 'wager', amount: 11n })),
    ).toBe('INSUFFICIENT_FUNDS');
    expect(a.available).toBe(10n);
  });

  it('is idempotent: a replay returns the original entry without double-applying', () => {
    const op: Operation = { type: 'deposit_credit', key: 'same', amount: 100n };
    const first = applyOperation(account(), op);
    const second = applyOperation(first.account, op);
    expect(second.replayed).toBe(true);
    expect(second.entry).toBe(first.entry);
    expect(second.account.available).toBe(100n);
    expect(second.account.entries).toHaveLength(1);
  });

  it('rejects a reused key with different parameters', () => {
    const a = run(account(), { type: 'deposit_credit', key: 'k', amount: 100n });
    expect(code(() => applyOperation(a, { type: 'deposit_credit', key: 'k', amount: 101n }))).toBe(
      'IDEMPOTENCY_CONFLICT',
    );
  });

  it('prevents duplicate settlement and settle-after-release', () => {
    let a = run(account(), { type: 'deposit_credit', key: 'g', amount: 100n });
    a = run(a, { type: 'reserve', key: 'w', holdId: 'r', purpose: 'wager', amount: 10n });
    const settled = run(a, { type: 'settle', key: 's1', holdId: 'r', payout: 20n });
    expect(code(() => applyOperation(settled, { type: 'settle', key: 's2', holdId: 'r', payout: 20n }))).toBe(
      'HOLD_CLOSED',
    );
    const released = run(a, { type: 'release', key: 'rel', holdId: 'r' });
    expect(code(() => applyOperation(released, { type: 'settle', key: 's3', holdId: 'r', payout: 20n }))).toBe(
      'HOLD_CLOSED',
    );
    expect(released.available).toBe(100n);
  });

  it('refuses duplicate and unknown holds', () => {
    let a = run(account(), { type: 'deposit_credit', key: 'g', amount: 100n });
    a = run(a, { type: 'reserve', key: 'w1', holdId: 'r', purpose: 'wager', amount: 10n });
    expect(
      code(() => applyOperation(a, { type: 'reserve', key: 'w2', holdId: 'r', purpose: 'wager', amount: 10n })),
    ).toBe('HOLD_EXISTS');
    expect(code(() => applyOperation(a, { type: 'release', key: 'x', holdId: 'nope' }))).toBe('HOLD_NOT_FOUND');
  });

  it('runs a Solaris deposit then a withdrawal with reserved funds unavailable meanwhile', () => {
    let a = run(solaris(), { type: 'deposit_credit', key: 'dep1', amount: 5000n });
    a = run(a, { type: 'reserve', key: 'wd1', holdId: 'wd1', purpose: 'withdrawal', amount: 3000n });
    expect([a.available, a.reserved]).toEqual([2000n, 3000n]);
    expect(
      code(() =>
        applyOperation(a, { type: 'reserve', key: 'wd2', holdId: 'wd2', purpose: 'withdrawal', amount: 2001n }),
      ),
    ).toBe('INSUFFICIENT_FUNDS');
    a = run(a, { type: 'withdrawal_finalize', key: 'fin1', holdId: 'wd1' });
    expect([a.available, a.reserved]).toEqual([2000n, 0n]);
    expect(checkInvariants(a)).toEqual([]);
  });

  it('can release an uncertain withdrawal only explicitly, restoring funds', () => {
    let a = run(solaris(), { type: 'deposit_credit', key: 'dep', amount: 100n });
    a = run(a, { type: 'reserve', key: 'wd', holdId: 'wd', purpose: 'withdrawal', amount: 100n });
    a = run(a, { type: 'release', key: 'rel', holdId: 'wd' });
    expect([a.available, a.reserved]).toEqual([100n, 0n]);
  });

  it('enforces the Console transfer bound on deposits and withdrawals', () => {
    expect(code(() => applyOperation(solaris(), { type: 'deposit_credit', key: 'd', amount: MAX_TRANSFER + 1n }))).toBe(
      'AmountError: Amount out of range',
    );
  });

  it('rejects malformed idempotency keys', () => {
    expect(code(() => applyOperation(account(), { type: 'deposit_credit', key: 'bad key!', amount: 1n }))).toBe(
      'INVALID_OPERATION',
    );
  });

  it('detects tampering with checkInvariants', () => {
    const a = run(account(), { type: 'deposit_credit', key: 'g', amount: 10n });
    expect(checkInvariants({ ...a, available: 11n })).not.toEqual([]);
  });

  it('holds invariants across a deterministic randomized sequence', () => {
    let seed = 12345;
    const rand = (n: number) => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed % n;
    };
    let a = run(account(), { type: 'deposit_credit', key: 'seed', amount: 10_000n });
    const open: string[] = [];
    for (let i = 0; i < 500; i += 1) {
      try {
        const roll = rand(3);
        if (roll === 0) {
          const id = `h${i}`;
          a = run(a, { type: 'reserve', key: `r${i}`, holdId: id, purpose: 'wager', amount: BigInt(1 + rand(300)) });
          open.push(id);
        } else if (open.length) {
          const id = open.splice(rand(open.length), 1)[0]!;
          a =
            roll === 1
              ? run(a, { type: 'settle', key: `s${i}`, holdId: id, payout: BigInt(rand(600)) })
              : run(a, { type: 'release', key: `x${i}`, holdId: id });
        }
      } catch (error) {
        if (!(error instanceof LedgerError)) throw error;
      }
      expect(checkInvariants(a)).toEqual([]);
    }
  });
});
