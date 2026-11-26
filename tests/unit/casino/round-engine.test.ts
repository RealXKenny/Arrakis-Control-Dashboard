import { describe, expect, it } from 'vitest';
import { actOnRound, getRoundView, recoverRounds, startRound } from '../../../src/features/casino/engine/round';
import { engineError, type GameModule } from '../../../src/features/casino/engine/types';
import { commitSeed, type Rng } from '../../../src/features/casino/fairness/rng';
import { verifyRound } from '../../../src/features/casino/fairness/verify';
import { checkInvariants } from '../../../src/features/casino/ledger/ledger';
import { build as buildHarness, O, S } from '../../helpers/casino-engine';

type StairsState = { bomb: number; step: number; wager: string; doubled: boolean };
type StairsAction = { type: 'step' } | { type: 'cashout' } | { type: 'double' };

/** Test game: climb stairs; one hidden bomb among 3 steps. Exercises hidden state, extra holds, settlement. */
const stairs: GameModule<StairsState, StairsAction> = {
  id: 'stairs',
  minWager: 10n,
  maxWager: 1000n,
  parseParams: () => ({}),
  parseAction(raw) {
    const type = (raw as { type?: string } | null)?.type;
    if (type !== 'step' && type !== 'cashout' && type !== 'double') throw engineError('INVALID_ACTION', 'bad action');
    return { type };
  },
  start: (rng: Rng, wager) => ({ state: { bomb: rng.int(3), step: 0, wager: wager.toString(), doubled: false } }),
  act(state, action) {
    const total = BigInt(state.wager) * (state.doubled ? 2n : 1n);
    if (action.type === 'double') {
      if (state.doubled || state.step === 0) throw engineError('ILLEGAL_ACTION', 'no');
      return { state: { ...state, doubled: true }, additionalWager: BigInt(state.wager) };
    }
    if (action.type === 'cashout') {
      if (state.step === 0) throw engineError('ILLEGAL_ACTION', 'no');
      return {
        state,
        settlement: { payout: total * BigInt(state.step), result: { cashedOutAt: state.step, bomb: state.bomb } },
      };
    }
    if (state.step === state.bomb)
      return { state, settlement: { payout: 0n, result: { exploded: true, bomb: state.bomb } } };
    const step = state.step + 1;
    return step === 3
      ? { state: { ...state, step }, settlement: { payout: total * 4n, result: { cleared: true, bomb: state.bomb } } }
      : { state: { ...state, step } };
  },
  view: (state, finished) => (finished ? { step: state.step, bomb: state.bomb } : { step: state.step }),
};

/** Instant game for single-call settlement. */
const flip: GameModule<{ win: boolean }, never> = {
  id: 'flip',
  minWager: 1n,
  maxWager: 1000n,
  parseParams: () => ({}),
  parseAction: () => {
    throw engineError('INVALID_ACTION', 'none');
  },
  start: (rng, wager) => {
    const win = rng.int(2) === 0;
    return { state: { win }, settlement: { payout: win ? wager * 2n : 0n, result: { win } } };
  },
  act: (state) => ({ state }),
  view: (state) => state,
};

const games = { stairs: stairs as GameModule, flip: flip as GameModule };
const build = (balance = 1000n) => buildHarness(balance, games);

/** A fresh fixture whose round survived its first step (the hidden bomb is not on step 0). */
async function safeStep(balance = 1000n) {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const b = build(balance);
    const opened = await startRound(b.deps, {
      owner: O,
      server: S,
      game: 'stairs',
      wager: '100',
      idempotencyKey: `safe-key-${attempt}`,
    });
    const stepped = await actOnRound(b.deps, { owner: O, server: S, roundId: opened.id, action: { type: 'step' } });
    if (stepped.status === 'open') return { b, id: opened.id };
  }
  throw new Error('no safe first step found');
}
const act = (b: ReturnType<typeof build>, id: string, type: string) =>
  actOnRound(b.deps, { owner: O, server: S, roundId: id, action: { type } });

const start = (b: ReturnType<typeof build>, game: string, wager: unknown, key = 'round-key-01', owner = O) =>
  startRound(b.deps, { owner, server: S, game, wager, idempotencyKey: key });

describe('instant rounds', () => {
  it('reserve, derive from the committed seed, settle once, and verify independently', async () => {
    const b = build();
    const view = await start(b, 'flip', '100');
    expect(view.status).toBe('settled');
    const win = (view.settlement!.result as { win: boolean }).win;
    expect([b.wallet().available, b.wallet().reserved]).toEqual([win ? 1100n : 900n, 0n]);
    expect(checkInvariants(b.wallet())).toEqual([]);
    expect(b.open.size).toBe(0);
    const seed = b.seedOf.get(`${O}:${view.id}`)!;
    expect(view.fairness).toEqual({ commitment: seed.commitment, clientSeed: seed.clientSeed, nonce: seed.nonce });
    const ok = verifyRound(flip as GameModule, { ...seed, wager: 100n, params: {}, actions: [] }, view.settlement!);
    expect(ok).toEqual({ ok: true });
    const bad = verifyRound(
      flip as GameModule,
      { ...seed, wager: 100n, params: {}, actions: [] },
      { payout: '999', result: view.settlement!.result },
    );
    expect(bad).toEqual({ ok: false, reason: 'PAYOUT_MISMATCH' });
    expect(
      verifyRound(
        flip as GameModule,
        { ...seed, commitment: commitSeed('c'.repeat(64)), wager: 100n, params: {}, actions: [] },
        view.settlement!,
      ).reason,
    ).toBe('COMMITMENT_MISMATCH');
  });

  it('a replayed start returns the same round and moves money exactly once', async () => {
    const b = build();
    const first = await start(b, 'flip', '100');
    const again = await start(b, 'flip', '100');
    expect(again).toEqual(first);
    expect(b.walletCalls.filter((op) => op.type === 'reserve')).toHaveLength(1);
    expect(b.walletCalls.filter((op) => op.type === 'settle')).toHaveLength(1);
  });

  it('concurrent identical starts produce one round and one settlement', async () => {
    const b = build();
    const results = await Promise.all([start(b, 'flip', '100'), start(b, 'flip', '100')]);
    expect(results[0]!.id).toBe(results[1]!.id);
    expect(b.walletCalls.filter((op) => op.type === 'settle')).toHaveLength(1);
    expect(checkInvariants(b.wallet())).toEqual([]);
  });

  it('enforces limits, idempotency parameters and funds', async () => {
    const b = build(50n);
    await expect(start(b, 'flip', '0')).rejects.toThrow();
    await expect(start(b, 'flip', '1001')).rejects.toMatchObject({ code: 'INVALID_WAGER' });
    await expect(start(b, 'nope', '5')).rejects.toMatchObject({ code: 'UNKNOWN_GAME' });
    await expect(start(b, 'flip', '5', 'short')).rejects.toMatchObject({ code: 'INVALID_REQUEST' });
    await expect(start(b, 'flip', '100', 'broke-key-1')).rejects.toMatchObject({ code: 'INSUFFICIENT_FUNDS' });
    expect(b.wallet().available).toBe(50n);
    expect((await getRoundView(b.deps, { owner: O, server: S, id: 'r_broke-key-1' })).status).toBe('voided');
    await start(b, 'flip', '10', 'same-key-01');
    await expect(start(b, 'flip', '11', 'same-key-01')).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });
  });
});

describe('interactive rounds', () => {
  it('hides the hidden state until the round ends and cannot be touched by other users', async () => {
    const b = build();
    const view = await start(b, 'stairs', '100');
    expect(view.status).toBe('open');
    expect(JSON.stringify(view)).not.toContain('bomb');
    expect(b.wallet().reserved).toBe(100n);
    await expect(
      actOnRound(b.deps, { owner: 'user-2', server: S, roundId: view.id, action: { type: 'step' } }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(
      actOnRound(b.deps, { owner: O, server: 'other', roundId: view.id, action: { type: 'step' } }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(
      actOnRound(b.deps, { owner: O, server: S, roundId: view.id, action: { type: 'cashout' } }),
    ).rejects.toMatchObject({ code: 'ILLEGAL_ACTION' });
    await expect(
      actOnRound(b.deps, { owner: O, server: S, roundId: view.id, action: { type: 'hack' } }),
    ).rejects.toMatchObject({ code: 'INVALID_ACTION' });
  });

  it('plays to completion, settles once, rejects further actions, and replays from the seed', async () => {
    const b = build();
    const opened = await start(b, 'stairs', '100');
    let latest = opened;
    while (latest.status === 'open')
      latest = await actOnRound(b.deps, { owner: O, server: S, roundId: opened.id, action: { type: 'step' } });
    expect(latest.status).toBe('settled');
    expect(JSON.stringify(latest.game_view)).toContain('bomb');
    const payout = BigInt(latest.settlement!.payout);
    expect([b.wallet().available, b.wallet().reserved]).toEqual([900n + payout, 0n]);
    await expect(
      actOnRound(b.deps, { owner: O, server: S, roundId: opened.id, action: { type: 'step' } }),
    ).rejects.toMatchObject({ code: 'ROUND_CLOSED' });
    const record = b.rounds.get(`${O}:${opened.id}`)!;
    const seed = b.seedOf.get(`${O}:${opened.id}`)!;
    expect(
      verifyRound(
        stairs as GameModule,
        { ...seed, wager: 100n, params: {}, actions: record.actions },
        latest.settlement!,
      ),
    ).toEqual({ ok: true });
    expect(checkInvariants(b.wallet())).toEqual([]);
  });

  it('double down reserves an extra hold and settles both holds', async () => {
    const { b, id } = await safeStep();
    const doubled = await act(b, id, 'double');
    expect(doubled.holds).toBe(2);
    expect(b.wallet().reserved).toBe(200n);
    const done = await act(b, id, 'cashout');
    expect(done.settlement!.payout).toBe('200');
    expect([b.wallet().available, b.wallet().reserved]).toEqual([1000n, 0n]);
    expect(checkInvariants(b.wallet())).toEqual([]);
  });

  it('refuses a double down the balance cannot cover and leaves the round untouched', async () => {
    const { b, id } = await safeStep(150n);
    await expect(act(b, id, 'double')).rejects.toMatchObject({ code: 'INSUFFICIENT_FUNDS' });
    const record = b.rounds.get(`${O}:${id}`)!;
    expect([record.pending, record.holds, record.status]).toEqual([undefined, 1, 'open']);
    expect(b.wallet().reserved).toBe(100n);
    expect((await act(b, id, 'cashout')).status).toBe('settled');
  });

  it('two simultaneous identical actions settle exactly once', async () => {
    const { b, id } = await safeStep();
    const results = await Promise.allSettled([act(b, id, 'cashout'), act(b, id, 'cashout')]);
    expect(results.filter((r) => r.status === 'fulfilled').length).toBeGreaterThanOrEqual(1);
    expect(b.walletCalls.filter((op) => op.type === 'settle')).toHaveLength(1);
    expect(b.wallet().reserved).toBe(0n);
    expect(checkInvariants(b.wallet())).toEqual([]);
  });
});

describe('recovery', () => {
  it('finishes a settlement interrupted at the wallet, exactly once', async () => {
    const b = build();
    b.state.failOn = '.settle0';
    b.state.failCount = 1;
    await expect(start(b, 'flip', '100')).rejects.toThrow('wallet down');
    expect(b.rounds.get(`${O}:r_round-key-01`)!.status).toBe('settling');
    expect(await recoverRounds(b.deps)).toMatchObject({ settled: 1 });
    expect(b.rounds.get(`${O}:r_round-key-01`)!.status).toBe('settled');
    expect(b.walletCalls.filter((op) => op.type === 'settle')).toHaveLength(1);
    expect(b.wallet().reserved).toBe(0n);
    expect(b.open.size).toBe(0);
  });

  it('refunds a round whose setup was interrupted and one abandoned while open', async () => {
    const b = build();
    b.state.failOn = '.reserve0';
    b.state.failCount = 1;
    await expect(start(b, 'flip', '100', 'setup-key-1')).rejects.toThrow('wallet down');
    const opened = await start(b, 'stairs', '100', 'open-key-01');
    expect(b.wallet().reserved).toBe(100n);
    b.state.clock += 25 * 3_600_000;
    expect(await recoverRounds(b.deps)).toMatchObject({ voided: 2 });
    expect([b.wallet().available, b.wallet().reserved]).toEqual([1000n, 0n]);
    expect((await getRoundView(b.deps, { owner: O, server: S, id: opened.id })).failureCode).toBe('ABANDONED');
    expect(b.open.size).toBe(0);
  });

  it('completes an interrupted double-down instead of losing or confiscating the extra hold', async () => {
    const { b, id } = await safeStep();
    b.state.failOn = '.reserve1';
    b.state.failCount = 1;
    await expect(act(b, id, 'double')).rejects.toThrow('wallet down');
    expect(b.rounds.get(`${O}:${id}`)!.pending).toBeDefined();
    b.state.clock += 200_000;
    expect(await recoverRounds(b.deps)).toMatchObject({ resumed: 1 });
    const record = b.rounds.get(`${O}:${id}`)!;
    expect([record.holds, record.pending]).toEqual([2, undefined]);
    expect(b.wallet().reserved).toBe(200n);
    expect(checkInvariants(b.wallet())).toEqual([]);
  });
});
