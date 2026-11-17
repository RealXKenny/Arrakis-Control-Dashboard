import { describe, expect, it } from 'vitest';
import { inventoryItems } from '../../../src/features/player/inventory';
import { ALL_CONTAINERS, parseStorageQuery, storageHref, viewStorage } from '../../../src/features/player/storage';

const items = inventoryItems({
  rows: [
    { item_id: 1, display_name: 'Water Cache', inventory_type: 0, stack_size: 4, quality_level: 1 },
    { item_id: 2, display_name: 'Stillsuit', inventory_type: 1, stack_size: 1, quality_level: 3 },
    { item_id: 3, display_name: 'Water Pack', inventory_type: 1, stack_size: 2, quality_level: 2 },
  ],
})!;

describe('V2 storage view', () => {
  it('counts containers and filters by container and search', () => {
    const all = viewStorage(items, parseStorageQuery({}));
    expect(all.containers).toEqual([
      { name: ALL_CONTAINERS, count: 3 },
      { name: 'Backpack', count: 1 },
      { name: 'Character gear', count: 2 },
    ]);
    const filtered = viewStorage(items, parseStorageQuery({ container: 'Character gear', q: 'water' }));
    expect(filtered.items.map((item) => item.name)).toEqual(['Water Pack']);
  });

  it('falls back to all containers for unknown names and heals hostile queries', () => {
    expect(viewStorage(items, parseStorageQuery({ container: 'Nope' })).active).toBe(ALL_CONTAINERS);
    expect(parseStorageQuery({ q: 'x'.repeat(500), layout: 'cube' })).toEqual({
      container: ALL_CONTAINERS,
      q: '',
      layout: 'grid',
    });
  });

  it('builds canonical links', () => {
    const query = parseStorageQuery({ container: 'Backpack', layout: 'list' });
    expect(storageHref(query)).toBe('/storage?container=Backpack&layout=list');
    expect(storageHref(query, { container: ALL_CONTAINERS, layout: 'grid' })).toBe('/storage');
  });
});
