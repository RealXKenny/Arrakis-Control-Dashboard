import { createHash, createHmac, randomBytes } from 'node:crypto';

/**
 * Provably fair randomness.
 *
 *   block(i)  = HMAC_SHA256( key = serverSeed (the 64-char hex string, UTF-8),
 *                            message = `${clientSeed}:${nonce}:${i}` )          i = 0, 1, 2, ...
 *   stream    = block(0) || block(1) || ...                                   (32 bytes per block)
 *   commitment = SHA256( serverSeed (the hex string, UTF-8) ), published BEFORE any round uses the seed.
 *
 * Mapping from bytes to outcomes (all deterministic, so anyone with the revealed seed can replay):
 *   uint32   next 4 stream bytes, big-endian.
 *   int(n)   rejection sampling on uint32: draws >= 2^32 - (2^32 mod n) are discarded, the rest taken mod n.
 *            This is exactly uniform (no modulo bias). int(1) returns 0 without consuming bytes.
 *   float()  next 6 stream bytes as a 48-bit integer divided by 2^48, in [0, 1).
 *   shuffle  Fisher-Yates from the end: for i = n-1 down to 1, swap a[i] with a[int(i + 1)].
 *
 * The server seed is secret until it is retired (rotated); the commitment proves it was fixed in advance.
 */

const TWO_32 = 0x1_0000_0000;
const TWO_48 = 2 ** 48;

export const SEED_PATTERN = /^[0-9a-f]{64}$/;
export const CLIENT_SEED_PATTERN = /^[A-Za-z0-9_.-]{1,64}$/;

export function generateServerSeed(): string {
  return randomBytes(32).toString('hex');
}

export function commitSeed(serverSeed: string): string {
  return createHash('sha256').update(serverSeed, 'utf8').digest('hex');
}

export function verifyCommitment(serverSeed: string, commitment: string): boolean {
  return SEED_PATTERN.test(serverSeed) && commitSeed(serverSeed) === commitment;
}

/** Unbiased integer in [0, n) from a source of uniform uint32 values. Exported for direct testing. */
export function intFromUint32(next: () => number, n: number): number {
  if (!Number.isInteger(n) || n < 1 || n > TWO_32) throw new RangeError('n must be an integer in [1, 2^32]');
  if (n === 1) return 0;
  const limit = TWO_32 - (TWO_32 % n);
  for (;;) {
    const value = next();
    if (value < limit) return value % n;
  }
}

export class Rng {
  private block = 0;
  private buffer: Buffer = Buffer.alloc(0);
  private offset = 0;

  constructor(
    private readonly serverSeed: string,
    private readonly clientSeed: string,
    private readonly nonce: number,
  ) {
    if (!SEED_PATTERN.test(serverSeed)) throw new RangeError('Invalid server seed');
    if (!CLIENT_SEED_PATTERN.test(clientSeed)) throw new RangeError('Invalid client seed');
    if (!Number.isSafeInteger(nonce) || nonce < 0) throw new RangeError('Invalid nonce');
  }

  bytes(count: number): Buffer {
    const out = Buffer.alloc(count);
    for (let filled = 0; filled < count;) {
      if (this.offset >= this.buffer.length) {
        this.buffer = createHmac('sha256', this.serverSeed)
          .update(`${this.clientSeed}:${this.nonce}:${this.block}`)
          .digest();
        this.block += 1;
        this.offset = 0;
      }
      const take = Math.min(count - filled, this.buffer.length - this.offset);
      this.buffer.copy(out, filled, this.offset, this.offset + take);
      this.offset += take;
      filled += take;
    }
    return out;
  }

  uint32(): number {
    return this.bytes(4).readUInt32BE(0);
  }

  int(n: number): number {
    return intFromUint32(() => this.uint32(), n);
  }

  float(): number {
    return this.bytes(6).readUIntBE(0, 6) / TWO_48;
  }

  shuffle<T>(items: readonly T[]): T[] {
    const out = [...items];
    for (let i = out.length - 1; i > 0; i -= 1) {
      const j = this.int(i + 1);
      [out[i], out[j]] = [out[j]!, out[i]!];
    }
    return out;
  }

  /** `count` distinct indexes from [0, n), in draw order (partial Fisher-Yates). */
  sample(n: number, count: number): number[] {
    if (count > n) throw new RangeError('Cannot sample more items than exist');
    const pool = Array.from({ length: n }, (_, i) => i);
    for (let i = 0; i < count; i += 1) {
      const j = i + this.int(n - i);
      [pool[i], pool[j]] = [pool[j]!, pool[i]!];
    }
    return pool.slice(0, count);
  }
}

/** Payout = floor(wager * bps / 10000). Integer math only; fractions round down in the house's favour. */
export function payoutFromBps(wager: bigint, bps: bigint): bigint {
  if (wager < 0n || bps < 0n) throw new RangeError('Negative amount');
  return (wager * bps) / 10_000n;
}
