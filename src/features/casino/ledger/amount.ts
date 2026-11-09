/**
 * Exact currency amounts. Everything is a non-negative BigInt in whole units; the wire form is a
 * decimal string so values beyond Number.MAX_SAFE_INTEGER never lose precision.
 */

/** Documented Console add-currency bound (+/- 1,000,000,000,000). One transfer may not exceed it. */
export const MAX_TRANSFER = 1_000_000_000_000n;
/** Wallet bucket ceiling: below 2^53 so the Redis Lua script (IEEE doubles) stays exact. */
export const MAX_BALANCE = 9_000_000_000_000_000n;

export class AmountError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AmountError';
  }
}

/** Parse a positive whole-number amount from a decimal string. Rejects floats, signs, exponents, junk. */
export function parseAmount(value: unknown, max: bigint = MAX_BALANCE): bigint {
  if (typeof value === 'bigint') {
    if (value <= 0n || value > max) throw new AmountError('Amount out of range');
    return value;
  }
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value)) throw new AmountError('Amount must be a safe whole number');
    return parseAmount(BigInt(value), max);
  }
  if (typeof value !== 'string' || !/^[1-9][0-9]{0,24}$/.test(value))
    throw new AmountError('Amount must be a positive whole number');
  return parseAmount(BigInt(value), max);
}

export function formatAmount(value: bigint): string {
  return value.toString(10);
}
