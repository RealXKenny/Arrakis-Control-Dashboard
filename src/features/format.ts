/**
 * Display formatting shared by V2 features. Pure and browser-safe.
 * Unsafe-size numbers travel as decimal strings and are only formatted here, at display time.
 */

/** Coerce a provider value to a decimal string without losing precision, or null. */
export function toDecimalString(value: unknown): string | null {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return /^-?\d+(\.\d+)?$/.test(trimmed) ? trimmed : null;
  }
  if (typeof value === 'bigint') return value.toString();
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Number.isInteger(value) ? BigInt(value).toString() : String(value);
  }
  return null;
}

export function formatDecimal(value: string | null | undefined): string {
  if (!value) return '—';
  if (/^-?\d+$/.test(value)) return BigInt(value).toLocaleString('en-US');
  const number = Number(value);
  return Number.isFinite(number) ? number.toLocaleString('en-US', { maximumFractionDigits: 2 }) : '—';
}

export function formatCount(value: number | null | undefined, maximumFractionDigits = 1): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  return value.toLocaleString('en-US', { maximumFractionDigits });
}

export function clampPercent(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : 0;
}
