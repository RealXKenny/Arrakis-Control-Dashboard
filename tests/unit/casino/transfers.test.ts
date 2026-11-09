import { describe, expect, it, vi } from 'vitest';
import {
  applyOperation,
  checkInvariants,
  createAccount,
  type Account,
  type Currency,
  type Operation,
} from '../../../src/features/casino/ledger/ledger';
import {
  recoverTransfers,
  resolveTransfer,
  startTransfer,
  transferError,
  type TransferDeps,
} from '../../../src/features/casino/transfers/service';
import {
  canTransition,
  type AdjustmentOutcome,
  type IntentRef,
  type TransferIntent,
} from '../../../src/features/casino/transfers/types';

const O = 'discord-1';
const S = 'hagga';
const P = '4242';

function harness(options: { gameBalance?: bigint; enabled?: boolean } = {}) {
  const accounts = new Map<string, Account>();
  const intents = new Map<string, TransferIntent>();
  const calls: Array<{ playerId: string; delta: bigint }> = [];
  const expectations: bigint[] = [];
  const state = {
    gameBalance: options.gameBalance ?? 10_000n,
    outcomes: [] as AdjustmentOutcome[],
    balanceFails: false,
    walletFailures: 0,
    failType: undefined as string | undefined,
    clock: 1_000,
  };
  const account = (owner: string, currency: Currency) => {
    const key = `${owner}:${currency}`;
    if (!accounts.has(key)) accounts.set(key, createAccount(owner, S, currency));
    return key;
  };
  const deps: TransferDeps = {
    console: {
      async getBalance() {
        if (state.balanceFails) throw new Error('down');
        return state.gameBalance;
      },
      async adjust(playerId, delta, expected) {
        calls.push({ playerId, delta });
        expectations.push(expected);
        const outcome = state.outcomes.shift() ?? 'applied';
        if (outcome === 'applied') state.gameBalance += delta;
        return outcome;
      },
    },
    wallet: {
      async apply(owner, _server, currency, op: Operation) {
        if (state.walletFailures > 0 && (!state.failType || op.type === state.failType)) {
          state.walletFailures -= 1;
          throw new Error('redis down');
        }
        const key = account(owner, currency);
        const result = applyOperation(accounts.get(key)!, op);
        accounts.set(key, result.account);
        return result.entry;
      },
    },
    intents: {
      async create(intent) {
        const id = `${intent.owner}:${intent.id}`;
        const existing = intents.get(id);
        if (existing) return { intent: existing, created: false };
        intents.set(id, intent);
        return { intent, created: true };
      },
      async get(ref: IntentRef) {
        return intents.get(`${ref.owner}:${ref.id}`) ?? null;
      },
      async transition(intent, to, patch = {}) {
        const id = `${intent.owner}:${intent.id}`;
        const current = intents.get(id);
        if (!current || current.state !== intent.state) throw transferError('STATE_CONFLICT', 'moved');
        const next = { ...current, ...patch, state: to };
        intents.set(id, next);
        return next;
      },
      async listOpen(offset = 0, limit = 200) {
        return [...intents.values()]
          .filter((i) => i.state !== 'completed' && i.state !== 'failed')
          .map((i) => ({ owner: i.owner, server: i.server, id: i.id }))
          .slice(offset, offset + limit);
      },
      async forget() {},
    },
    now: () => state.clock,
    audit: vi.fn(),
    assertEnabled() {
      if (options.enabled === false) throw transferError('FEATURE_DISABLED', 'off');
    },
  };
  const wallet = (currency: Currency = 'solaris') => accounts.get(`${O}:${currency}`) ?? createAccount(O, S, currency);
  const intent = (id: string) => intents.get(`${O}:${id}`)!;
  return { deps, state, calls, expectations, wallet, intent };
}

const deposit = (amount: unknown, key = 'key-00001') =>
  ({ kind: 'deposit', owner: O, server: S, playerId: P, amount, idempotencyKey: key }) as const;
const withdrawal = (amount: unknown, key = 'key-00001') =>
  ({ kind: 'withdrawal', owner: O, server: S, playerId: P, amount, idempotencyKey: key }) as const;

describe('transfer state table', () => {
  it('only allows forward, non-terminal moves', () => {
    expect(canTransition('created', 'debit_sent')).toBe(true);
    expect(canTransition('debit_sent', 'completed')).toBe(false);
    expect(canTransition('completed', 'failed')).toBe(false);
    expect(canTransition('failed', 'created')).toBe(false);
    expect(canTransition('needs_reconciliation', 'debit_sent')).toBe(false);
  });
});

describe('deposit', () => {
  it('debits the game by exactly -amount and credits the wallet once', async () => {
    const h = harness();
    const result = await startTransfer(h.deps, deposit('5000'));
    expect(result.state).toBe('completed');
    expect(h.calls).toEqual([{ playerId: P, delta: -5000n }]);
    expect(h.state.gameBalance).toBe(5000n);
    expect(h.wallet().available).toBe(5000n);
    expect(checkInvariants(h.wallet())).toEqual([]);
  });

  it('replaying the same key never sends a second adjustment or credit', async () => {
    const h = harness();
    await startTransfer(h.deps, deposit('5000'));
    const again = await startTransfer(h.deps, deposit('5000'));
    expect(again.state).toBe('completed');
    expect(h.calls).toHaveLength(1);
    expect(h.wallet().available).toBe(5000n);
  });

  it('rejects a reused key with different parameters', async () => {
    const h = harness();
    await startTransfer(h.deps, deposit('5000'));
    await expect(startTransfer(h.deps, deposit('6000'))).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });
  });

  it('fails without calling the Console adjust when the game balance is too low or unreadable', async () => {
    const low = harness({ gameBalance: 10n });
    expect((await startTransfer(low.deps, deposit('11'))).failureCode).toBe('INSUFFICIENT_GAME_BALANCE');
    expect(low.calls).toHaveLength(0);
    const down = harness();
    down.state.balanceFails = true;
    expect((await startTransfer(down.deps, deposit('5'))).failureCode).toBe('BALANCE_UNAVAILABLE');
    expect(down.calls).toHaveLength(0);
  });

  it('a provable Console rejection fails cleanly with no wallet credit', async () => {
    const h = harness();
    h.state.outcomes = ['rejected'];
    const result = await startTransfer(h.deps, deposit('100'));
    expect([result.state, result.failureCode]).toEqual(['failed', 'CONSOLE_REJECTED']);
    expect(h.wallet().available).toBe(0n);
  });

  it('an uncertain outcome parks for reconciliation, credits nothing and is never retried', async () => {
    const h = harness();
    h.state.outcomes = ['uncertain'];
    const result = await startTransfer(h.deps, deposit('100'));
    expect(result.state).toBe('needs_reconciliation');
    expect(h.wallet().available).toBe(0n);
    h.state.clock += 10_000_000;
    await startTransfer(h.deps, deposit('100')); // replay
    await recoverTransfers(h.deps);
    expect(h.calls).toHaveLength(1);
  });

  it('keeps the transfer retryable when only the wallet step fails after the game confirmed', async () => {
    const h = harness();
    h.state.walletFailures = 1;
    await expect(startTransfer(h.deps, deposit('700'))).rejects.toThrow('redis down');
    expect(h.intent('dep_key-00001').state).toBe('game_applied');
    expect(h.wallet().available).toBe(0n);
    const summary = await recoverTransfers(h.deps);
    expect(summary.finished).toBe(1);
    expect(h.intent('dep_key-00001').state).toBe('completed');
    expect(h.wallet().available).toBe(700n);
    expect(h.calls).toHaveLength(1);
  });

  it('is disabled by default when the gate is off, and validates amounts', async () => {
    const off = harness({ enabled: false });
    await expect(startTransfer(off.deps, deposit('5'))).rejects.toMatchObject({ code: 'FEATURE_DISABLED' });
    expect(off.calls).toHaveLength(0);
    const h = harness();
    for (const bad of ['0', '-5', '1.5', '1000000000001', 'x', 5.5])
      await expect(startTransfer(h.deps, deposit(bad))).rejects.toThrow();
    await expect(startTransfer(h.deps, { ...deposit('5'), idempotencyKey: 'short' })).rejects.toMatchObject({
      code: 'INVALID_REQUEST',
    });
    await expect(startTransfer(h.deps, { ...deposit('5'), playerId: '../x' })).rejects.toMatchObject({
      code: 'INVALID_REQUEST',
    });
    expect(h.calls).toHaveLength(0);
  });

  it('two concurrent identical requests send exactly one adjustment', async () => {
    const h = harness();
    const results = await Promise.allSettled([
      startTransfer(h.deps, deposit('300')),
      startTransfer(h.deps, deposit('300')),
    ]);
    expect(results.some((r) => r.status === 'fulfilled')).toBe(true);
    expect(h.calls).toHaveLength(1);
    expect(h.wallet().available).toBe(300n);
  });
});

async function fundWallet(h: ReturnType<typeof harness>, amount: string) {
  await startTransfer(h.deps, deposit(amount, 'fund-0001'));
  h.calls.length = 0;
}

describe('withdrawal', () => {
  it('reserves, credits the game +amount, finalizes the wallet debit once', async () => {
    const h = harness();
    await fundWallet(h, '5000');
    const result = await startTransfer(h.deps, withdrawal('3000'));
    expect(result.state).toBe('completed');
    expect(h.calls).toEqual([{ playerId: P, delta: 3000n }]);
    expect([h.wallet().available, h.wallet().reserved]).toEqual([2000n, 0n]);
    expect(checkInvariants(h.wallet())).toEqual([]);
  });

  it('fails without any game call when wallet funds are insufficient', async () => {
    const h = harness();
    await fundWallet(h, '100');
    const result = await startTransfer(h.deps, withdrawal('101'));
    expect(result.failureCode).toBe('INSUFFICIENT_WALLET_FUNDS');
    expect(h.calls).toHaveLength(0);
    expect(h.wallet().available).toBe(100n);
  });

  it('releases the reservation on a provable rejection', async () => {
    const h = harness();
    await fundWallet(h, '500');
    h.state.outcomes = ['rejected'];
    const result = await startTransfer(h.deps, withdrawal('200'));
    expect(result.state).toBe('failed');
    expect([h.wallet().available, h.wallet().reserved]).toEqual([500n, 0n]);
  });

  it('keeps funds reserved and unavailable while the outcome is uncertain', async () => {
    const h = harness();
    await fundWallet(h, '500');
    h.state.outcomes = ['uncertain'];
    const result = await startTransfer(h.deps, withdrawal('200'));
    expect(result.state).toBe('needs_reconciliation');
    expect([h.wallet().available, h.wallet().reserved]).toEqual([300n, 200n]);
    await expect(startTransfer(h.deps, withdrawal('301', 'key-00002'))).resolves.toMatchObject({
      failureCode: 'INSUFFICIENT_WALLET_FUNDS',
    });
  });

  it('a crash after the Console confirmed finishes the debit exactly once on recovery', async () => {
    const h = harness();
    await fundWallet(h, '500');
    h.state.walletFailures = 1;
    h.state.failType = 'withdrawal_finalize';
    await expect(startTransfer(h.deps, withdrawal('200'))).rejects.toThrow();
    expect(h.intent('wd_key-00001').state).toBe('game_applied');
    await recoverTransfers(h.deps);
    await recoverTransfers(h.deps);
    expect([h.wallet().available, h.wallet().reserved]).toEqual([300n, 0n]);
    expect(h.calls).toHaveLength(1);
  });
});

describe('reconciliation and recovery', () => {
  it('admin "applied" completes a parked deposit; "not_applied" fails it; each only once', async () => {
    const h = harness();
    h.state.outcomes = ['uncertain', 'uncertain'];
    await startTransfer(h.deps, deposit('100', 'key-aaaaa1'));
    await startTransfer(h.deps, deposit('50', 'key-aaaaa2'));
    const done = await resolveTransfer(
      h.deps,
      { owner: O, server: S, id: 'dep_key-aaaaa1' },
      'applied',
      'admin-9',
      'checked game',
    );
    expect(done.state).toBe('completed');
    expect(done.resolvedBy).toBe('admin-9');
    const failed = await resolveTransfer(
      h.deps,
      { owner: O, server: S, id: 'dep_key-aaaaa2' },
      'not_applied',
      'admin-9',
      'no change',
    );
    expect(failed.state).toBe('failed');
    expect(h.wallet().available).toBe(100n);
    await expect(
      resolveTransfer(h.deps, { owner: O, server: S, id: 'dep_key-aaaaa1' }, 'applied', 'admin-9', 'again'),
    ).rejects.toMatchObject({ code: 'INVALID_STATE' });
  });

  it('reconciling an uncertain withdrawal releases or finalizes the hold', async () => {
    const h = harness();
    await fundWallet(h, '1000');
    h.state.outcomes = ['uncertain', 'uncertain'];
    await startTransfer(h.deps, withdrawal('100', 'key-bbbbb1'));
    await startTransfer(h.deps, withdrawal('200', 'key-bbbbb2'));
    await resolveTransfer(h.deps, { owner: O, server: S, id: 'wd_key-bbbbb1' }, 'applied', 'a', '');
    await resolveTransfer(h.deps, { owner: O, server: S, id: 'wd_key-bbbbb2' }, 'not_applied', 'a', '');
    expect([h.wallet().available, h.wallet().reserved]).toEqual([900n, 0n]);
    expect(checkInvariants(h.wallet())).toEqual([]);
  });

  it('recovery parks a stale in-flight transfer instead of re-sending it', async () => {
    const h = harness();
    const stuck: TransferIntent = {
      id: 'dep_stuck-0001',
      kind: 'deposit',
      owner: O,
      server: S,
      playerId: P,
      amount: '10',
      state: 'debit_sent',
      createdAt: 0,
      updatedAt: 0,
    };
    await h.deps.intents.create(stuck);
    h.state.clock = 500_000;
    expect(await recoverTransfers(h.deps)).toMatchObject({ parked: 1 });
    expect(h.intent('dep_stuck-0001').state).toBe('needs_reconciliation');
    expect(h.calls).toHaveLength(0);
  });

  it('one transfer that keeps failing does not stop the sweep reaching the others', async () => {
    const h = harness();
    h.state.walletFailures = 1;
    await expect(startTransfer(h.deps, deposit('10', 'key-poison01'))).rejects.toThrow('redis down');
    await startTransfer(h.deps, deposit('20', 'key-fine00001'));
    h.state.walletFailures = 1; // the next wallet call (the poisoned intent's recovery) fails once more
    h.state.clock += 10;
    const summary = await recoverTransfers(h.deps);
    expect(summary.failed).toBe(1);
    expect(h.wallet().available).toBe(20n);
    expect(h.deps.audit).toHaveBeenCalledWith(expect.objectContaining({ event: 'casino.transfer.recovery_failed' }));
    expect((await recoverTransfers(h.deps)).failed).toBe(0);
    expect(h.wallet().available).toBe(30n);
  });

  it('audits start, completion and uncertainty', async () => {
    const h = harness();
    h.state.outcomes = ['uncertain'];
    await startTransfer(h.deps, deposit('1'));
    const events = vi.mocked(h.deps.audit).mock.calls.map(([event]) => event.event);
    expect(events).toEqual(['casino.deposit.started', 'casino.deposit.needs_reconciliation']);
  });
});

describe('the Console must confirm the exact result', () => {
  it('asks for the balance it expects: before minus the deposit, before plus the withdrawal', async () => {
    const h = harness({ gameBalance: 10_000n });
    await startTransfer(h.deps, deposit('3000', 'key-expect01'));
    expect(h.expectations).toEqual([7_000n]); // 10,000 - 3,000
    await startTransfer(h.deps, withdrawal('500', 'key-expect02'));
    expect(h.expectations).toEqual([7_000n, 7_500n]); // 7,000 + 500
  });

  it('a withdrawal reads the game balance first; if it cannot, nothing is sent and the reservation is released', async () => {
    const h = harness();
    await startTransfer(h.deps, deposit('1000', 'key-expect03'));
    h.calls.length = 0;
    h.state.balanceFails = true;
    const result = await startTransfer(h.deps, withdrawal('400', 'key-expect04'));
    expect([result.state, result.failureCode]).toEqual(['failed', 'BALANCE_UNAVAILABLE']);
    expect(h.calls).toHaveLength(0);
    expect([h.wallet().available, h.wallet().reserved]).toEqual([1000n, 0n]);
  });

  it('a reply that fails verification is parked for an administrator, never credited and never retried', async () => {
    const h = harness();
    h.state.outcomes = ['uncertain'];
    const result = await startTransfer(h.deps, deposit('800', 'key-expect05'));
    expect(result.state).toBe('needs_reconciliation');
    expect(h.wallet().available).toBe(0n);
    await startTransfer(h.deps, deposit('800', 'key-expect05'));
    expect(h.calls).toHaveLength(1);
  });
});
