import { expect, it } from 'vitest';
import { formatFreshnessStamp } from '../../../src/features/monitoring/components/data-freshness';

it('shows freshness stamps as a readable UTC time without milliseconds', () => {
  expect(formatFreshnessStamp('2026-11-26T02:09:10.938Z')).toBe('2026-11-26 02:09:10 UTC');
});

it('leaves an unexpected value unchanged instead of inventing a time', () => {
  expect(formatFreshnessStamp('not a time')).toBe('not a time');
});
