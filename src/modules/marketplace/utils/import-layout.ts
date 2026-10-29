import { parseBlueprint } from '../../bases/schema';
import { parseMarketplaceRecord } from '../schema';

/** Fill optional export fields without changing existing IDs or per-item transforms. */
export function marketplaceBlueprint(value: unknown) {
  const { layout } = parseMarketplaceRecord(value);
  function identifiers(values: Array<string | number | undefined>) {
    const used = new Set(values.filter((id) => id !== undefined).map(String));
    let next = 0;
    return values.map((id) => {
      if (id !== undefined) return id;
      while (used.has(String(next))) next++;
      used.add(String(next));
      return next++;
    });
  }
  const instances = identifiers(layout.instances.map((piece) => piece.instance_id));
  const placeables = identifiers(layout.placeables.map((piece) => piece.placeable_id));
  return parseBlueprint({
    ...layout,
    instances: layout.instances.map((piece, index) => ({
      ...piece,
      instance_id: instances[index],
      rotation: piece.rotation ?? 0,
    })),
    placeables: layout.placeables.map((piece, index) => ({
      ...piece,
      placeable_id: placeables[index],
      rx: piece.rx ?? 0,
      ry: piece.ry ?? piece.rotation ?? 0,
      rz: piece.rz ?? 0,
    })),
  });
}
