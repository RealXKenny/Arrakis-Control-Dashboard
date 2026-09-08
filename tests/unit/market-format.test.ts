import { expect, it } from 'vitest';
import { formatMarketNumber } from '../../src/modules/portal/utils/market';

it('keeps bigint market prices exact and distinguishes unavailable data from zero', () => {
  expect(formatMarketNumber('9007199254740993')).toBe('9,007,199,254,740,993');
  expect(formatMarketNumber(0)).toBe('0');
  expect(formatMarketNumber(null)).toBe('—');
});
