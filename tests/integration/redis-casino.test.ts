import type { Redis } from 'ioredis';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { configureApplication, connectDirect, integrationTarget } from './helpers/redis-target';

const target = integrationTarget();
configureApplication(target);
vi.mock('../../src/lib/assert-server', () => ({}));

let direct: Redis;
let store: typeof import('../../src/features/casino/server/wallet-store');
let model: typeof import('../../src/features/casino/ledger/ledger');

beforeAll(async () => {
  direct = connectDirect(target);
  store = await import('../../src/features/casino/server/wallet-store');
  model = await import('../../src/features/casino/ledger/ledger');
});
afterAll(async () => {
  await direct.quit();
  (globalThis as { arrakisRedisClient?: { close(): void } }).arrakisRedisClient?.close();
});
beforeEach(async () => {
  await direct.flushdb();
});

const O = 'discord-1';
const S = 'hagga';
const failure = async (promise: Promise<unknown>) => {
  try {
    await promise;
  } catch (error) {
    return (error as { code?: string }).code;
  }
  return 'NO_ERROR';
};

describe('Redis wallet store', () => {
  it('reserves, settles and replays idempotently', async () => {
    await store.applyWalletOperation(O, S, 'solaris', { type: 'deposit_credit', key: 'g1', amount: 1000n });
    await store.applyWalletOperation(O, S, 'solaris', {
      type: 'reserve',
      key: 'w1',
      holdId: 'r1',
      purpose: 'wager',
      amount: 100n,
    });
    const settle = { type: 'settle', key: 's1', holdId: 'r1', payout: 250n } as const;
    const first = await store.applyWalletOperation(O, S, 'solaris', settle);
    const second = await store.applyWalletOperation(O, S, 'solaris', settle);
    expect(first.replayed).toBe(false);
    expect(second.replayed).toBe(true);
    expect(second.entry.id).toBe(first.entry.id);
    expect(await store.readWalletBalance(O, S, 'solaris')).toEqual({ available: 1150n, reserved: 0n });
  });

  it('rejects overspend, duplicate settlement and key reuse', async () => {
    await store.applyWalletOperation(O, S, 'solaris', { type: 'deposit_credit', key: 'g', amount: 10n });
    expect(
      await failure(
        store.applyWalletOperation(O, S, 'solaris', {
          type: 'reserve',
          key: 'w',
          holdId: 'r',
          purpose: 'wager',
          amount: 11n,
        }),
      ),
    ).toBe('INSUFFICIENT_FUNDS');
    expect(
      await failure(store.applyWalletOperation(O, S, 'solaris', { type: 'deposit_credit', key: 'g', amount: 11n })),
    ).toBe('IDEMPOTENCY_CONFLICT');
    await store.applyWalletOperation(O, S, 'solaris', {
      type: 'reserve',
      key: 'w2',
      holdId: 'r2',
      purpose: 'wager',
      amount: 5n,
    });
    await store.applyWalletOperation(O, S, 'solaris', { type: 'settle', key: 's1', holdId: 'r2', payout: 0n });
    expect(
      await failure(
        store.applyWalletOperation(O, S, 'solaris', { type: 'settle', key: 's2', holdId: 'r2', payout: 9n }),
      ),
    ).toBe('HOLD_CLOSED');
  });

  it('serializes concurrent reserves so the balance never goes negative', async () => {
    await store.applyWalletOperation(O, S, 'solaris', { type: 'deposit_credit', key: 'g', amount: 100n });
    const results = await Promise.allSettled(
      Array.from({ length: 20 }, (_, i) =>
        store.applyWalletOperation(O, S, 'solaris', {
          type: 'reserve',
          key: `w${i}`,
          holdId: `h${i}`,
          purpose: 'wager',
          amount: 30n,
        }),
      ),
    );
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(3);
    expect(await store.readWalletBalance(O, S, 'solaris')).toEqual({ available: 10n, reserved: 90n });
  });

  it('isolates accounts by owner and server', async () => {
    await store.applyWalletOperation(O, S, 'solaris', { type: 'deposit_credit', key: 'g', amount: 10n });
    expect((await store.readWalletBalance('discord-2', S, 'solaris')).available).toBe(0n);
    expect((await store.readWalletBalance(O, 'other', 'solaris')).available).toBe(0n);
  });

  it('matches the reference model over a deterministic random sequence', async () => {
    let seed = 99;
    const rand = (n: number) => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed % n;
    };
    let account = model.applyOperation(model.createAccount(O, S, 'solaris'), {
      type: 'deposit_credit',
      key: 'seed',
      amount: 5000n,
    }).account;
    await store.applyWalletOperation(O, S, 'solaris', { type: 'deposit_credit', key: 'seed', amount: 5000n });
    const open: string[] = [];
    for (let i = 0; i < 150; i += 1) {
      const roll = rand(3);
      let op: import('../../src/features/casino/ledger/ledger').Operation;
      if (roll === 0 || !open.length) {
        op = { type: 'reserve', key: `r${i}`, holdId: `h${i}`, purpose: 'wager', amount: BigInt(1 + rand(400)) };
      } else {
        const id = open[rand(open.length)]!;
        op =
          roll === 1
            ? { type: 'settle', key: `s${i}`, holdId: id, payout: BigInt(rand(800)) }
            : { type: 'release', key: `x${i}`, holdId: id };
      }
      let expected: string;
      try {
        account = model.applyOperation(account, op).account;
        expected = 'NO_ERROR';
        if (op.type === 'reserve') open.push(op.holdId);
        else open.splice(open.indexOf((op as { holdId: string }).holdId), 1);
      } catch (error) {
        expected = (error as { code: string }).code;
      }
      expect(await failure(store.applyWalletOperation(O, S, 'solaris', op))).toBe(expected);
    }
    expect(await store.readWalletBalance(O, S, 'solaris')).toEqual({
      available: account.available,
      reserved: account.reserved,
    });
    const entries = await store.listWalletEntries(O, S, 'solaris', 100);
    expect(entries[0]!.seq).toBe(account.entries.length);
  });
});
