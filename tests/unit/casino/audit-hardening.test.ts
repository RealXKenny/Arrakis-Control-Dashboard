import { describe, expect, it, vi } from 'vitest';
import { getRoundView, recoverRounds, startRound, type EngineDeps } from '../../../src/features/casino/engine/round';
import type { GameModule } from '../../../src/features/casino/engine/types';
import { verifyRound } from '../../../src/features/casino/fairness/verify';
import { blackjack, blackjackFromShoe, legalActions } from '../../../src/features/casino/games/blackjack';
import { coinFlip } from '../../../src/features/casino/games/coin-flip';
import { mines } from '../../../src/features/casino/games/mines';
import { checkInvariants } from '../../../src/features/casino/ledger/ledger';
import { build, O, S } from '../../helpers/casino-engine';

const DAY = 25 * 3_600_000;
const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
const shoe = (...ranks: string[]) =>
  [...ranks.map((r) => RANKS.indexOf(r)), ...Array(60).fill(RANKS.indexOf('2'))].slice(0, 60);

describe('abandoned rounds are played out, never refunded, when the player has seen something', () => {
  it('walking away from a Blackjack hand is exactly standing: there is no free option to fold', () => {
    // A weak hand against a strong up card is where a free fold would be most valuable.
    for (const [player, dealer] of [
      [
        ['K', '6'],
        ['K', '7'],
      ],
      [
        ['9', '7'],
        ['A', '5'],
      ],
      [
        ['10', '5'],
        ['10', '9'],
      ],
      [
        ['8', '8'],
        ['K', '6'],
      ],
    ] as const) {
      const start = blackjackFromShoe(shoe(player[0], dealer[0], player[1], dealer[1], '10', '10', '5'), 10n);
      expect(start.settlement).toBeUndefined();
      const stood = blackjack.act(start.state, { type: 'stand' });
      const left = blackjack.act(start.state, { type: 'abandon' });
      expect(left.settlement!.payout).toBe(stood.settlement!.payout);
      expect(left.settlement!.result).toEqual(stood.settlement!.result);
    }
  });

  it('stands every hand of a split, and cannot be applied twice', () => {
    const start = blackjackFromShoe(shoe('8', '6', '8', 'K', '3', 'K', '10', '2'), 10n);
    const split = blackjack.act(start.state, { type: 'split' });
    expect(split.settlement).toBeUndefined();
    const left = blackjack.act(split.state, { type: 'abandon' });
    expect(left.settlement).toBeDefined();
    expect(left.state.hands.every((hand) => hand.done)).toBe(true);
    expect(() => blackjack.act(left.state, { type: 'abandon' })).toThrow();
    expect(legalActions(left.state)).toEqual([]);
  });

  it('the engine settles an abandoned Blackjack round by standing: it is not voided and still replays', async () => {
    const b = build(100_000n, { [blackjack.id]: blackjack as GameModule });
    let id = '';
    for (let attempt = 0; attempt < 100 && !id; attempt += 1) {
      const view = await startRound(b.deps, {
        owner: O,
        server: S,
        game: blackjack.id,
        wager: '100',
        idempotencyKey: `abandon-bj-${String(attempt).padStart(3, '0')}`,
      });
      if (view.status === 'open') id = view.id;
    }
    expect(id).not.toBe('');
    const afterStart = b.wallet().available; // wager already held; earlier instant naturals do not matter
    b.state.clock += DAY;
    const summary = await recoverRounds(b.deps);
    expect(summary).toMatchObject({ settled: 1, voided: 0, failed: 0 });
    const record = b.rounds.get(`${O}:${id}`)!;
    expect(record.status).toBe('settled');
    expect(record.failureCode).toBeUndefined();
    expect(record.actions).toEqual([{ type: 'abandon' }]);
    expect(b.wallet().reserved).toBe(0n);
    expect(b.wallet().available).toBe(afterStart + BigInt(record.settlement!.payout));
    expect(checkInvariants(b.wallet())).toEqual([]);
    const seed = b.seedOf.get(`${O}:${id}`)!;
    expect(
      verifyRound(
        blackjack as GameModule,
        { ...seed, wager: 100n, params: {}, actions: record.actions },
        record.settlement!,
      ),
    ).toEqual({ ok: true });
    expect(b.deps.audit).toHaveBeenCalledWith(expect.objectContaining({ event: 'casino.round.abandoned' }));
  });

  it('Mines: leaving after a reveal banks the harvest; leaving before any reveal refunds in full', async () => {
    const b = build(10_000n, { [mines.id]: mines as GameModule });
    const params = { hazards: 3 };
    const fresh = await startRound(b.deps, {
      owner: O,
      server: S,
      game: mines.id,
      wager: '100',
      params,
      idempotencyKey: 'abandon-mines-0',
    });
    const touched = await startRound(b.deps, {
      owner: O,
      server: S,
      game: mines.id,
      wager: '100',
      params,
      idempotencyKey: 'abandon-mines-1',
    });
    const state = b.rounds.get(`${O}:${touched.id}`)!.state as { hazards: number[] };
    const tile = Array.from({ length: 25 }, (_, i) => i).find((t) => !state.hazards.includes(t))!;
    const { actOnRound } = await import('../../../src/features/casino/engine/round');
    await actOnRound(b.deps, { owner: O, server: S, roundId: touched.id, action: { type: 'reveal', tile } });
    b.state.clock += DAY;
    expect(await recoverRounds(b.deps)).toMatchObject({ settled: 1, voided: 1, failed: 0 });
    expect(b.rounds.get(`${O}:${fresh.id}`)!.status).toBe('voided');
    const banked = b.rounds.get(`${O}:${touched.id}`)!;
    expect(banked.status).toBe('settled');
    expect(banked.settlement!.payout).toBe(((100n * 11_250n) / 10_000n).toString());
    expect(b.wallet().reserved).toBe(0n);
    expect(checkInvariants(b.wallet())).toEqual([]);
  });
});

describe('recovery sweeps', () => {
  it('one round that keeps failing does not stop the sweep reaching the others', async () => {
    const b = build(10_000n, { [coinFlip.id]: coinFlip as GameModule });
    const params = { side: 'scarab' };
    b.state.failOn = '.settle0';
    b.state.failCount = 2;
    for (const key of ['poison-key-1', 'healthy-key1'])
      await expect(
        startRound(b.deps, { owner: O, server: S, game: coinFlip.id, wager: '100', params, idempotencyKey: key }),
      ).rejects.toThrow('wallet down');
    expect([...b.rounds.values()].map((r) => r.status)).toEqual(['settling', 'settling']);

    b.state.failOn = 'r_poison-key-1.settle0';
    b.state.failCount = 99;
    const summary = await recoverRounds(b.deps);
    expect(summary).toMatchObject({ settled: 1, failed: 1 });
    expect(b.rounds.get(`${O}:r_healthy-key1`)!.status).toBe('settled');
    expect(b.rounds.get(`${O}:r_poison-key-1`)!.status).toBe('settling');
    expect(b.deps.audit).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'casino.round.recovery_failed',
        data: expect.objectContaining({ id: 'r_poison-key-1' }),
      }),
    );
    b.state.failCount = 0; // the fault clears: the next sweep finishes it
    expect(await recoverRounds(b.deps)).toMatchObject({ settled: 1, failed: 0 });
  });

  it('reads every page of the open set, so rounds beyond the first 200 are still recovered', async () => {
    const pages: number[] = [];
    const forgotten: string[] = [];
    const total = 450;
    const refs = Array.from({ length: total }, (_, i) => ({ owner: 'u', server: 's', id: `r${i}` }));
    const deps = {
      games: {},
      wallet: { apply: vi.fn() },
      seeds: { allocate: vi.fn(), release: vi.fn() },
      now: () => 0,
      audit: vi.fn(),
      rounds: {
        create: vi.fn(),
        cas: vi.fn(),
        async listOpen(offset = 0, limit = 200) {
          pages.push(offset);
          return refs.slice(offset, offset + limit);
        },
        async get() {
          return null; // every entry is stale: it must be forgotten
        },
        async forget(ref: { id: string }) {
          forgotten.push(ref.id);
        },
      },
    } as unknown as EngineDeps;
    await recoverRounds(deps);
    expect(pages).toEqual([0, 200, 400]);
    expect(forgotten).toHaveLength(total);
  });

  it('a crashed flight is settled by looking at it, even when nothing else ever runs', async () => {
    // Guards the same property from the abandon change: due() still runs before abandonment is considered.
    const { crash } = await import('../../../src/features/casino/games/crash');
    const b = build(10_000n, { [crash.id]: crash as GameModule });
    const view = await startRound(b.deps, {
      owner: O,
      server: S,
      game: crash.id,
      wager: '100',
      idempotencyKey: 'crash-after-24h',
    });
    b.state.clock += DAY;
    const seen = await getRoundView(b.deps, { owner: O, server: S, id: view.id });
    expect(seen.status).toBe('settled');
    expect(seen.failureCode).toBeNull();
  });
});
