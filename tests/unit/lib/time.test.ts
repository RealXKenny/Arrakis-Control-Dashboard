import { describe, expect, it } from 'vitest';
import { formatRelative, formatTimestamp, formatUtc, parseTimestamp } from '../../../src/lib/time';

const AT = '2026-11-08T04:19:23Z';

describe('timestamp formatting', () => {
  it('renders the same instant in the requested zone, honouring daylight saving', () => {
    expect(formatTimestamp(AT, { timeZone: 'America/New_York', locale: 'en-US' })).toBe('Nov 7, 2026, 11:19 PM EST');
    expect(formatTimestamp('2026-07-08T04:19:23Z', { timeZone: 'America/New_York', locale: 'en-US' })).toContain('EDT');
    expect(formatTimestamp(AT, { variant: 'time', timeZone: 'America/New_York', locale: 'en-US' })).toBe(
      '11:19:23 PM EST',
    );
    expect(formatTimestamp(AT, { variant: 'date', timeZone: 'Asia/Tokyo', locale: 'en-US' })).toBe('Nov 8, 2026');
  });

  it('degrades to an em dash for missing or invalid input', () => {
    for (const bad of [null, undefined, '', 'not a date', NaN]) {
      expect(formatTimestamp(bad)).toBe('—');
      expect(formatUtc(bad)).toBe('—');
      expect(formatRelative(bad)).toBe('—');
    }
    expect(parseTimestamp(AT)?.toISOString()).toBe('2026-11-08T04:19:23.000Z');
  });

  it('has a deterministic technical UTC form and relative form', () => {
    expect(formatUtc(AT)).toBe('2026-11-08 04:19:23 UTC');
    const now = Date.parse(AT);
    expect(formatRelative(now - 5 * 60_000, now, 'en-US')).toBe('5 minutes ago');
    expect(formatRelative(now + 2 * 3_600_000, now, 'en-US')).toBe('in 2 hours');
  });
});
