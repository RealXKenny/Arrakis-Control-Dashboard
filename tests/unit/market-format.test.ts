import { expect, it } from 'vitest';
import { formatMarketNumber, getSuggestedSellPrice } from '../../src/modules/portal/utils/market';

it('keeps bigint market prices exact and distinguishes unavailable data from zero', () => {
  expect(formatMarketNumber('9007199254740993')).toBe('9,007,199,254,740,993');
  expect(formatMarketNumber(0)).toBe('0');
  expect(formatMarketNumber(null)).toBe('—');
});

it('calculates suggested sell prices without losing bigint precision', () => {
  expect(getSuggestedSellPrice('9007199254740993', 60)).toBe('5404319552844595');
  expect(getSuggestedSellPrice('101', 60)).toBe('60');
  expect(getSuggestedSellPrice('1000', 60.5)).toBe('605');
  expect(getSuggestedSellPrice('1000', null)).toBeNull();
  expect(getSuggestedSellPrice('1000', 101)).toBeNull();
});
