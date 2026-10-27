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
type Row = { mesh: number; group: string; name?: string; offset?: Vector; rot?: Vector; scale?: Vector };
type Catalog = {
  rows: Record<string, Row>;
  meshes: { pack: number; offset: number; length: number; tris: number; format?: 'glb'; source?: 'native' }[];
};
export type BuildingPartSummary = { templateId: string; name?: string; total: number; rendered: number };

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

/** Classify untextured materials; player-built accent names are not lamps. */
export function visualFallbackKind(name: string): 'glass' | 'shield' | 'light' | 'light-blue' | null {
  const normalized = name.toLowerCase();
  if (/glass|translucent/.test(normalized)) return 'glass';
  if (/force_?field|hologram|shield|prudence_energy/.test(normalized)) return 'shield';
  if (normalized.includes('_pb_')) return null;
  if (/light_?blue/.test(normalized)) return 'light-blue';
  if (/_lights?\d*$/.test(normalized)) return 'light';
  return null;
}

/** Reference-derived offsets, converted from Babylon axes to the Three.js scene. */
export function visualYawOffset(templateId: string): number {
  if (templateId === 'Atreides_Outpost_Wall_Inclined_Wide_Left') return -37.5;
  if (templateId === 'Atreides_Outpost_Wall_Inclined_Wide_Right') return 37.5;
  const name = templateId.toLowerCase();
  if (name === 'atreides_outpost_stairs' || name === 'atreides_outpost_ramp') return 180;
  // Reference offsets are relative to its ordinary pieces; swapping Babylon's X/Z axes reverses yaw.
  if (name.includes('corner')) return 90;
  if ((name.includes('top') || name.includes('bottom')) && (name.includes('left') || name.includes('right')))
    return 180;
  if (name.includes('railing')) return 180;
  return 0;
}

type ModelPart = { geometry: THREE.BufferGeometry; material?: THREE.Material | THREE.Material[] };

export class BuildingLibrary {
  constructor(
    private signal?: AbortSignal,
    private options: { visual?: boolean } = {},
  ) {}
  private catalog: Promise<Catalog> | null = null;
  private packs = new Map<string, Promise<Uint8Array>>();
  private models = new Map<number, Promise<ModelPart[]>>();
  private loaded = new Set<THREE.BufferGeometry>();
  private materials = new Map<string, THREE.MeshStandardMaterial>();
  private visualMaterials = new Set<THREE.Material>();
  private textures = new Set<THREE.Texture>();
  private disposed = false;
  private load() {
    const name = this.options.visual ? 'visual-catalog.json.gz' : 'catalog.json.gz';
    return (this.catalog ??= gunzip(`/api/assets/models/${name}`, this.signal).then((raw) =>
      JSON.parse(new TextDecoder().decode(raw)),
    ));
  }
  private async model(id: number, catalog: Catalog): Promise<ModelPart[]> {
    if (!this.models.has(id)) {
      const meta = catalog.meshes[id];
      if (!meta) throw new Error('Unknown building mesh');
      const prefix = this.options.visual && meta.source !== 'native' ? 'visual-pack' : 'meshpack';
      const packKey = prefix + ':' + meta.pack;
      if (!this.packs.has(packKey))
        this.packs.set(packKey, gunzip(`/api/assets/models/${prefix}-${meta.pack}.bin.gz`, this.signal));
      const pending = this.packs.get(packKey)!.then(async (raw) => {
        if (this.disposed) throw new Error('Model library closed');
        const bytes = raw.slice(meta.offset, meta.offset + meta.length);
        const parts: ModelPart[] =
          meta.format === 'glb'
            ? await (await import('./visualBuildingMeshes')).loadVisualBuildingParts(bytes)
            : [{ geometry: decodeBuildingMesh(bytes.buffer) }];
        for (const part of parts) {
          this.loaded.add(part.geometry);
          for (const material of part.material
            ? Array.isArray(part.material)
              ? part.material
              : [part.material]
            : []) {
            this.visualMaterials.add(material);
            for (const value of Object.values(material)) if (value instanceof THREE.Texture) this.textures.add(value);
            for (const texture of material.userData.arrakisTextures ?? [])
              if (texture instanceof THREE.Texture) this.textures.add(texture);
          }
        }
        if (this.disposed) {
          this.dispose();
          throw new Error('Model library closed');
        }
        return parts;
      });
      this.models.set(id, pending);
    }
    return this.models.get(id)!;
  }
  private material(group: string) {
    if (!this.materials.has(group))
      this.materials.set(
        group,
        new THREE.MeshStandardMaterial({
          color: colors[group] ?? 0xb7a68c,
          roughness: 0.78,
          metalness: 0.18,
          side: THREE.DoubleSide,
        }),
      );
    return this.materials.get(group)!;
  }
  private specialMaterial(kind: NonNullable<ReturnType<typeof visualFallbackKind>>) {
    const key = 'special:' + kind;
    if (!this.materials.has(key)) {
      const options: Record<
        NonNullable<ReturnType<typeof visualFallbackKind>>,
        THREE.MeshStandardMaterialParameters
      > = {
        glass: { color: 0x739ebf, transparent: true, opacity: 0.28, metalness: 0, roughness: 0.1, depthWrite: false },
        shield: {
          color: 0x33ccd9,
          emissive: 0x146680,
          transparent: true,
          opacity: 0.4,
          metalness: 0,
          roughness: 0.3,
          depthWrite: false,
        },
        'light-blue': { color: 0x338cb3, emissive: 0x66d9ff, metalness: 0.1, roughness: 0.2 },
        light: { color: 0xffeba6, emissive: 0xd9b366, metalness: 0, roughness: 0.4 },
      };
      this.materials.set(key, new THREE.MeshStandardMaterial({ ...options[kind], side: THREE.DoubleSide }));
    }
    return this.materials.get(key)!;
  }
  async build(value: unknown) {
    const data = parseModelExport(value),
      catalog = await this.load();
    if (this.disposed) throw new Error('Model library closed');
    const batches = new Map<string, { row: Row; matrices: THREE.Matrix4[] }>();
    const parts = new Map<string, BuildingPartSummary>();
    const shieldSizes = new Map(data.pentashields.map((shield) => [shield.placeable_id, shield.scale]));
    const shieldScales = new Map<number, Vector>();
    // Shields carry target metre dimensions: derive factors from actual model bounds.
    await Promise.all(
      data.placeables.map(async (p, index) => {
        const target = shieldSizes.get(index);
        if (!target || !/^Choam_PentashieldSurface(?:Horizontal|Vertical)_Placeable$/.test(p.building_type)) return;
        const row = resolveBuildingRow(catalog.rows, p.building_type);
        if (!row || row.mesh < 0 || !catalog.meshes[row.mesh]) return;
        const bounds = new THREE.Box3();
        for (const part of await this.model(row.mesh, catalog)) bounds.union(part.geometry.boundingBox!);
        const local = toSceneMatrix(
          unrealMatrix(row.offset ?? [0, 0, 0], row.rot ?? [0, 0, 0], row.scale?.some(Boolean) ? row.scale : [1, 1, 1]),
        );
        const size = bounds.applyMatrix4(local).getSize(new THREE.Vector3());
        if (Math.min(size.x, size.y, size.z) <= 0) return;
        shieldScales.set(index, [target[0] / size.x, target[1] / size.z, target[2] / size.y]);
      }),
    );
    let known = 0,
      triangles = 0;
    const add = (p: z.infer<typeof piece>, placeable: boolean, index: number) => {
      const row = resolveBuildingRow(catalog.rows, p.building_type);
      const summary = parts.get(p.building_type) ?? {
        templateId: p.building_type,
        ...(row?.name ? { name: row.name } : {}),
        total: 0,
        rendered: 0,
      };
      summary.total++;
      parts.set(p.building_type, summary);
      if (!row || row.mesh < 0 || !catalog.meshes[row.mesh]) return;
      const cost = catalog.meshes[row.mesh].tris;
      if (triangles + cost > (this.options.visual ? 4_000_000 : 400_000)) return;
      triangles += cost;
      known++;
      summary.rendered++;
      const transform = unrealMatrix(
        [p.x, p.y, p.z],
        placeable
          ? [p.rx ?? 0, p.ry ?? 0, p.rz ?? 0]
          : [0, (p.rotation ?? 0) + (this.options.visual ? visualYawOffset(p.building_type) : 0), 0],
        placeable ? shieldScales.get(index) : undefined,
      );
      transform.multiply(
        unrealMatrix(row.offset ?? [0, 0, 0], row.rot ?? [0, 0, 0], row.scale?.some(Boolean) ? row.scale : [1, 1, 1]),
      );
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
        const model = await this.model(row.mesh, catalog);
        if (this.disposed) return;
        for (const [index, part] of model.entries()) {
          // Untextured white FModel placeholders are not the game's layered material.
          // Use the existing faction palette until the missing shader layers are available.
          const fallback = (material: THREE.Material) => {
            if (!(material instanceof THREE.MeshStandardMaterial) || material.map) return material;
            const kind = visualFallbackKind(material.name);
            if (kind) return this.specialMaterial(kind);
            return material.color.getHex() === 0xffffff && !material.transparent && material.opacity === 1
              ? this.material(row.group)
              : material;
          };
          const material = Array.isArray(part.material)
            ? part.material.map(fallback)
            : part.material
              ? fallback(part.material)
              : row.group === '__shield'
                ? this.specialMaterial('shield')
                : this.material(row.group);
          const batch = new THREE.InstancedMesh(part.geometry, material, matrices.length);
          batch.name = `building-mesh-${row.mesh}:${row.group}${index ? `:${index}` : ''}`;
          matrices.forEach((matrix, item) => batch.setMatrixAt(item, matrix));
          batch.computeBoundingSphere();
          group.add(batch);
        }
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
    for (const geometry of this.loaded) geometry.dispose();
    for (const material of this.materials.values()) material.dispose();
    for (const material of this.visualMaterials) material.dispose();
    for (const texture of this.textures) {
      texture.dispose();
      const data = texture.source.data;
      if (typeof ImageBitmap !== 'undefined' && data instanceof ImageBitmap) data.close();
    }
    this.loaded.clear();
    this.materials.clear();
    this.visualMaterials.clear();
    this.textures.clear();
    this.packs.clear();
    this.models.clear();
  }
}
