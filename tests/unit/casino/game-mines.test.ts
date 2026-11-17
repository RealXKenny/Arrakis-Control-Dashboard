import { describe, expect, it } from 'vitest';
import { actOnRound, getRoundView, recoverRounds, startRound } from '../../../src/features/casino/engine/round';
import type { GameModule } from '../../../src/features/casino/engine/types';
import { Rng } from '../../../src/features/casino/fairness/rng';
import { verifyRound } from '../../../src/features/casino/fairness/verify';
import { MAX_HAZARDS, TILES, mines, multiplierBps } from '../../../src/features/casino/games/mines';
import { checkInvariants } from '../../../src/features/casino/ledger/ledger';
import { build, O, S } from '../../helpers/casino-engine';

type State = Parameters<typeof mines.act>[0];
const board = (hazards: number[], wager = '100'): State => ({
  hazards,
  hazardCount: hazards.length,
  revealed: [],
  wager,
});
const reveal = (state: State, tile: number) => mines.act(state, { type: 'reveal', tile });

describe('multipliers', () => {
  it('known values', () => {
    expect(multiplierBps(3, 1)).toBe(11_250n); // 0.99 * 25/22
    expect(multiplierBps(1, 24)).toBe(247_500n); // 0.99 * 25
    expect(multiplierBps(5, 0)).toBe(10_000n);
  });
  it('are exactly fair-odds minus the 1% edge, rounded down, for every hazard count and reveal count', () => {
    for (let h = 1; h <= MAX_HAZARDS; h += 1) {
      let previous = 0n;
      for (let k = 1; k <= TILES - h; k += 1) {
        let n = 1n;
        let d = 1n;
        for (let i = 0; i < k; i += 1) {
          n *= BigInt(TILES - i);
          d *= BigInt(TILES - h - i);
        }
        const m = multiplierBps(h, k);
        // survival probability is d / n, so return = m * d / (n * 10000); floor loses less than one basis point
        expect(m * d).toBeLessThanOrEqual(9_900n * n);
        expect(m * d).toBeGreaterThan(9_900n * n - d);
        expect(m).toBeGreaterThan(previous);
        previous = m;
      }
    }
  });
});

describe('hazard placement', () => {
  it('places distinct in-range hazards, sorted, and every tile is equally likely', () => {
    const hits = Array(TILES).fill(0) as number[];
    const runs = 5000;
    for (let nonce = 0; nonce < runs; nonce += 1) {
      const { state } = mines.start(new Rng('6'.repeat(64), 'mines', nonce), 100n, { hazards: 5 }, { now: 0 });
      const { hazards } = state as State;
      expect(hazards).toHaveLength(5);
      expect(new Set(hazards).size).toBe(5);
      expect([...hazards].sort((a, b) => a - b)).toEqual(hazards);
      for (const tile of hazards) {
        expect(tile).toBeGreaterThanOrEqual(0);
        expect(tile).toBeLessThan(TILES);
        hits[tile]! += 1;
      }
    }
    for (const count of hits) {
      expect(count / runs).toBeGreaterThan(0.17);
      expect(count / runs).toBeLessThan(0.23); // expected 5/25 = 0.20
    }
  });
});

describe('rules', () => {
  it('a safe reveal raises the multiplier; cashing out pays floor(wager * multiplier)', () => {
    let { state } = reveal(board([0, 1, 2]), 10);
    ({ state } = reveal(state, 11));
    const out = mines.act(state, { type: 'cashout' });
    const bps = multiplierBps(3, 2);
    expect(out.settlement!.payout).toBe((100n * bps) / 10_000n);
    expect((out.settlement!.result as { outcome: string }).outcome).toBe('cashed_out');
  });
  it('hitting a hazard loses the wager and reveals the whole board', () => {
    const { state } = reveal(board([4, 9, 20]), 10);
    const end = reveal(state, 9);
    expect(end.settlement!.payout).toBe(0n);
    expect(end.settlement!.result).toMatchObject({ outcome: 'hazard', tile: 9, hazards: [4, 9, 20], revealed: [10] });
  });
  it('rejects revealing a tile twice and cashing out before any reveal', () => {
    const { state } = reveal(board([0]), 5);
    expect(() => reveal(state, 5)).toThrow();
    expect(() => mines.act(board([0]), { type: 'cashout' })).toThrow();
  });
  it('clearing every safe tile cashes out automatically at the top multiplier', () => {
    let state = board(Array.from({ length: 24 }, (_, i) => i + 1)); // only tile 0 is safe
    const end = reveal(state, 0);
    expect((end.settlement!.result as { outcome: string }).outcome).toBe('cleared');
    expect(end.settlement!.payout).toBe((100n * 247_500n) / 10_000n);
    state = end.state;
  });
  it('does not mutate the previous state', () => {
    const state = board([0, 1, 2]);
    const before = JSON.stringify(state);
    reveal(state, 10);
    expect(JSON.stringify(state)).toBe(before);
  });
});

describe('hidden state', () => {
  it('never shows the hazards while the round is open and shows them when it ends', () => {
    const { state } = reveal(board([4, 9, 20]), 10);
    const open = mines.view(state, false, 0) as Record<string, unknown>;
    expect(Object.keys(open)).not.toContain('hazards');
    expect(JSON.stringify(open)).not.toMatch(/"(hazards|hit)"/);
    expect(open.revealed).toEqual([10]);
    expect(open.cashoutValue).toBe(((100n * multiplierBps(3, 1)) / 10_000n).toString());
    const done = mines.view(reveal(state, 9).state, true, 0) as { hazards: number[]; hit: number };
    expect(done.hazards).toEqual([4, 9, 20]);
    expect(done.hit).toBe(9);
  });
});

describe('input validation', () => {
  it('only allows 1 to 24 hazards', () => {
    expect(mines.parseParams({ hazards: 1 })).toEqual({ hazards: 1 });
    expect(mines.parseParams({ hazards: 24 })).toEqual({ hazards: 24 });
    for (const bad of [{ hazards: 0 }, { hazards: 25 }, { hazards: 2.5 }, { hazards: '3' }, {}, null])
      expect(() => mines.parseParams(bad)).toThrow();
  });
  it('rejects malformed actions', () => {
    expect(mines.parseAction({ type: 'reveal', tile: 24 })).toEqual({ type: 'reveal', tile: 24 });
    for (const bad of [
      { type: 'reveal', tile: -1 },
      { type: 'reveal', tile: 25 },
      { type: 'reveal', tile: 1.5 },
      { type: 'reveal', tile: 'a' },
      { type: 'dig' },
      null,
    ])
      expect(() => mines.parseAction(bad)).toThrow();
  });
});

describe('through the engine', () => {
  const games = { [mines.id]: mines as GameModule };
  const params = { hazards: 3 };
  const hazardsOf = (b: ReturnType<typeof build>, id: string) => (b.rounds.get(`${O}:${id}`)!.state as State).hazards;

  it('keeps hazards server-side, settles a cash-out once, and replays from the seed', async () => {
    const b = build(1000n, games);
    const opened = await startRound(b.deps, {
      owner: O,
      server: S,
      game: mines.id,
      wager: '100',
      params,
      idempotencyKey: 'mines-key-001',
    });
    expect(opened.status).toBe('open');
    expect(JSON.stringify(opened)).not.toMatch(/"hazards"/);
    const hazards = hazardsOf(b, opened.id);
    const safe = Array.from({ length: TILES }, (_, i) => i).filter((tile) => !hazards.includes(tile));
    await actOnRound(b.deps, { owner: O, server: S, roundId: opened.id, action: { type: 'reveal', tile: safe[0] } });
    const mid = await getRoundView(b.deps, { owner: O, server: S, id: opened.id });
    expect(JSON.stringify(mid)).not.toMatch(/"hazards"/);
    await actOnRound(b.deps, { owner: O, server: S, roundId: opened.id, action: { type: 'reveal', tile: safe[1] } });
    const done = await actOnRound(b.deps, { owner: O, server: S, roundId: opened.id, action: { type: 'cashout' } });
    expect(done.status).toBe('settled');
    expect(done.settlement!.payout).toBe(((100n * multiplierBps(3, 2)) / 10_000n).toString());
    expect(JSON.stringify(done.game_view)).toMatch(/hazards/);
    expect(b.wallet().available).toBe(900n + BigInt(done.settlement!.payout));
    expect(checkInvariants(b.wallet())).toEqual([]);
    const record = b.rounds.get(`${O}:${opened.id}`)!;
    const seed = b.seedOf.get(`${O}:${opened.id}`)!;
    expect(
      verifyRound(mines as GameModule, { ...seed, wager: 100n, params, actions: record.actions }, done.settlement!),
    ).toEqual({ ok: true });
    await expect(
      actOnRound(b.deps, { owner: O, server: S, roundId: opened.id, action: { type: 'cashout' } }),
    ).rejects.toMatchObject({ code: 'ROUND_CLOSED' });
  });

  it('a hazard ends the round with a loss and a revealed board', async () => {
    const b = build(1000n, games);
    const opened = await startRound(b.deps, {
      owner: O,
      server: S,
      game: mines.id,
      wager: '100',
      params,
      idempotencyKey: 'mines-key-002',
    });
    const hit = hazardsOf(b, opened.id)[0]!;
    const done = await actOnRound(b.deps, {
      owner: O,
      server: S,
      roundId: opened.id,
      action: { type: 'reveal', tile: hit },
    });
    expect(done.settlement!.payout).toBe('0');
    expect((done.game_view as { hazards: number[] }).hazards).toContain(hit);
    expect([b.wallet().available, b.wallet().reserved]).toEqual([900n, 0n]);
  });

  it('an interrupted cash-out is settled exactly once by recovery', async () => {
    const b = build(1000n, games);
    const opened = await startRound(b.deps, {
      owner: O,
      server: S,
      game: mines.id,
      wager: '100',
      params,
      idempotencyKey: 'mines-key-003',
    });
    const hazards = hazardsOf(b, opened.id);
    const tile = Array.from({ length: TILES }, (_, i) => i).find((t) => !hazards.includes(t))!;
    await actOnRound(b.deps, { owner: O, server: S, roundId: opened.id, action: { type: 'reveal', tile } });
    b.state.failOn = '.settle0';
    b.state.failCount = 1;
    await expect(
      actOnRound(b.deps, { owner: O, server: S, roundId: opened.id, action: { type: 'cashout' } }),
    ).rejects.toThrow('wallet down');
    expect(b.rounds.get(`${O}:${opened.id}`)!.status).toBe('settling');
    expect(await recoverRounds(b.deps)).toMatchObject({ settled: 1 });
    expect(b.walletCalls.filter((op) => op.type === 'settle')).toHaveLength(1);
    expect(b.wallet().reserved).toBe(0n);
  });

  it('an abandoned board is refunded in full after 24 hours', async () => {
    const b = build(1000n, games);
    const opened = await startRound(b.deps, {
      owner: O,
      server: S,
      game: mines.id,
      wager: '100',
      params,
      idempotencyKey: 'mines-key-004',
    });
    b.state.clock += 25 * 3_600_000;
    expect(await recoverRounds(b.deps)).toMatchObject({ voided: 1 });
    expect([b.wallet().available, b.wallet().reserved]).toEqual([1000n, 0n]);
    expect((await getRoundView(b.deps, { owner: O, server: S, id: opened.id })).failureCode).toBe('ABANDONED');
  });
});
