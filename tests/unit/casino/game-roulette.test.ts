import { describe, expect, it } from 'vitest';
import { startRound } from '../../../src/features/casino/engine/round';
import type { GameModule } from '../../../src/features/casino/engine/types';
import { Rng } from '../../../src/features/casino/fairness/rng';
import { verifyRound } from '../../../src/features/casino/fairness/verify';
import {
  RED_NUMBERS,
  betReturn,
  pocketColor,
  roulette,
  settleSpin,
  type RouletteBet,
} from '../../../src/features/casino/games/roulette';
import { checkInvariants } from '../../../src/features/casino/ledger/ledger';
import { build, O, S } from '../../helpers/casino-engine';

const A = 10n;
const everyBet: RouletteBet[] = [
  { type: 'straight', number: 17, amount: A },
  { type: 'straight', number: 0, amount: A },
  { type: 'color', value: 'red', amount: A },
  { type: 'color', value: 'black', amount: A },
  { type: 'parity', value: 'odd', amount: A },
  { type: 'parity', value: 'even', amount: A },
  { type: 'range', value: 'low', amount: A },
  { type: 'range', value: 'high', amount: A },
  ...([1, 2, 3] as const).flatMap((value) => [
    { type: 'dozen' as const, value, amount: A },
    { type: 'column' as const, value, amount: A },
  ]),
];
const numbers = Array.from({ length: 37 }, (_, n) => n);

describe('wheel layout', () => {
  it('has 18 red, 18 black and one green pocket', () => {
    expect(RED_NUMBERS.size).toBe(18);
    expect(numbers.filter((n) => pocketColor(n) === 'black')).toHaveLength(18);
    expect(pocketColor(0)).toBe('green');
    expect(pocketColor(1)).toBe('red');
    expect(pocketColor(2)).toBe('black');
    expect(pocketColor(36)).toBe('red');
  });
});

describe('payouts', () => {
  it('every bet type returns exactly 36/37 of the stake over all 37 pockets', () => {
    for (const bet of everyBet) {
      const total = numbers.reduce((sum, n) => sum + betReturn(bet, n), 0n);
      expect(total, JSON.stringify({ ...bet, amount: '' })).toBe(36n * A);
    }
  });
  it('pays the documented multiples', () => {
    expect(betReturn({ type: 'straight', number: 17, amount: 10n }, 17)).toBe(360n); // 35:1 plus stake
    expect(betReturn({ type: 'color', value: 'red', amount: 10n }, 1)).toBe(20n);
    expect(betReturn({ type: 'dozen', value: 2, amount: 10n }, 13)).toBe(30n);
    expect(betReturn({ type: 'column', value: 3, amount: 10n }, 36)).toBe(30n);
    expect(betReturn({ type: 'column', value: 1, amount: 10n }, 34)).toBe(30n);
    expect(betReturn({ type: 'column', value: 2, amount: 10n }, 35)).toBe(30n);
  });
  it('zero loses every outside bet but wins a straight bet on zero', () => {
    for (const bet of everyBet) {
      const wins = betReturn(bet, 0) > 0n;
      expect(wins).toBe(bet.type === 'straight' && bet.number === 0);
    }
  });
  it('boundaries: 18/19 for ranges, 12/13 and 24/25 for dozens, columns', () => {
    expect(betReturn({ type: 'range', value: 'low', amount: 1n }, 18)).toBe(2n);
    expect(betReturn({ type: 'range', value: 'low', amount: 1n }, 19)).toBe(0n);
    expect(betReturn({ type: 'range', value: 'high', amount: 1n }, 19)).toBe(2n);
    expect(betReturn({ type: 'dozen', value: 1, amount: 1n }, 12)).toBe(3n);
    expect(betReturn({ type: 'dozen', value: 2, amount: 1n }, 12)).toBe(0n);
    expect(betReturn({ type: 'dozen', value: 3, amount: 1n }, 25)).toBe(3n);
    expect(betReturn({ type: 'dozen', value: 2, amount: 1n }, 24)).toBe(3n);
    expect(betReturn({ type: 'column', value: 1, amount: 1n }, 1)).toBe(3n);
    expect(betReturn({ type: 'column', value: 3, amount: 1n }, 3)).toBe(3n);
  });
  it('sums several bets on one spin', () => {
    const spin = settleSpin(17, [
      { type: 'straight', number: 17, amount: 10n },
      { type: 'color', value: 'black', amount: 20n },
      { type: 'parity', value: 'even', amount: 30n },
    ]);
    expect(spin.payout).toBe(360n + 40n + 0n);
    expect(spin.result.number).toBe(17);
  });
});

describe('parameters', () => {
  const valid = {
    bets: [
      { type: 'straight', number: 5, amount: '10' },
      { type: 'color', value: 'red', amount: '15' },
    ],
  };
  it('accepts valid bets and requires the wager to equal their sum', () => {
    const params = roulette.parseParams(valid);
    expect(() => roulette.validate!(25n, params)).not.toThrow();
    expect(() => roulette.validate!(24n, params)).toThrow();
  });
  it.each([
    [null],
    [{}],
    [{ bets: [] }],
    [{ bets: Array(21).fill({ type: 'color', value: 'red', amount: '10' }) }],
    [{ bets: [{ type: 'straight', number: 37, amount: '10' }] }],
    [{ bets: [{ type: 'straight', number: 1.5, amount: '10' }] }],
    [{ bets: [{ type: 'straight', number: '5', amount: '10' }] }],
    [{ bets: [{ type: 'color', value: 'green', amount: '10' }] }],
    [{ bets: [{ type: 'dozen', value: 4, amount: '10' }] }],
    [{ bets: [{ type: 'color', value: 'red', amount: '0' }] }],
    [{ bets: [{ type: 'color', value: 'red', amount: '-5' }] }],
    [{ bets: [{ type: 'color', value: 'red', amount: 10 }] }],
    [{ bets: [{ type: 'split', amount: '10' }] }],
  ])('rejects %j', (raw) => {
    expect(() => roulette.parseParams(raw)).toThrow();
  });
});

describe('randomness', () => {
  it('lands on each of the 37 pockets with equal probability (chi-square, fixed seeds)', () => {
    const counts = Array(37).fill(0) as number[];
    const spins = 37_000;
    const params = roulette.parseParams({ bets: [{ type: 'color', value: 'red', amount: '10' }] });
    for (let nonce = 0; nonce < spins; nonce += 1) {
      const landed = (
        roulette.start(new Rng('5'.repeat(64), 'wheel', nonce), 10n, params, { now: 0 }).state as { number: number }
      ).number;
      counts[landed]! += 1;
    }
    const expected = spins / 37;
    const chi = counts.reduce((sum, c) => sum + (c - expected) ** 2 / expected, 0);
    expect(chi).toBeLessThan(67.99); // df = 36, p = 0.001 critical value
  });
});

describe('through the engine', () => {
  const games = { [roulette.id]: roulette as GameModule };
  it('reserves the total, settles every bet once, and replays from the seed', async () => {
    const b = build(1000n, games);
    const params = {
      bets: [
        { type: 'straight', number: 7, amount: '10' },
        { type: 'dozen', value: 1, amount: '40' },
      ],
    };
    const view = await startRound(b.deps, {
      owner: O,
      server: S,
      game: roulette.id,
      wager: '50',
      params,
      idempotencyKey: 'wheel-key-001',
    });
    expect(view.status).toBe('settled');
    const record = b.rounds.get(`${O}:${view.id}`)!;
    expect(record.holds).toBe(1);
    expect(b.wallet().available).toBe(950n + BigInt(view.settlement!.payout));
    expect(b.wallet().reserved).toBe(0n);
    expect(checkInvariants(b.wallet())).toEqual([]);
    const seed = b.seedOf.get(`${O}:${view.id}`)!;
    expect(
      verifyRound(
        roulette as GameModule,
        { ...seed, wager: 50n, params: record.params, actions: [] },
        view.settlement!,
      ),
    ).toEqual({ ok: true });
  });
  it('rejects a wager that does not match the bets before any funds move', async () => {
    const b = build(1000n, games);
    const params = { bets: [{ type: 'color', value: 'red', amount: '40' }] };
    await expect(
      startRound(b.deps, {
        owner: O,
        server: S,
        game: roulette.id,
        wager: '50',
        params,
        idempotencyKey: 'wheel-key-002',
      }),
    ).rejects.toMatchObject({ code: 'INVALID_PARAMS' });
    expect(b.walletCalls).toHaveLength(0); // no reserve was attempted
    expect(b.wallet().available).toBe(1000n);
    expect(b.rounds.size).toBe(0);
  });
});
