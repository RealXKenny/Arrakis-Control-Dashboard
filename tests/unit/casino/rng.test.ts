import { createHash, createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  Rng,
  commitSeed,
  generateServerSeed,
  intFromUint32,
  payoutFromBps,
  verifyCommitment,
} from '../../../src/features/casino/fairness/rng';

const SEED = 'a'.repeat(64);

describe('commitments', () => {
  it('commits with SHA-256 of the hex seed and verifies', () => {
    const expected = createHash('sha256').update(SEED, 'utf8').digest('hex');
    expect(commitSeed(SEED)).toBe(expected);
    expect(verifyCommitment(SEED, expected)).toBe(true);
    expect(verifyCommitment(SEED, commitSeed('b'.repeat(64)))).toBe(false);
    expect(verifyCommitment('not-a-seed', commitSeed('not-a-seed'))).toBe(false);
  });
  it('generates distinct 64-hex seeds', () => {
    const a = generateServerSeed();
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(generateServerSeed()).not.toBe(a);
  });
});

describe('stream', () => {
  it('matches an independently computed HMAC-SHA256 stream across block boundaries', () => {
    const block = (i: number) => createHmac('sha256', SEED).update(`client-1:7:${i}`).digest();
    const expected = Buffer.concat([block(0), block(1), block(2)]).subarray(0, 70);
    expect(new Rng(SEED, 'client-1', 7).bytes(70).equals(expected)).toBe(true);
  });
  it('is deterministic and varies with client seed and nonce', () => {
    const draw = (client: string, nonce: number) =>
      Array.from(
        { length: 5 },
        (
          (r) => () =>
            r.int(1000)
        )(new Rng(SEED, client, nonce)),
      );
    expect(draw('c', 1)).toEqual(draw('c', 1));
    expect(draw('c', 1)).not.toEqual(draw('c', 2));
    expect(draw('c', 1)).not.toEqual(draw('d', 1));
  });
  it('rejects malformed inputs', () => {
    expect(() => new Rng('short', 'c', 0)).toThrow();
    expect(() => new Rng(SEED, 'bad seed!', 0)).toThrow();
    expect(() => new Rng(SEED, 'c', -1)).toThrow();
    expect(() => new Rng(SEED, 'c', 1.5)).toThrow();
  });
});

describe('unbiased integers', () => {
  it('discards draws in the biased tail instead of folding them with modulo', () => {
    const n = 3_000_000_000; // 2^32 mod n = 1_294_967_296, so limit = 3_000_000_000
    const draws = [3_500_000_000, 4_294_967_295, 2_999_999_999];
    let used = 0;
    expect(intFromUint32(() => draws[used++]!, n)).toBe(2_999_999_999);
    expect(used).toBe(3);
  });
  it('is exactly the draw modulo n when the draw is accepted, and n=1 consumes nothing', () => {
    expect(intFromUint32(() => 10, 6)).toBe(4);
    expect(
      intFromUint32(() => {
        throw new Error('must not draw');
      }, 1),
    ).toBe(0);
    expect(() => intFromUint32(() => 0, 0)).toThrow();
    expect(() => intFromUint32(() => 0, 1.5)).toThrow();
  });
  it('is statistically uniform over a die (fixed seeds, 60,000 rolls)', () => {
    const counts = Array(6).fill(0) as number[];
    for (let nonce = 0; nonce < 6000; nonce += 1) {
      const rng = new Rng(SEED, 'chi', nonce);
      for (let k = 0; k < 10; k += 1) counts[rng.int(6)]! += 1;
    }
    const expected = 10_000;
    const chi = counts.reduce((sum, c) => sum + (c - expected) ** 2 / expected, 0);
    expect(chi).toBeLessThan(20.5); // df = 5; p = 0.001 critical value is 20.52
  });
  it('floats are in [0, 1)', () => {
    const rng = new Rng(SEED, 'f', 0);
    for (let i = 0; i < 1000; i += 1) {
      const value = rng.float();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });
});

describe('permutations', () => {
  it('shuffle returns a permutation and does not mutate the input', () => {
    const input = Array.from({ length: 52 }, (_, i) => i);
    const out = new Rng(SEED, 's', 0).shuffle(input);
    expect([...out].sort((a, b) => a - b)).toEqual(input);
    expect(out).not.toEqual(input);
    expect(input[0]).toBe(0);
    expect(new Rng(SEED, 's', 0).shuffle(input)).toEqual(out);
  });
  it('sample returns distinct in-range indexes and rejects oversampling', () => {
    const picked = new Rng(SEED, 'm', 3).sample(25, 24);
    expect(new Set(picked).size).toBe(24);
    expect(picked.every((i) => i >= 0 && i < 25)).toBe(true);
    expect(() => new Rng(SEED, 'm', 3).sample(5, 6)).toThrow();
  });
});

describe('payout math', () => {
  it('uses integer basis points rounding down', () => {
    expect(payoutFromBps(100n, 19_500n)).toBe(195n);
    expect(payoutFromBps(7n, 15_000n)).toBe(10n);
    expect(payoutFromBps(1n, 9_999n)).toBe(0n);
    expect(payoutFromBps(1_000_000_000_000n, 10_000_000n)).toBe(1_000_000_000_000_000n);
    expect(() => payoutFromBps(-1n, 1n)).toThrow();
  });
});
