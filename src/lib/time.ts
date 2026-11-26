/**
 * Shared timestamp formatting. Pure and isomorphic: the same functions run on the server (fixed
 * UTC) and in the browser (the viewer's own zone). Storage stays UTC; only display is localised.
 * Durations and countdowns are NOT timestamps and never go through here.
 */

export type TimeVariant = 'date' | 'time' | 'datetime';

export interface TimeFormatOptions {
  /** IANA zone; omit to use the runtime's own (the browser's, on the client). */
  timeZone?: string;
  /** BCP 47 locale; omit to use the runtime's own. */
  locale?: string;
  variant?: TimeVariant;
}

const EMPTY = '—';

/** Accepts ISO strings, epoch milliseconds or Dates; anything unparseable becomes null. */
export function parseTimestamp(value: unknown): Date | null {
  if (value === null || value === undefined || value === '') return null;
  const date = value instanceof Date ? value : new Date(typeof value === 'number' ? value : String(value));
  return Number.isFinite(date.getTime()) ? date : null;
}

const PARTS: Record<TimeVariant, Intl.DateTimeFormatOptions> = {
  // Nov 7, 2026
  date: { year: 'numeric', month: 'short', day: 'numeric' },
  // 11:19:23 PM EST
  time: { hour: 'numeric', minute: '2-digit', second: '2-digit', timeZoneName: 'short' },
  // Nov 7, 2026, 11:19 PM EST
  datetime: {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  },
};

/** Formats an absolute timestamp, or an em dash when it is missing or invalid. */
export function formatTimestamp(value: unknown, options: TimeFormatOptions = {}): string {
  const date = parseTimestamp(value);
  if (!date) return EMPTY;
  const { variant = 'datetime', timeZone, locale } = options;
  try {
    return new Intl.DateTimeFormat(locale, { ...PARTS[variant], ...(timeZone ? { timeZone } : {}) }).format(date);
  } catch {
    return EMPTY;
  }
}

/** Unambiguous technical form, always UTC: `2026-11-08 04:19:23 UTC`. */
export function formatUtc(value: unknown): string {
  const date = parseTimestamp(value);
  return date ? `${date.toISOString().slice(0, 19).replace('T', ' ')} UTC` : EMPTY;
}

const UNITS: Array<[Intl.RelativeTimeFormatUnit, number]> = [
  ['year', 31_536_000_000],
  ['month', 2_592_000_000],
  ['day', 86_400_000],
  ['hour', 3_600_000],
  ['minute', 60_000],
];

/** "5 minutes ago" / "in 2 hours". `now` is injectable so callers keep renders pure. */
export function formatRelative(value: unknown, now: number = Date.now(), locale?: string): string {
  const date = parseTimestamp(value);
  if (!date) return EMPTY;
  const diff = date.getTime() - now;
  const formatter = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
  for (const [unit, size] of UNITS) {
    if (Math.abs(diff) >= size) return formatter.format(Math.round(diff / size), unit);
  }
  return formatter.format(0, 'second') === 'now' ? 'just now' : formatter.format(0, 'second');
}

/** The runtime's IANA zone, e.g. `America/New_York`; `UTC` where it cannot be determined. */
export function localTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}
