import { z } from 'zod';

export const MARKETPLACE_LAYOUT_MAX_BYTES = 2 * 1024 * 1024;
export const MARKETPLACE_LISTING_LIMIT = 200;
const coordinate = z.number().finite().min(-1e8).max(1e8);
const identifier = z.union([z.number().int().nonnegative().safe(), z.string().regex(/^\d{1,20}$/)]);
const buildingType = z.string().min(1).max(200);
const text = (maximum: number) => z.string().trim().min(1).max(maximum);
const instance = z.object({
  instance_id: identifier.optional(),
  building_type: buildingType,
  x: coordinate,
  y: coordinate,
  z: coordinate,
  rotation: coordinate.optional(),
});
const placeable = z.object({
  placeable_id: identifier.optional(),
  building_type: buildingType,
  x: coordinate,
  y: coordinate,
  z: coordinate,
  rotation: coordinate.optional(),
  rx: coordinate.optional(),
  ry: coordinate.optional(),
  rz: coordinate.optional(),
});
const layoutSchema = z.object({
  name: text(120).optional(),
  base_type: text(80).optional(),
  map: text(80).optional(),
  x: coordinate.optional(),
  y: coordinate.optional(),
  z: coordinate.optional(),
  instances: z.array(instance).max(5000).default([]),
  placeables: z.array(placeable).max(5000).default([]),
  pentashields: z
    .array(
      z.object({
        placeable_id: z.number().int().min(0).max(4999),
        scale: z.tuple([coordinate.positive(), coordinate.positive(), coordinate.positive()]),
      }),
    )
    .max(5000)
    .default([]),
});
const summarySchema = z.object({
  id: z.string().regex(/^[a-f0-9]{24}$/),
  title: text(120),
  author: text(100),
  baseType: text(80),
  map: text(80),
  pieceCount: z.number().int().min(1).max(10000),
  placeableCount: z.number().int().min(0).max(5000),
  publishedAt: z.string().datetime(),
});
const recordSchema = z.object({ summary: summarySchema, layout: layoutSchema });

export type MarketplaceSummary = z.infer<typeof summarySchema>;
export type MarketplaceLayout = z.infer<typeof layoutSchema>;
export type MarketplaceRecord = z.infer<typeof recordSchema>;

export function parseMarketplaceLayout(value: unknown): MarketplaceLayout {
  const layout = layoutSchema.parse(value);
  if (!layout.instances.length && !layout.placeables.length) throw new Error('The base has no building pieces.');
  return layout;
}

export function createMarketplaceRecord({
  id,
  title,
  author,
  layout: value,
  publishedAt,
}: {
  id: string;
  title: string;
  author: string;
  layout: unknown;
  publishedAt: string;
}): MarketplaceRecord {
  const layout = parseMarketplaceLayout(value);
  const record = recordSchema.parse({
    summary: {
      id,
      title,
      author,
      baseType: layout.base_type ?? 'Shared base',
      map: layout.map ?? 'Unknown map',
      pieceCount: layout.instances.length + layout.placeables.length,
      placeableCount: layout.placeables.length,
      publishedAt,
    },
    layout,
  });
  if (new TextEncoder().encode(JSON.stringify(record)).length > MARKETPLACE_LAYOUT_MAX_BYTES)
    throw new Error('The shared base exceeds the 2 MiB marketplace limit.');
  return record;
}

export function parseMarketplaceSummary(value: unknown): MarketplaceSummary {
  return summarySchema.parse(value);
}

export function parseMarketplaceRecord(value: unknown): MarketplaceRecord {
  return recordSchema.parse(value);
}
