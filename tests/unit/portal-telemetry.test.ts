import { expect, it } from 'vitest';
import { getCurrencyValue } from '../../src/modules/portal/utils/telemetry';
import { buildCharacter } from '../../src/modules/portal/utils/character';
import { getNumber, formatNumber } from '../../src/modules/portal/utils/formatting';

it('does not invent full health or zero balances when telemetry is missing', () => {
  const character = buildCharacter({ linked: true });
  expect(character.health).toBeNull();
  expect(character.solarisCredit).toBeNull();
  expect(formatNumber(null)).toBe('—');
  expect(getNumber(null, undefined, '', 12)).toBe(12);
  expect(getNumber(0, 12)).toBe(0);
});

it('reads currency from both row and object payloads', () => {
  expect(getCurrencyValue({ rows: [{ label: 'Solari', balance: '125' }] })).toBe(125);
  expect(getCurrencyValue({ total: '250' })).toBe(250);
  expect(getCurrencyValue(null, undefined, { balance: 0 })).toBe(0);
});
