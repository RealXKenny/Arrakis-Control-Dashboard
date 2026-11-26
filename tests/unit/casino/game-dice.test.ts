import { describe, expect, it } from 'vitest';
import { startRound } from '../../../src/features/casino/engine/round';
import type { GameModule } from '../../../src/features/casino/engine/types';
import { Rng } from '../../../src/features/casino/fairness/rng';
import { verifyRound } from '../../../src/features/casino/fairness/verify';
import {
  DICE_SIDES,
  MAX_WINNING,
  MIN_WINNING,
  dice,
  isWin,
  multiplierBps,
  winningOutcomes,
  type DiceParams,
} from '../../../src/features/casino/games/dice';
import { checkInvariants } from '../../../src/features/casino/ledger/ledger';
import { build, O, S } from '../../helpers/casino-engine';

const rolls = Array.from({ length: DICE_SIDES }, (_, r) => r);

describe('probabilities and boundaries (exhaustive over all 10,000 rolls)', () => {
  it('winning outcome counts match the formula for every allowed target', () => {
    for (const direction of ['under', 'over'] as const) {
      // Every roll is checked for each tested target; targets step by 13 plus every boundary of the allowed range.
      for (let target = 0; target < DICE_SIDES; target += 1) {
        const boundary = [99, 100, 101, 198, 199, 200, 9799, 9800, 9801, 9898, 9899, 9900].includes(target);
        if (!boundary && target % 13 !== 0) continue;
        const params: DiceParams = { direction, target };
        const winning = winningOutcomes(params);
        if (winning < MIN_WINNING || winning > MAX_WINNING) continue;
        expect(rolls.filter((r) => isWin(r, params)).length).toBe(winning);
      }
    }
  });
  it('landing exactly on the target loses in both directions', () => {
    expect(isWin(5000, { direction: 'under', target: 5000 })).toBe(false);
    expect(isWin(4999, { direction: 'under', target: 5000 })).toBe(true);
    expect(isWin(5000, { direction: 'over', target: 5000 })).toBe(false);
    expect(isWin(5001, { direction: 'over', target: 5000 })).toBe(true);
  });
  it('over and under at the same chance pay the same multiplier', () => {
    expect(multiplierBps({ direction: 'under', target: 5000 })).toBe(
      multiplierBps({ direction: 'over', target: 4999 }),
    );
  });
});

describe('payout multipliers', () => {
  it('known values: 50% pays 1.98x, 1% pays 99x, 98% pays about 1.0102x', () => {
    expect(multiplierBps({ direction: 'under', target: 5000 })).toBe(19_800n);
    expect(multiplierBps({ direction: 'under', target: 100 })).toBe(990_000n);
    expect(multiplierBps({ direction: 'under', target: 9800 })).toBe(10_102n);
  });
  it('return to player is between 98.99% and 99% for every allowed target', () => {
    for (let winning = MIN_WINNING; winning <= MAX_WINNING; winning += 1) {
      const params: DiceParams = { direction: 'under', target: winning };
      const rtp = (winning / DICE_SIDES) * (Number(multiplierBps(params)) / 10_000);
      expect(rtp).toBeLessThanOrEqual(0.99 + 1e-12);
      expect(rtp).toBeGreaterThan(0.9898);
    }
  });
});

describe('parameters', () => {
  it('accepts targets giving 1% to 98% chance and rejects everything else', () => {
    expect(dice.parseParams({ direction: 'under', target: 100 })).toEqual({ direction: 'under', target: 100 });
    expect(dice.parseParams({ direction: 'under', target: 9800 })).toBeDefined();
    expect(dice.parseParams({ direction: 'over', target: 199 })).toBeDefined();
    expect(dice.parseParams({ direction: 'over', target: 9899 })).toBeDefined();
    for (const bad of [
      { direction: 'under', target: 99 },
      { direction: 'under', target: 9801 },
      { direction: 'over', target: 198 },
      { direction: 'over', target: 9900 },
      { direction: 'under', target: -5 },
      { direction: 'under', target: 10_000 },
      { direction: 'under', target: 50.5 },
      { direction: 'under', target: '5000' },
      { direction: 'sideways', target: 5000 },
      null,
      {},
    ])
      expect(() => dice.parseParams(bad), JSON.stringify(bad)).toThrow();
  });
});

describe('randomness and settlement', () => {
  it('rolls are uniform across deciles (chi-square, fixed seeds)', () => {
    const buckets = Array(10).fill(0) as number[];
    const n = 20_000;
    for (let nonce = 0; nonce < n; nonce += 1) {
      const { state } = dice.start(
        new Rng('4'.repeat(64), 'dice', nonce),
        100n,
        { direction: 'under', target: 5000 },
        { now: 0 },
      );
      buckets[Math.floor((state as { roll: number }).roll / 1000)]! += 1;
    }
    const expected = n / 10;
    const chi = buckets.reduce((sum, c) => sum + (c - expected) ** 2 / expected, 0);
    expect(chi).toBeLessThan(27.88); // df = 9, p = 0.001
  });
  it('settlement matches the roll: win pays floor(wager * multiplier), loss pays zero', () => {
    for (let nonce = 0; nonce < 200; nonce += 1) {
      const params: DiceParams = { direction: 'over', target: 7500 };
      const { state, settlement } = dice.start(new Rng('4'.repeat(64), 'check', nonce), 1000n, params, { now: 0 });
      const { roll, win } = state as { roll: number; win: boolean };
      expect(win).toBe(roll > 7500);
      expect(settlement!.payout).toBe(win ? (1000n * multiplierBps(params)) / 10_000n : 0n);
      expect((settlement!.result as { rollDisplay: string }).rollDisplay).toBe((roll / 100).toFixed(2));
    }
  });
  it('plays through the engine with exact accounting and a verifiable result', async () => {
    const b = build(1000n, { [dice.id]: dice as GameModule });
    const params = { direction: 'under', target: 5000 };
    const view = await startRound(b.deps, {
      owner: O,
      server: S,
      game: dice.id,
      wager: '100',
      params,
      idempotencyKey: 'dice-key-0001',
    });
    expect(view.status).toBe('settled');
    expect(b.wallet().available).toBe(900n + BigInt(view.settlement!.payout));
    expect(checkInvariants(b.wallet())).toEqual([]);
    const seed = b.seedOf.get(`${O}:${view.id}`)!;
    expect(verifyRound(dice as GameModule, { ...seed, wager: 100n, params, actions: [] }, view.settlement!)).toEqual({
      ok: true,
    });
    await expect(
      startRound(b.deps, {
        owner: O,
        server: S,
        game: dice.id,
        wager: '99',
        params,
        idempotencyKey: 'dice-key-0002',
      }),
    ).rejects.toMatchObject({ code: 'INVALID_WAGER' });
  });
});
