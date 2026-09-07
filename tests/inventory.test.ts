import { describe, expect, it } from 'vitest';
import { inventoryItems, journeySummary } from '../src/modules/portal/utils/inventory';

describe('player dossier transformations', () => {
  it('distinguishes unavailable inventory from an empty inventory', () => {
    expect(inventoryItems(null)).toBeNull();
    expect(inventoryItems({ supported: false, rows: [] })).toBeNull();
    expect(inventoryItems({ rows: [] })).toEqual([]);
  });
  it('maps upstream inventory types and preserves zero and large quantities', () => {
    const items = inventoryItems({
      rows: [
        { id: '1', item_name: 'Cloth', inventory_type: 0, stack_size: '9007199254740993', quality_level: 0 },
        { id: '2', name: 'Suit', inventory_type: 1 },
        { id: '3', name: 'Knife', inventory_type: 15 },
        { id: '4', name: 'Plan', inventory_type: 30 },
      ],
    });
    expect(items?.map((item) => item.group)).toEqual(['Backpack', 'Character gear', 'Loadout', 'Schematics']);
    expect(items?.[0]).toMatchObject({ quantity: '9007199254740993', grade: '0' });
    expect(items?.[1].quantity).toBe('—');
  });
  it('counts only completed milestones within documented categories', () => {
    expect(journeySummary({ rows: { story: [{ complete: true }, { complete: false }], codex: [] } })).toEqual([
      { name: 'story', completed: 1, total: 2 },
      { name: 'codex', completed: 0, total: 0 },
    ]);
    expect(journeySummary(null)).toBeNull();
  });
});
