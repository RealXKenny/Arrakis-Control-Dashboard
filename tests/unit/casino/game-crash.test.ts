import { describe, expect, it } from 'vitest';
import { actOnRound, getRoundView, recoverRounds, startRound } from '../../../src/features/casino/engine/round';
import type { GameModule } from '../../../src/features/casino/engine/types';
import { verifyRound } from '../../../src/features/casino/fairness/verify';
import { CAP_BPS, TICK_MS, crash, crashPointFor, multiplierAt } from '../../../src/features/casino/games/crash';
import { checkInvariants } from '../../../src/features/casino/ledger/ledger';
import { build, O, S } from '../../helpers/casino-engine';

type State = Parameters<typeof crash.act>[0];
const flight = (crashBps: number, capped = false, startedAt = 1000): State => ({
  crashBps,
  capped,
  startedAt,
  wager: '100',
});
const cashout = (state: State, at: number) => crash.act(state, { type: 'cashout', at });

describe('multiplier curve', () => {
  it('is deterministic integer maths: flat for the first tick, then 0.5% per 50 ms', () => {
    expect(multiplierAt(0)).toBe(10_000);
    expect(multiplierAt(TICK_MS - 1)).toBe(10_000);
    expect(multiplierAt(TICK_MS)).toBe(10_050);
    expect(multiplierAt(2 * TICK_MS)).toBe(10_100);
    expect(multiplierAt(-500)).toBe(10_000);
    const tenSeconds = multiplierAt(10_000);
    expect(tenSeconds).toBeGreaterThan(27_100);
    expect(tenSeconds).toBeLessThan(27_130);
  });
  it('never decreases and stops at the 1,000x cap', () => {
    let previous = 0;
    for (let ms = 0; ms <= 80_000; ms += 50) {
      const m = multiplierAt(ms);
      expect(m).toBeGreaterThanOrEqual(previous);
      expect(m).toBeLessThanOrEqual(CAP_BPS);
      previous = m;
    }
    expect(multiplierAt(1e9)).toBe(CAP_BPS);
  });
});

describe('crash point distribution (exhaustive over all 1,000,000 seeds values)', () => {
  it('returns 99% for every cash-out target and crashes instantly 1% of the time', () => {
    const targets = [10_000, 12_500, 20_000, 50_000, 100_000, 1_000_000, CAP_BPS];
    const reached = targets.map(() => 0);
    let instant = 0;
    for (let u = 0; u < 1_000_000; u += 1) {
      const { crashBps } = crashPointFor(u);
      if (crashBps < 10_000) instant += 1;
      targets.forEach((target, index) => {
        if (crashBps >= target) reached[index]! += 1;
      });
    }
    expect(instant / 1_000_000).toBe(0.01);
    targets.forEach((target, index) => {
      const rtp = (reached[index]! / 1_000_000) * (target / 10_000);
      expect(rtp, `target ${target}`).toBeLessThanOrEqual(0.99 + 1e-9);
      expect(rtp, `target ${target}`).toBeGreaterThan(0.9899);
    });
  });
  it('caps at 1,000x and flags it', () => {
    expect(crashPointFor(999_999)).toEqual({ crashBps: CAP_BPS, capped: true });
    expect(crashPointFor(0).capped).toBe(false);
  });
});

describe('settlement by server time', () => {
  it('cashing out before the crash pays floor(wager * multiplier) at the server time', () => {
    const state = flight(30_000);
    const at = 1000 + 100 * TICK_MS; // 100 ticks -> 1.005^100
    const m = multiplierAt(100 * TICK_MS);
    expect(m).toBeLessThan(30_000);
    const out = cashout(state, at);
    expect(out.settlement!.payout).toBe((100n * BigInt(m)) / 10_000n);
    expect(out.settlement!.result).toMatchObject({ outcome: 'cashed_out', cashedOutBps: m, crashBps: 30_000 });
  });
  it('cashing out at or after the crash point loses', () => {
    const state = flight(20_000);
    let n = 0;
    while (multiplierAt(n * TICK_MS) < 20_000) n += 1;
    expect(cashout(state, 1000 + (n - 1) * TICK_MS).settlement!.payout).toBeGreaterThan(0n);
    expect(cashout(state, 1000 + n * TICK_MS).settlement!.payout).toBe(0n);
    expect(cashout(state, 1000 + n * TICK_MS).settlement!.result).toMatchObject({ outcome: 'crashed' });
  });
  it('an instant crash loses even at time zero', () => {
    expect(cashout(flight(9_000), 1000).settlement!.payout).toBe(0n);
  });
  it('a flight alive at the cap cashes out automatically at 1,000x', () => {
    const state = flight(CAP_BPS, true);
    const late = crash.act(state, { type: 'expire', at: 1000 + 200_000 });
    expect(late.settlement!.payout).toBe((100n * BigInt(CAP_BPS)) / 10_000n);
    expect(late.settlement!.result).toMatchObject({ outcome: 'cap' });
  });
  it('due() fires exactly when the multiplier reaches the crash point, and expire is refused before that', () => {
    const state = flight(15_000);
    let n = 0;
    while (multiplierAt(n * TICK_MS) < 15_000) n += 1;
    expect(crash.due!(state, 1000 + (n - 1) * TICK_MS)).toBeUndefined();
    expect(crash.due!(state, 1000 + n * TICK_MS)).toEqual({ type: 'expire', at: 1000 + n * TICK_MS });
    expect(() => crash.act(state, { type: 'expire', at: 1000 })).toThrow();
  });
});

describe('inputs and hidden state', () => {
  it('the crash point is never part of the open-round view', () => {
    const view = crash.view(flight(25_000), false, 1000 + 500) as Record<string, unknown>;
    expect(JSON.stringify(view)).not.toContain('crash');
    expect(view).toMatchObject({ running: true, serverNow: 1500, multiplierBps: multiplierAt(500) });
    expect(crash.view(flight(25_000), true, 0)).toEqual({ crashBps: 25_000 });
  });
  it('accepts only cashout/expire and keeps a stored time only for replays', () => {
    expect(crash.parseAction({ type: 'cashout' })).toEqual({ type: 'cashout', at: 0 });
    expect(crash.parseAction({ type: 'cashout', at: 1234 })).toEqual({ type: 'cashout', at: 1234 });
    expect(crash.stamp!({ type: 'cashout', at: 1 }, 9999)).toEqual({ type: 'cashout', at: 9999 });
    for (const bad of [{ type: 'bet' }, null, {}]) expect(() => crash.parseAction(bad)).toThrow();
  });
});

describe('through the engine with a controlled clock', () => {
  const games = { [crash.id]: crash as GameModule };
  const base = { owner: O, server: S, game: crash.id, wager: '100' };
  const stateOf = (b: ReturnType<typeof build>, id: string) => b.rounds.get(`${O}:${id}`)!.state as State;
  async function newFlight(b: ReturnType<typeof build>, minCrash: number, tag = 'a', maxCrash = CAP_BPS - 1) {
    for (let attempt = 0; attempt < 400; attempt += 1) {
      const view = await startRound(b.deps, {
        ...base,
        idempotencyKey: `crash-${tag}-${String(attempt).padStart(4, '0')}`,
      });
      const { crashBps } = stateOf(b, view.id);
      if (crashBps >= minCrash && crashBps <= maxCrash) return view.id;
      await actOnRound(b.deps, { owner: O, server: S, roundId: view.id, action: { type: 'cashout' } }); // settle and move on
    }
    throw new Error('no suitable flight');
  }
  const crashTick = (crashBps: number) => {
    let n = 0;
    while (multiplierAt(n * TICK_MS) < crashBps) n += 1;
    return n;
  };

  it('pays at the SERVER time even when the client claims a different time', async () => {
    const b = build(1_000_000n, games);
    const id = await newFlight(b, 30_000);
    const { startedAt, crashBps } = stateOf(b, id);
    const n = Math.min(crashTick(crashBps) - 2, 60);
    b.state.clock = startedAt + n * TICK_MS + 10;
    const view = await actOnRound(b.deps, {
      owner: O,
      server: S,
      roundId: id,
      action: { type: 'cashout', at: startedAt },
    });
    const expected = (100n * BigInt(multiplierAt(n * TICK_MS + 10))) / 10_000n;
    expect(view.status).toBe('settled');
    expect(view.settlement!.payout).toBe(expected.toString());
    expect(expected).toBeGreaterThan(100n);
    expect((b.rounds.get(`${O}:${id}`)!.actions[0] as { at: number }).at).toBe(b.state.clock);
    const record = b.rounds.get(`${O}:${id}`)!;
    const seed = b.seedOf.get(`${O}:${id}`)!;
    expect(
      verifyRound(
        crash as GameModule,
        { ...seed, wager: 100n, params: {}, actions: record.actions, startedAt: record.createdAt },
        view.settlement!,
      ),
    ).toEqual({ ok: true });
  });

  it('a late cash-out loses: the server settles the crash first', async () => {
    const b = build(1_000_000n, games);
    const id = await newFlight(b, 12_000);
    const { startedAt, crashBps } = stateOf(b, id);
    const before = b.wallet().available;
    b.state.clock = startedAt + crashTick(crashBps) * TICK_MS + 500;
    const view = await actOnRound(b.deps, { owner: O, server: S, roundId: id, action: { type: 'cashout' } });
    expect(view.status).toBe('settled');
    expect(view.settlement).toMatchObject({ payout: '0', result: { outcome: 'crashed' } });
    expect(b.wallet().available).toBe(before);
    await expect(
      actOnRound(b.deps, { owner: O, server: S, roundId: id, action: { type: 'cashout' } }),
    ).rejects.toMatchObject({ code: 'ROUND_CLOSED' });
    expect(checkInvariants(b.wallet())).toEqual([]);
  });

  it('merely looking at a crashed flight settles it, and so does the recovery sweep', async () => {
    const b = build(1_000_000n, games);
    const first = await newFlight(b, 12_000);
    const second = await newFlight(b, 12_000, 'b');
    const far = Math.max(stateOf(b, first).startedAt, stateOf(b, second).startedAt) + 2_000_000;
    b.state.clock = far;
    expect((await getRoundView(b.deps, { owner: O, server: S, id: first })).status).toBe('settled');
    expect(await recoverRounds(b.deps)).toMatchObject({ settled: 1 });
    expect(b.rounds.get(`${O}:${second}`)!.status).toBe('settled');
    expect(b.wallet().reserved).toBe(0n);
    expect(b.open.size).toBe(0);
  });

  it('an open flight shows the server multiplier but not the crash point', async () => {
    const b = build(1_000_000n, games);
    const id = await newFlight(b, 30_000);
    const { startedAt } = stateOf(b, id);
    b.state.clock = startedAt + 2_000;
    const view = await getRoundView(b.deps, { owner: O, server: S, id });
    expect(JSON.stringify(view)).not.toMatch(/crash(Bps|ed)/);
    expect(view.game_view).toMatchObject({ multiplierBps: multiplierAt(2_000), serverNow: b.state.clock });
  });
});
