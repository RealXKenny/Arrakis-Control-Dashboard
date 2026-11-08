import { describe, expect, it } from 'vitest';
import {
  marketHref,
  normalizeMarketPage,
  parseMarketQuery,
  MARKET_PAGE_SIZE,
} from '../../../src/features/market/normalize';
import { groupVehicles, normalizeVehicles } from '../../../src/features/vehicles/normalize';

describe('V2 market grid', () => {
  it('is a strict 25-cell page and ignores overflow rows', () => {
    const rows = Array.from({ length: 40 }, (_, i) => ({ template_id: `item-${i}`, display_name: `Item ${i}` }));
    const page = normalizeMarketPage({ rows, totalCount: '40' }, { page: 1 });
    expect(MARKET_PAGE_SIZE).toBe(25);
    expect(page?.items).toHaveLength(25);
    expect(page?.pageCount).toBe(2);
  });

  it('keeps unsafe-size prices as exact decimal strings and drops buyback fields', () => {
    const page = normalizeMarketPage(
      { rows: [{ template_id: 'x', lowest_price: '9007199254740993', buyback_price: 5 }], totalCount: 1 },
      { page: 1 },
    );
    expect(page?.items[0].lowestPrice).toBe('9007199254740993');
    expect(page?.items[0]).not.toHaveProperty('buyback_price');
    expect(page?.items[0]).not.toHaveProperty('suggestedSell');
  });

  it('rejects unreadable payloads and heals hostile queries', () => {
    expect(normalizeMarketPage({ nope: true }, { page: 1 })).toBeNull();
    const query = parseMarketQuery({ q: 'x'.repeat(500), page: '-3', sort: 'drop table', owner: ['mine'] });
    expect(query).toEqual({ q: '', page: 1, sort: 'listed', owner: 'mine' });
  });

  it('builds canonical hrefs', () => {
    const query = parseMarketQuery({ q: 'spice', page: '3' });
    expect(marketHref(query)).toBe('/market?q=spice&page=3');
    expect(marketHref(query, { page: 1 })).toBe('/market?q=spice');
    expect(marketHref(parseMarketQuery({}))).toBe('/market');
  });
});

describe('V2 vehicles', () => {
  const rows = [
    { id: 'a', name: 'My Bike', type: 'Sandbike', owner_name: 'Paul', fuel_percent: 80 },
    {
      id: 'b',
      name: 'Crate',
      type: 'BP_ContainerVehicle',
      owner_name: 'Paul',
      fuel_percent: 50,
      max_slots: 40,
      used_slots: 10,
    },
    { id: 'c', name: 'Friend Buggy', type: 'Buggy', owner_name: 'Stilgar', relationship: 'shared' },
    { id: 'd', name: 'Stranger', type: 'Buggy', owner_name: 'Feyd' },
  ];

  it('hides vehicles the player cannot access and classifies the rest', () => {
    const vehicles = normalizeVehicles({ data: { rows } }, 'Paul');
    expect(vehicles.map((v) => [v.id, v.access])).toEqual([
      ['a', 'owned'],
      ['b', 'owned'],
      ['c', 'shared'],
    ]);
  });

  it('never gives a BP_ContainerVehicle a fuel bar', () => {
    const container = normalizeVehicles(rows, 'Paul').find((v) => v.id === 'b');
    expect(container?.fuel).toBeNull();
    expect(container?.storage).toEqual({ used: 10, max: 40, unit: 'slots' });
    expect(normalizeVehicles(rows, 'Paul').find((v) => v.id === 'a')?.fuel?.percent).toBe(80);
  });

  it('removes the access bar entirely on zero access or a single side', () => {
    expect(groupVehicles([], undefined).showAccessBar).toBe(false);
    const all = normalizeVehicles(rows, 'Paul');
    expect(groupVehicles(all, 'shared')).toMatchObject({ showAccessBar: true, view: 'shared' });
    const ownedOnly = all.filter((v) => v.access === 'owned');
    expect(groupVehicles(ownedOnly, 'shared')).toMatchObject({ showAccessBar: false, view: 'owned' });
  });
});
