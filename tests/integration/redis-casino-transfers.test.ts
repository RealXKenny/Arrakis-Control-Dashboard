import type { Redis } from 'ioredis';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { configureApplication, connectDirect, integrationTarget } from './helpers/redis-target';
import type { TransferIntent } from '../../src/features/casino/transfers/types';
import type { TransferDeps } from '../../src/features/casino/transfers/service';

const target = integrationTarget();
configureApplication(target);
vi.mock('../../src/lib/assert-server', () => ({}));
let direct: Redis;
let store: typeof import('../../src/features/casino/server/transfer-store');
let wallet: typeof import('../../src/features/casino/server/wallet-store');
let service: typeof import('../../src/features/casino/transfers/service');
const O = 'transfer-owner';
const S = 'hagga';
const input = (idempotencyKey = 'transfer-0001', kind: 'deposit' | 'withdrawal' = 'deposit') => ({
  owner: O,
  server: S,
  playerId: '4242',
  kind,
  amount: '100',
  idempotencyKey,
});
const intent = (id = 'dep_transfer-0001'): TransferIntent => ({
  id,
  owner: O,
  server: S,
  playerId: '4242',
  kind: 'deposit',
  amount: '1',
  state: 'created',
  createdAt: 1000,
  updatedAt: 1000,
});
function harness() {
  const adjust = vi.fn(async () => 'applied' as 'applied' | 'rejected' | 'uncertain');
  const deps: TransferDeps = {
    console: { getBalance: async () => 10_000n, adjust },
    wallet: { apply: wallet.applyWalletOperation },
    intents: store.transferStore,
    now: () => Date.now(),
    audit: vi.fn(),
    assertEnabled: () => undefined,
  };
  return { deps, adjust };
}
function restartClient() {
  const globals = globalThis as { arrakisRedisClient?: { close(): void } };
  globals.arrakisRedisClient?.close();
  delete globals.arrakisRedisClient;
}
beforeAll(async () => {
  direct = connectDirect(target);
  store = await import('../../src/features/casino/server/transfer-store');
  wallet = await import('../../src/features/casino/server/wallet-store');
  service = await import('../../src/features/casino/transfers/service');
});
beforeEach(async () => {
  await direct.flushdb();
});
afterAll(async () => {
  await direct.quit();
  restartClient();
});

describe('real Redis transfer intents and recovery', () => {
  it('creates and indexes once, serializes transitions and never reopens a terminal replay', async () => {
    const record = intent();
    const attempts = await Promise.all(Array.from({ length: 20 }, () => store.transferStore.create(record)));
    expect(attempts.filter((result) => result.created)).toHaveLength(1);
    expect(await store.listTransfers(O, S)).toHaveLength(1);
    expect(await store.transferStore.listOpen()).toHaveLength(1);
    expect(await store.transferStore.get({ ...record, owner: 'other-owner' })).toBeNull();
    const transitions = await Promise.allSettled([
      store.transferStore.transition(record, 'debit_sent'),
      store.transferStore.transition(record, 'failed'),
    ]);
    expect(transitions.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    const current = (await store.transferStore.get(record))!;
    if (current.state !== 'failed') await store.transferStore.transition(current, 'failed');
    await store.transferStore.create(record);
    expect(await store.transferStore.listOpen()).toEqual([]);
  });
  it('settles deposits/withdrawals once with exact balances and rejects changed idempotency parameters', async () => {
    const { deps, adjust } = harness();
    const deposited = await service.startTransfer(deps, input());
    expect(deposited.state).toBe('completed');
    expect((await service.startTransfer(deps, input())).state).toBe('completed');
    expect((await service.startTransfer(deps, { ...input('withdraw-0001', 'withdrawal'), amount: '40' })).state).toBe(
      'completed',
    );
    expect((await service.startTransfer(deps, { ...input('withdraw-0001', 'withdrawal'), amount: '40' })).state).toBe(
      'completed',
    );
    expect(adjust).toHaveBeenCalledTimes(2);
    expect(adjust).toHaveBeenNthCalledWith(1, '4242', -100n, 9900n);
    expect(adjust).toHaveBeenNthCalledWith(2, '4242', 40n, 10040n);
    expect(await wallet.readWalletBalance(O, S, 'solaris')).toEqual({ available: 60n, reserved: 0n });
    await expect(service.startTransfer(deps, { ...input(), amount: '101' })).rejects.toMatchObject({
      code: 'IDEMPOTENCY_CONFLICT',
    });
    expect(await store.transferStore.listOpen()).toEqual([]);
  });
  it('sends at most one adjustment under concurrent starts of the same transfer', async () => {
    const { deps, adjust } = harness();
    const attempts = await Promise.allSettled(Array.from({ length: 20 }, () => service.startTransfer(deps, input())));
    expect(attempts.some((result) => result.status === 'fulfilled')).toBe(true);
    expect(adjust).toHaveBeenCalledTimes(1);
    expect((await store.transferStore.get({ owner: O, server: S, id: 'dep_transfer-0001' }))?.state).toBe('completed');
    expect(await wallet.readWalletBalance(O, S, 'solaris')).toEqual({ available: 100n, reserved: 0n });
  });
  it('keeps uncertain withdrawals reserved without resending and settles explicit reconciliation once', async () => {
    const { deps, adjust } = harness();
    await wallet.applyWalletOperation(O, S, 'solaris', { type: 'deposit_credit', key: 'funding', amount: 100n });
    adjust.mockResolvedValue('uncertain');
    const request = { ...input('uncertain-001', 'withdrawal'), amount: '40' };
    const parked = await service.startTransfer(deps, request);
    expect(parked.state).toBe('needs_reconciliation');
    expect(await wallet.readWalletBalance(O, S, 'solaris')).toEqual({ available: 60n, reserved: 40n });
    restartClient();
    await service.recoverTransfers(deps, 0);
    await service.startTransfer(deps, request);
    expect(adjust).toHaveBeenCalledTimes(1);
    expect(
      (await service.resolveTransfer(deps, parked, 'applied', 'test-admin', 'Fixture confirmed delivery')).state,
    ).toBe('completed');
    await expect(service.resolveTransfer(deps, parked, 'applied', 'test-admin', 'Repeat')).rejects.toMatchObject({
      code: 'INVALID_STATE',
    });
    expect(await wallet.readWalletBalance(O, S, 'solaris')).toEqual({ available: 60n, reserved: 0n });
    const rejected = await service.startTransfer(deps, { ...input('uncertain-002', 'withdrawal'), amount: '20' });
    await service.resolveTransfer(deps, rejected, 'not_applied', 'test-admin', 'Fixture proved rejection');
    expect(await wallet.readWalletBalance(O, S, 'solaris')).toEqual({ available: 60n, reserved: 0n });
    expect(await store.transferStore.listOpen()).toEqual([]);
  });
  it('recovers an interrupted wallet credit after reconnecting without repeating the game adjustment', async () => {
    const { deps, adjust } = harness();
    const interrupted: TransferDeps = {
      ...deps,
      wallet: { apply: vi.fn().mockRejectedValueOnce(new Error('simulated wallet interruption')) },
    };
    await expect(service.startTransfer(interrupted, input())).rejects.toThrow('simulated wallet interruption');
    expect((await store.transferStore.get({ owner: O, server: S, id: 'dep_transfer-0001' }))?.state).toBe(
      'game_applied',
    );
    restartClient();
    expect(await service.recoverTransfers(deps)).toEqual({ finished: 1, parked: 0, resumed: 0, failed: 0 });
    expect(await service.recoverTransfers(deps)).toEqual({ finished: 0, parked: 0, resumed: 0, failed: 0 });
    expect(adjust).toHaveBeenCalledTimes(1);
    expect(await wallet.readWalletBalance(O, S, 'solaris')).toEqual({ available: 100n, reserved: 0n });
  });
  it('recovers multiple pages without skipping entries as completed intents leave the open set', async () => {
    const { deps, adjust } = harness();
    await Promise.all(
      Array.from({ length: 201 }, async (_, index) => {
        const record = intent(`dep_page-${String(index).padStart(8, '0')}`);
        await store.transferStore.create(record);
        const sent = await store.transferStore.transition(record, 'debit_sent');
        await store.transferStore.transition(sent, 'game_applied');
      }),
    );
    expect(await service.recoverTransfers(deps)).toEqual({ finished: 201, parked: 0, resumed: 0, failed: 0 });
    expect(adjust).not.toHaveBeenCalled();
    expect(await store.transferStore.listOpen()).toEqual([]);
    expect(await wallet.readWalletBalance(O, S, 'solaris')).toEqual({ available: 201n, reserved: 0n });
  }, 15_000);
  it('parks stale sent intents after restart without resending uncertain external writes', async () => {
    const { deps, adjust } = harness();
    const record = intent();
    await store.transferStore.create(record);
    await store.transferStore.transition(record, 'debit_sent');
    restartClient();
    expect(await service.recoverTransfers(deps, 0)).toEqual({ finished: 0, parked: 1, resumed: 0, failed: 0 });
    expect((await store.transferStore.get(record))?.state).toBe('needs_reconciliation');
    expect(adjust).not.toHaveBeenCalled();
    expect(await wallet.readWalletBalance(O, S, 'solaris')).toEqual({ available: 0n, reserved: 0n });
  });
});
