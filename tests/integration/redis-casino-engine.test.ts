import type { Redis } from 'ioredis';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { configureApplication, connectDirect, integrationTarget } from './helpers/redis-target';

const target = integrationTarget();
configureApplication(target);
vi.mock('../../src/lib/assert-server', () => ({}));

let direct: Redis;
let seeds: typeof import('../../src/features/casino/server/seed-store');
let rounds: typeof import('../../src/features/casino/server/round-store');
let wallet: typeof import('../../src/features/casino/server/wallet-store');
let engine: typeof import('../../src/features/casino/engine/round');
let rng: typeof import('../../src/features/casino/fairness/rng');
let transfers: typeof import('../../src/features/casino/server/transfer-store');

beforeAll(async () => {
  direct = connectDirect(target);
  seeds = await import('../../src/features/casino/server/seed-store');
  rounds = await import('../../src/features/casino/server/round-store');
  wallet = await import('../../src/features/casino/server/wallet-store');
  engine = await import('../../src/features/casino/engine/round');
  rng = await import('../../src/features/casino/fairness/rng');
  transfers = await import('../../src/features/casino/server/transfer-store');
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

describe('Redis seed store', () => {
  it('allocates idempotently per round, increments nonces, and never exposes the active seed publicly', async () => {
    const a = await seeds.seedStore.allocate(O, S, 'round-a');
    const again = await seeds.seedStore.allocate(O, S, 'round-a');
    const b = await seeds.seedStore.allocate(O, S, 'round-b');
    expect(again).toEqual(a);
    expect([a.nonce, b.nonce]).toEqual([0, 1]);
    expect(rng.verifyCommitment(a.serverSeed, a.commitment)).toBe(true);
    const pub = await seeds.readPublicSeedState(O, S);
    expect(JSON.stringify(pub)).not.toContain(a.serverSeed);
    expect(pub).toMatchObject({ commitment: a.commitment, nonce: 2, revealed: [] });
  });

  it('refuses rotation while a round is open, then reveals a seed that matches its commitment', async () => {
    const a = await seeds.seedStore.allocate(O, S, 'round-a');
    await expect(seeds.rotateSeed(O, S)).rejects.toMatchObject({ code: 'ROUND_OPEN' });
    await seeds.seedStore.release(O, S, 'round-a');
    const rotated = await seeds.rotateSeed(O, S, 'my-client-seed');
    expect(rotated.revealed).toMatchObject({ serverSeed: a.serverSeed, commitment: a.commitment, rounds: 1 });
    const pub = await seeds.readPublicSeedState(O, S);
    expect(pub.commitment).toBe(rotated.nextCommitment);
    expect(pub.clientSeed).toBe('my-client-seed');
    expect(pub.revealed[0]).toMatchObject({ serverSeed: a.serverSeed });
  });

  it('isolates accounts', async () => {
    await seeds.seedStore.allocate(O, S, 'round-a');
    expect((await seeds.readPublicSeedState('discord-2', S)).commitment).toBeNull();
  });
});

describe('Redis round store', () => {
  const draft = (id: string) => ({
    id,
    owner: O,
    server: S,
    game: 'g',
    status: 'reserving' as const,
    wager: '10',
    params: {},
    holds: 1,
    version: 0,
    actions: [],
    createdAt: 1,
    updatedAt: 1,
  });

  it('creates once, compare-and-sets by version and status, and lists open rounds', async () => {
    const first = await rounds.roundStore.create(draft('r1'));
    expect(first.created).toBe(true);
    expect((await rounds.roundStore.create(draft('r1'))).created).toBe(false);
    const opened = await rounds.roundStore.cas(first.round, { status: 'open', state: { s: 1 } });
    expect(opened).toMatchObject({ version: 1, status: 'open' });
    await expect(rounds.roundStore.cas(first.round, { status: 'open' })).rejects.toMatchObject({
      code: 'STATE_CONFLICT',
    });
    expect(await rounds.roundStore.listOpen()).toEqual([{ owner: O, server: S, id: 'r1' }]);
    await rounds.roundStore.cas(opened, { status: 'settled' });
    expect(await rounds.roundStore.listOpen()).toEqual([]);
    expect((await rounds.listRounds(O, S)).map((r) => r.id)).toEqual(['r1']);
    expect(await rounds.roundStore.get({ owner: 'discord-2', server: S, id: 'r1' })).toBeNull();
  });
});

describe('engine on real Redis', () => {
  const coin = {
    id: 'coin',
    minWager: 1n,
    maxWager: 1000n,
    parseParams: () => ({}),
    parseAction: () => {
      throw new Error('none');
    },
    start: (r: InstanceType<typeof import('../../src/features/casino/fairness/rng').Rng>, wager: bigint) => {
      const win = r.int(2) === 0;
      return { state: { win }, settlement: { payout: win ? wager * 2n : 0n, result: { win } } };
    },
    act: (state: unknown) => ({ state }),
    view: (state: unknown) => state,
  };

  it('plays and settles an instant round with exact accounting and a verifiable seed', async () => {
    await wallet.applyWalletOperation(O, S, 'solaris', { type: 'deposit_credit', key: 'seed', amount: 1000n });
    const deps = {
      games: { coin },
      wallet: { apply: wallet.applyWalletOperation },
      rounds: rounds.roundStore,
      seeds: seeds.seedStore,
      now: () => Date.now(),
      maxPayout: 10n ** 15n,
      audit: () => undefined,
    };
    const view = await engine.startRound(deps, {
      owner: O,
      server: S,
      game: 'coin',
      wager: '100',
      idempotencyKey: 'coin-key-001',
    });
    const replay = await engine.startRound(deps, {
      owner: O,
      server: S,
      game: 'coin',
      wager: '100',
      idempotencyKey: 'coin-key-001',
    });
    expect(replay).toEqual(view);
    expect(view.status).toBe('settled');
    const win = (view.settlement!.result as { win: boolean }).win;
    expect(await wallet.readWalletBalance(O, S, 'solaris')).toEqual({ available: win ? 1100n : 900n, reserved: 0n });
    const rotated = await seeds.rotateSeed(O, S);
    expect(rng.verifyCommitment(rotated.revealed!.serverSeed, view.fairness!.commitment)).toBe(true);
    expect(transfers.transferStore).toBeDefined();
  });
});
