import { z } from 'zod';

export const MAX_BLUEPRINT_BYTES = 512 * 1024;
const coordinate = z.number().finite().min(-1e8).max(1e8);
const id = z.union([z.number().int().nonnegative().safe(), z.string().regex(/^\d{1,20}$/)]);
const building = z
  .string()
  .min(1)
  .max(200)
  .regex(/^[\w/.: -]+$/);
const instance = z.object({
  instance_id: id,
  building_type: building,
  x: coordinate,
  y: coordinate,
  z: coordinate,
  rotation: coordinate,
});
const placeable = z.object({
  placeable_id: id,
  building_type: building,
  x: coordinate,
  y: coordinate,
  z: coordinate,
  rx: coordinate,
  ry: coordinate,
  rz: coordinate,
});
const blueprintSchema = z.object({
  instances: z.array(instance).max(5000),
  placeables: z.array(placeable).max(5000).default([]),
  pentashields: z.array(z.unknown()).max(0).optional(),
});

/** Console base-export format. Strip live owner, base ID and world coordinates. */
export function parseBlueprint(value: unknown) {
  const result = blueprintSchema.safeParse(value);
  if (!result.success)
    throw new Error(
      'Use a Console base-export JSON with instances and placeables. Unsupported blueprint formats must be converted before importing.',
    );
  const { instances, placeables } = result.data;
  if (!instances.length && !placeables.length) throw new Error('The blueprint has no building pieces.');
  if (placeables.some((piece) => /^(totem_small_placeable|totem_placeable)$/i.test(piece.building_type)))
    throw new Error('Remove claim consoles before importing a blueprint.');
  for (const ids of [
    instances.map((piece) => String(piece.instance_id)),
    placeables.map((piece) => String(piece.placeable_id)),
  ]) {
    if (new Set(ids).size !== ids.length) throw new Error('Blueprint piece IDs must be unique.');
  }
  const blueprint = { instances, placeables };
  if (new TextEncoder().encode(JSON.stringify(blueprint)).length > MAX_BLUEPRINT_BYTES)
    throw new Error('Blueprints must be 512 KiB or smaller.');
  return blueprint;
}
export type Blueprint = ReturnType<typeof parseBlueprint>;
