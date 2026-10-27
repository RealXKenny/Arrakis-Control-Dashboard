import * as THREE from 'three';
import { z } from 'zod';
import { gunzip } from './terrainAssets';

const coordinate = z.number().finite().min(-1e8).max(1e8);
const piece = z.object({
  building_type: z.string().min(1).max(200),
  x: coordinate,
  y: coordinate,
  z: coordinate,
  rotation: coordinate.optional(),
  rx: coordinate.optional(),
  ry: coordinate.optional(),
  rz: coordinate.optional(),
});
const exportSchema = z.object({
  x: coordinate.optional(),
  y: coordinate.optional(),
  z: coordinate.optional(),
  instances: z.array(piece).max(5000).default([]),
  placeables: z.array(piece).max(5000).default([]),
  // Console exports index shield sizing by the original placeables array, not the mesh batch.
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
export function parseModelExport(value: unknown) {
  return exportSchema.parse(value);
}
type Vector = [number, number, number];
type Row = { mesh: number; group: string; offset?: Vector; rot?: Vector; scale?: Vector };
type Catalog = { rows: Record<string, Row>; meshes: { pack: number; offset: number; length: number; tris: number }[] };
export type BuildingPartSummary = { templateId: string; total: number; rendered: number };

/** Match actual catalogue IDs only; ambiguous case variants must never pick an unrelated item. */
export function resolveBuildingRow(rows: Record<string, Row>, templateId: string): Row | undefined {
  if (Object.hasOwn(rows, templateId)) return rows[templateId];
  const candidates = Object.keys(rows).filter((key) => key.toLowerCase() === templateId.toLowerCase());
  return candidates.length === 1 ? rows[candidates[0]] : undefined;
}

export function decodeBuildingMesh(buffer: ArrayBuffer) {
  const view = new DataView(buffer);
  if (buffer.byteLength < 36 || view.getUint32(0, true) !== 0x314c4d44) throw new Error('Invalid building mesh');
  const nv = view.getUint32(4, true),
    ni = view.getUint32(8, true);
  const offset = Math.ceil((36 + nv * 6) / 4) * 4;
  if (!nv || nv > 1_000_000 || ni > 3_000_000 || ni % 3 || offset + ni * (nv <= 65535 ? 2 : 4) !== buffer.byteLength)
    throw new Error('Invalid mesh size');
  const lo = [0, 1, 2].map((k) => view.getFloat32(12 + k * 4, true));
  const hi = [0, 1, 2].map((k) => view.getFloat32(24 + k * 4, true));
  if (![...lo, ...hi].every(Number.isFinite)) throw new Error('Invalid mesh bounds');
  const q = new Uint16Array(buffer, 36, nv * 3);
  const source = nv <= 65535 ? new Uint16Array(buffer, offset, ni) : new Uint32Array(buffer, offset, ni);
  const positions = new Float32Array(nv * 3),
    indices = new Uint32Array(ni);
  for (let i = 0; i < nv; i++) {
    const xyz = [0, 1, 2].map((k) => (lo[k] + (q[i * 3 + k] / 65535) * (hi[k] - lo[k])) / 100);
    positions.set([xyz[0], xyz[2], xyz[1]], i * 3);
  }
  for (let i = 0; i < ni; i += 3) {
    if (source[i] >= nv || source[i + 1] >= nv || source[i + 2] >= nv) throw new Error('Invalid mesh index');
    indices.set([source[i], source[i + 2], source[i + 1]], i);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setIndex(new THREE.BufferAttribute(indices, 1));
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

export function unrealMatrix(loc: Vector, rot: Vector = [0, 0, 0], scale: Vector = [1, 1, 1]) {
  const [p, y, r] = rot.map((v) => (v * Math.PI) / 180);
  const sp = Math.sin(p),
    cp = Math.cos(p),
    sy = Math.sin(y),
    cy = Math.cos(y),
    sr = Math.sin(r),
    cr = Math.cos(r);
  return new THREE.Matrix4()
    .set(
      cp * cy,
      sr * sp * cy - cr * sy,
      -(cr * sp * cy + sr * sy),
      loc[0],
      cp * sy,
      sr * sp * sy + cr * cy,
      cy * sr - cr * sp * sy,
      loc[1],
      sp,
      -sr * cp,
      cr * cp,
      loc[2],
      0,
      0,
      0,
      1,
    )
    .scale(new THREE.Vector3(...scale));
}
const convert = new THREE.Matrix4().set(0.01, 0, 0, 0, 0, 0, 0.01, 0, 0, 0.01, 0, 0, 0, 0, 0, 1);
const inverse = convert.clone().invert();
export function toSceneMatrix(matrix: THREE.Matrix4) {
  return matrix.clone().premultiply(convert).multiply(inverse);
}
const colors: Record<string, number> = {
  Atreides: 0x8d9d7a,
  Harkonnen: 0x596573,
  Choam: 0xd5bd94,
  Choam_Level2: 0xcab494,
  Smugglers: 0xaa8060,
  Functional: 0xa1aaa7,
  Decoration: 0xbca082,
};

export class BuildingLibrary {
  constructor(private signal?: AbortSignal) {}
  private catalog: Promise<Catalog> | null = null;
  private packs = new Map<number, Promise<Uint8Array>>();
  private geometries = new Map<number, Promise<THREE.BufferGeometry>>();
  private loaded = new Set<THREE.BufferGeometry>();
  private materials = new Map<string, THREE.MeshStandardMaterial>();
  private disposed = false;
  private load() {
    return (this.catalog ??= gunzip('/api/assets/models/catalog.json.gz', this.signal).then((raw) =>
      JSON.parse(new TextDecoder().decode(raw)),
    ));
  }
  private async geometry(id: number, catalog: Catalog) {
    if (!this.geometries.has(id)) {
      const meta = catalog.meshes[id];
      if (!meta) throw new Error('Unknown building mesh');
      if (!this.packs.has(meta.pack))
        this.packs.set(meta.pack, gunzip(`/api/assets/models/meshpack-${meta.pack}.bin.gz`, this.signal));
      const pending = this.packs.get(meta.pack)!.then((raw) => {
        if (this.disposed) throw new Error('Model library closed');
        const geometry = decodeBuildingMesh(raw.slice(meta.offset, meta.offset + meta.length).buffer);
        this.loaded.add(geometry);
        return geometry;
      });
      this.geometries.set(id, pending);
    }
    return this.geometries.get(id)!;
  }
  async build(value: unknown) {
    const data = parseModelExport(value),
      catalog = await this.load();
    if (this.disposed) throw new Error('Model library closed');
    const batches = new Map<string, { row: Row; matrices: THREE.Matrix4[] }>();
    const parts = new Map<string, BuildingPartSummary>();
    const shieldSizes = new Map(data.pentashields.map((shield) => [shield.placeable_id, shield.scale]));
    const shieldScales = new Map<number, Vector>();
    // The export carries target dimensions in metres for shields. Derive factors from our
    // native mesh plus catalogue transform, rather than borrowing GLB-specific axis fixes.
    await Promise.all(
      data.placeables.map(async (p, index) => {
        const target = shieldSizes.get(index);
        if (!target || !/^Choam_PentashieldSurface(?:Horizontal|Vertical)_Placeable$/.test(p.building_type)) return;
        const row = resolveBuildingRow(catalog.rows, p.building_type);
        if (!row || row.mesh < 0 || !catalog.meshes[row.mesh]) return;
        const geometry = await this.geometry(row.mesh, catalog);
        const local = toSceneMatrix(
          unrealMatrix(row.offset ?? [0, 0, 0], row.rot ?? [0, 0, 0], row.scale?.some(Boolean) ? row.scale : [1, 1, 1]),
        );
        const size = geometry.boundingBox!.clone().applyMatrix4(local).getSize(new THREE.Vector3());
        if (Math.min(size.x, size.y, size.z) <= 0) return;
        shieldScales.set(index, [target[0] / size.x, target[1] / size.z, target[2] / size.y]);
      }),
    );
    let known = 0,
      triangles = 0;
    const add = (p: z.infer<typeof piece>, placeable: boolean, index: number) => {
      const summary = parts.get(p.building_type) ?? { templateId: p.building_type, total: 0, rendered: 0 };
      summary.total++;
      parts.set(p.building_type, summary);
      const row = resolveBuildingRow(catalog.rows, p.building_type);
      if (!row || row.mesh < 0 || !catalog.meshes[row.mesh]) return;
      const cost = catalog.meshes[row.mesh].tris;
      if (triangles + cost > 400_000) return;
      triangles += cost;
      known++;
      summary.rendered++;
      const transform = unrealMatrix(
        [p.x, p.y, p.z],
        placeable ? [p.rx ?? 0, p.ry ?? 0, p.rz ?? 0] : [0, p.rotation ?? 0, 0],
        placeable ? shieldScales.get(index) : undefined,
      );
      const scale = row.scale?.some(Boolean) ? row.scale : ([1, 1, 1] as Vector);
      transform.multiply(unrealMatrix(row.offset ?? [0, 0, 0], row.rot ?? [0, 0, 0], scale));
      const key = `${row.mesh}:${row.group}`;
      if (!batches.has(key)) batches.set(key, { row, matrices: [] });
      batches.get(key)!.matrices.push(toSceneMatrix(transform));
    };
    data.instances.forEach((p, index) => add(p, false, index));
    data.placeables.forEach((p, index) => add(p, true, index));
    if (!known) throw new Error('No supported building pieces');
    const group = new THREE.Group();
    await Promise.all(
      [...batches.values()].map(async ({ row, matrices }) => {
        const geometry = await this.geometry(row.mesh, catalog);
        if (this.disposed) return;
        if (!this.materials.has(row.group))
          this.materials.set(
            row.group,
            new THREE.MeshStandardMaterial({
              color: colors[row.group] ?? 0xb7a68c,
              roughness: 0.78,
              metalness: 0.18,
              side: THREE.DoubleSide,
            }),
          );
        const batch = new THREE.InstancedMesh(geometry, this.materials.get(row.group), matrices.length);
        batch.name = `building-mesh-${row.mesh}:${row.group}`;
        matrices.forEach((m, i) => batch.setMatrixAt(i, m));
        batch.computeBoundingSphere();
        group.add(batch);
      }),
    );
    return {
      group,
      origin: [data.x, data.y, data.z],
      pieces: known,
      total: data.instances.length + data.placeables.length,
      parts: [...parts.values()].sort((a, b) => a.templateId.localeCompare(b.templateId)),
    };
  }
  dispose() {
    this.disposed = true;
    for (const g of this.loaded) g.dispose();
    for (const m of this.materials.values()) m.dispose();
    this.loaded.clear();
    this.materials.clear();
    this.packs.clear();
    this.geometries.clear();
  }
}
