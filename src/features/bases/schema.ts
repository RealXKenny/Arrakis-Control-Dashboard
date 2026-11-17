import { z } from 'zod';

/**
 * Base Marketplace contract (pure, browser-safe).
 *
 * The layout schema deliberately mirrors the legacy marketplace so records published by V1
 * stay readable and V2 uploads stay importable by the existing in-game import tooling.
 */
export const BASE_LAYOUT_MAX_BYTES = 2 * 1024 * 1024;
export const BASE_THUMBNAIL_MAX_BYTES = 700 * 1024;
export const BASE_UPLOAD_MAX_BYTES = BASE_LAYOUT_MAX_BYTES + BASE_THUMBNAIL_MAX_BYTES + 64 * 1024;
export const BASE_LISTING_LIMIT = 500;
export const BASE_PAGE_SIZE = 12;

const coordinate = z.number().finite().min(-1e8).max(1e8);
const identifier = z.union([z.number().int().nonnegative().safe(), z.string().regex(/^\d{1,20}$/)]);
const text = (maximum: number) => z.string().trim().min(1).max(maximum);

const instance = z.object({
  instance_id: identifier.optional(),
  building_type: text(200),
  x: coordinate,
  y: coordinate,
  z: coordinate,
  rotation: coordinate.optional(),
});
const placeable = z.object({
  placeable_id: identifier.optional(),
  building_type: text(200),
  x: coordinate,
  y: coordinate,
  z: coordinate,
  rotation: coordinate.optional(),
  rx: coordinate.optional(),
  ry: coordinate.optional(),
  rz: coordinate.optional(),
});

export const layoutSchema = z.object({
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

export const summarySchema = z.object({
  id: z.string().regex(/^[a-f0-9]{24}$/),
  title: text(120),
  author: text(100),
  baseType: text(80),
  map: text(80),
  pieceCount: z.number().int().min(1).max(10000),
  placeableCount: z.number().int().min(0).max(5000),
  publishedAt: z.iso.datetime(),
  description: text(500).optional(),
  /** Legacy (V1) listings carry a preview revision instead of `hasThumbnail`. */
  previewRevision: z
    .string()
    .regex(/^[a-f0-9]{24}$/)
    .optional(),
  hasThumbnail: z.boolean().optional(),
  /** Salted hash of the publisher. Never the raw Discord ID, since summaries are visible to all members. */
  ownerKey: z
    .string()
    .regex(/^[a-f0-9]{16}$/)
    .optional(),
});

export const recordSchema = z.object({ summary: summarySchema, layout: layoutSchema });

export type BaseLayout = z.infer<typeof layoutSchema>;
export type BaseSummary = z.infer<typeof summarySchema>;
export type BaseRecord = z.infer<typeof recordSchema>;

export function summaryHasThumbnail(summary: BaseSummary): boolean {
  return Boolean(summary.hasThumbnail || summary.previewRevision);
}

export class BaseValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BaseValidationError';
  }
}

/**
 * Parse an uploaded file. Accepts a raw layout or a full marketplace record
 * (so a downloaded listing can be re-uploaded unchanged).
 */
export function parseLayoutJson(source: string): BaseLayout {
  if (new TextEncoder().encode(source).length > BASE_LAYOUT_MAX_BYTES) {
    throw new BaseValidationError('The file exceeds the 2 MiB base limit.');
  }
  let value: unknown;
  try {
    value = JSON.parse(source);
  } catch {
    throw new BaseValidationError('The file is not valid JSON.');
  }
  if (value && typeof value === 'object' && 'layout' in value && 'summary' in value) {
    value = (value as { layout: unknown }).layout;
  }
  const parsed = layoutSchema.safeParse(value);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const where = issue.path.length ? ` (${issue.path.slice(0, 3).join('.')})` : '';
    throw new BaseValidationError(`This does not look like a base layout${where}: ${issue.message}`);
  }
  if (!parsed.data.instances.length && !parsed.data.placeables.length) {
    throw new BaseValidationError('The base has no building pieces.');
  }
  return parsed.data;
}

export const uploadMetaSchema = z.object({
  title: z.string().trim().max(120),
  description: z.string().trim().max(500),
});

export function buildBaseRecord(input: {
  id: string;
  title: string;
  author: string;
  description?: string;
  layout: BaseLayout;
  ownerKey: string;
  hasThumbnail: boolean;
  publishedAt: string;
}): BaseRecord {
  const { layout } = input;
  const record = recordSchema.parse({
    summary: {
      id: input.id,
      title: input.title,
      author: input.author,
      baseType: layout.base_type ?? 'Shared base',
      map: layout.map ?? 'Unknown map',
      pieceCount: layout.instances.length + layout.placeables.length,
      placeableCount: layout.placeables.length,
      publishedAt: input.publishedAt,
      ...(input.description ? { description: input.description } : {}),
      hasThumbnail: input.hasThumbnail,
      ownerKey: input.ownerKey,
    },
    layout,
  });
  if (new TextEncoder().encode(JSON.stringify(record)).length > BASE_LAYOUT_MAX_BYTES) {
    throw new BaseValidationError('The shared base exceeds the 2 MiB marketplace limit.');
  }
  return record;
}

export interface PieceCount {
  type: string;
  count: number;
}

/** Most-used building types, for the detail page's composition chart. */
export function pieceBreakdown(layout: BaseLayout, limit = 8): PieceCount[] {
  const counts = new Map<string, number>();
  for (const piece of [...layout.instances, ...layout.placeables]) {
    counts.set(piece.building_type, (counts.get(piece.building_type) ?? 0) + 1);
  }
  return [...counts]
    .map(([type, count]) => ({ type, count }))
    .sort((a, b) => b.count - a.count || a.type.localeCompare(b.type))
    .slice(0, limit);
}

/** Turn `BP_Wall_Sandstone_01` into `Wall Sandstone 01`. */
export function prettyPieceName(type: string): string {
  return type.replace(/^BP_/i, '').replace(/[_-]+/g, ' ').trim();
}
