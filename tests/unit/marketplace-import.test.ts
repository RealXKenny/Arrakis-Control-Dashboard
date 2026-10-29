import { expect, it } from 'vitest';
import { marketplaceBlueprint } from '../../src/modules/marketplace/utils/import-layout';
import { createMarketplaceRecord } from '../../src/modules/marketplace/schema';

function record(layout: unknown) {
  return createMarketplaceRecord({
    id: 'a'.repeat(24),
    title: 'Base',
    author: 'Author',
    publishedAt: '2026-10-28T12:00:00.000Z',
    layout,
  });
}

it('prepares optional marketplace fields for the existing importer while preserving IDs and transforms', () => {
  const blueprint = marketplaceBlueprint(
    record({
      owner_name: 'Private',
      instances: [
        { instance_id: 0, building_type: 'Wall', x: 1, y: 2, z: 3, rotation: 47 },
        { building_type: 'Floor', x: 0, y: 0, z: 0 },
      ],
      placeables: [
        { placeable_id: '9007199254740993', building_type: 'Chair', x: 1, y: 2, z: 3, rx: 12, ry: 34, rz: 56 },
      ],
    }),
  );
  expect(blueprint.instances.map((piece) => piece.instance_id)).toEqual([0, 1]);
  expect(blueprint.instances[0].rotation).toBe(47);
  expect(blueprint.placeables[0]).toMatchObject({ placeable_id: '9007199254740993', rx: 12, ry: 34, rz: 56 });
  expect(blueprint).not.toHaveProperty('owner_name');
});

it('retains claim-console and unsupported shield restrictions of the existing importer', () => {
  expect(() =>
    marketplaceBlueprint(
      record({ instances: [], placeables: [{ building_type: 'Totem_Placeable', x: 0, y: 0, z: 0 }] }),
    ),
  ).toThrow('claim consoles');
  expect(() =>
    marketplaceBlueprint(
      record({
        instances: [{ building_type: 'Floor', x: 0, y: 0, z: 0 }],
        pentashields: [{ placeable_id: 0, scale: [2, 3, 4] }],
      }),
    ),
  ).toThrow();
});
