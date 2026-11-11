import { describe, expect, it } from 'vitest';
import { countPinnedItems, itemPinsRecordSchema } from '../../../src/features/player/item-pins';
import type { FinderResult } from '../../../src/features/player/item-finder';

const pin = { templateId: 'Spice', name: 'Spice Melange' };
const reading = (quantities: string[], complete = true): FinderResult => ({
  startedAt: new Date().toISOString(),
  limited: false,
  sources: [
    { name: 'Backpack', status: complete ? 'ok' : 'unavailable', detail: '', checkedAt: new Date().toISOString() },
  ],
  items: quantities.map((quantity, index) => ({
    id: String(index),
    templateId: 'spice',
    name: 'Spice',
    quantity,
    grade: 'Unknown',
    durability: 'Unknown',
    augments: [],
    location: 'Backpack',
    href: '/storage',
  })),
});
describe('pinned item counters', () => {
  it('totals exact quantities across authorized observations without floating point', () => {
    expect(countPinnedItems([pin], reading(['9007199254740993', '7']))[0]).toMatchObject({
      quantity: '9007199254741000',
      complete: true,
    });
  });
  it('marks missing sources, limits and unknown or unsafe quantities incomplete rather than a complete zero', () => {
    expect(countPinnedItems([pin], reading([], false))[0]).toMatchObject({ quantity: '0', complete: false });
    expect(countPinnedItems([pin], { ...reading([]), limited: true })[0].complete).toBe(false);
    expect(countPinnedItems([pin], reading(['12', 'Unknown']))[0]).toMatchObject({ quantity: '12', complete: false });
    expect(countPinnedItems([pin], reading(['-1', '1.5', '1e9']))[0]).toMatchObject({ quantity: '0', complete: false });
  });
  it('reports genuine zero only for complete successful coverage and never counts unrelated templates', () => {
    expect(countPinnedItems([{ templateId: 'Water', name: 'Water' }], reading(['12']))[0]).toMatchObject({
      quantity: '0',
      complete: true,
    });
  });
  it('bounds pins, rejects duplicate case variants, caller ownership fields and malformed revisions', () => {
    for (const value of [
      { revision: null, pins: [pin, { ...pin, templateId: 'spice' }] },
      { revision: null, pins: Array.from({ length: 13 }, (_, i) => ({ ...pin, templateId: String(i) })) },
      { revision: 'bad', pins: [] },
      { revision: null, pins: [], ownerId: 'foreign' },
      { revision: null, pins: [{ ...pin, name: 'a'.repeat(201) }] },
    ])
      expect(itemPinsRecordSchema.safeParse(value).success).toBe(false);
  });
});
