import { z } from 'zod';

const sourceSchema = z.object({
  map: z.string().max(100),
  partition: z.number().int().nonnegative().safe(),
  ready: z.boolean(),
});
const objectSchema = z.object({
  i: z.union([z.number().int().nonnegative().safe(), z.string().min(1).max(128)]),
  k: z.enum(['worm', 'npc', 'civilian', 'storm', 'coriolis']),
  s: z.number().int().nonnegative().safe(),
  x: z.number().finite(),
  y: z.number().finite(),
  z: z.number().finite(),
});
const snapshotSchema = z.object({
  gen: z.number().int().nonnegative().safe(),
  t: z.number().finite().nonnegative(),
  sources: z.array(z.unknown()).max(256),
  objects: z.array(z.unknown()).max(50_000),
});

export type RealtimeMarker = {
  id: string;
  type: string;
  name: string;
  x: number;
  y: number;
  z: number;
  partition: number;
  realtime: true;
};
export type RealtimeReading = {
  gen: number;
  capturedAt: number;
  sources: Array<{ partition: number; ready: boolean }>;
  markers: RealtimeMarker[];
};

const labels = { worm: 'Sandworm', npc: 'NPC', civilian: 'Civilian', storm: 'Sandstorm', coriolis: 'Coriolis' };

export function normalizeRealtime(value: unknown, map: string): RealtimeReading {
  const snapshot = snapshotSchema.parse(value);
  const wantedMap = map === 'DeepDesert' ? 'DeepDesert_1' : 'Survival_1';
  // Dev note: the source index is a compass; filtering it first would lose north.
  const sources = snapshot.sources.map((source) => sourceSchema.safeParse(source));
  const markers: RealtimeMarker[] = [];
  const ids = new Set<string>();
  for (const candidate of snapshot.objects) {
    const parsed = objectSchema.safeParse(candidate);
    if (!parsed.success) continue;
    const object = parsed.data;
    const source = sources[object.s];
    if (!source?.success || source.data.map !== wantedMap || !source.data.ready) continue;
    const id = `realtime:${object.s}:${object.i}`;
    if (ids.has(id)) continue;
    ids.add(id);
    markers.push({
      id,
      type: object.k === 'npc' ? 'realtime_npc' : object.k,
      name: labels[object.k],
      x: object.x,
      y: object.y,
      z: object.z,
      partition: source.data.partition,
      realtime: true,
    });
  }
  return {
    gen: snapshot.gen,
    capturedAt: snapshot.t,
    sources: sources.flatMap((source) =>
      source.success && source.data.map === wantedMap
        ? [{ partition: source.data.partition, ready: source.data.ready }]
        : [],
    ),
    markers,
  };
}
