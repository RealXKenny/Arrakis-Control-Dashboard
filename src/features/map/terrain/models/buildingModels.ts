import * as THREE from 'three';
import { z } from 'zod';
import { gunzip } from '../surface/terrainAssets';

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
type Row = {
  mesh: number;
  group: string;
  name?: string;
  offset?: Vector;
  rot?: Vector;
  scale?: Vector;
  accessories?: number[];
};
type MeshMeta = {
  pack: number;
  offset: number;
  length: number;
  tris: number;
  /** Offset of the UVH1 channel inside the mesh record; present only with an albedo texture. */
  uv?: number;
  uvLength?: number;
  texture?: string;
  materials?: string[];
};
type TextureMeta = { pack: number; offset: number; length: number; mime: string };
type Catalog = { rows: Record<string, Row>; meshes: MeshMeta[]; textures?: Record<string, TextureMeta> };
const MAX_PACK_BYTES = 64 * 1024 * 1024;
const MAX_TEXTURE_BYTES = 4 * 1024 * 1024;
const TEXTURE_MIMES = new Set(['image/jpeg', 'image/png']);
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

function halfToFloat(half: number) {
  const sign = half & 0x8000 ? -1 : 1,
    exponent = (half >> 10) & 31,
    mantissa = half & 1023;
  if (exponent === 0) return sign * mantissa * 2 ** -24;
  if (exponent === 31) return Number.NaN;
  return sign * (1 + mantissa / 1024) * 2 ** (exponent - 15);
}

/** UVH1 from the MapViewer3D client data: one half-float UV pair per DML1 vertex, in vertex order. */
export function decodeBuildingUv(buffer: ArrayBuffer, vertices: number) {
  const view = new DataView(buffer);
  if (
    buffer.byteLength !== 8 + vertices * 4 ||
    view.getUint32(0, true) !== 0x31485655 ||
    view.getUint32(4, true) !== vertices
  )
    throw new Error('Invalid building UVs');
  const uv = new Float32Array(vertices * 2);
  for (let i = 0; i < uv.length; i++) {
    const value = halfToFloat(view.getUint16(8 + i * 2, true));
    // Dev note: a NaN UV is the spice of texture bugs; flatten it before it spreads.
    uv[i] = Number.isFinite(value) ? value : 0;
  }
  return uv;
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

type ModelPart = { geometry: THREE.BufferGeometry; material?: THREE.Material | THREE.Material[] };

export class BuildingLibrary {
  constructor(
    private signal?: AbortSignal,
    private options: { visual?: boolean; assetRefresh?: string } = {},
  ) {}
  private catalog: Promise<Catalog> | null = null;
  private packs = new Map<string, Promise<Uint8Array>>();
  private models = new Map<number, Promise<ModelPart[]>>();
  private loaded = new Set<THREE.BufferGeometry>();
  private materials = new Map<string, THREE.MeshStandardMaterial>();
  private visualMaterials = new Set<THREE.Material>();
  private textures = new Set<THREE.Texture>();
  private texturedMaterials = new Map<string, Promise<THREE.MeshStandardMaterial | null>>();
  private disposed = false;
  private assetUrl(name: string) {
    const url = `/api/assets/models/${name}`;
    return this.options.assetRefresh ? `${url}?refresh=${encodeURIComponent(this.options.assetRefresh)}` : url;
  }
  private load() {
    // Detailed previews use the MapViewer3D client packs; the fast preview keeps the simplified native pack.
    const name = this.options.visual ? 'client/catalog.json.gz' : 'native/catalog.json.gz';
    return (this.catalog ??= gunzip(this.assetUrl(name), this.signal).then((raw) =>
      JSON.parse(new TextDecoder().decode(raw)),
    ));
  }
  private pack(file: string) {
    if (!this.packs.has(file))
      this.packs.set(
        file,
        gunzip(this.assetUrl(file), this.signal).then((raw) => {
          if (raw.byteLength > MAX_PACK_BYTES) throw new Error('Model pack exceeds its decoded size limit');
          return raw;
        }),
      );
    return this.packs.get(file)!;
  }
  private async model(id: number, catalog: Catalog): Promise<ModelPart[]> {
    if (!this.models.has(id)) {
      const meta = catalog.meshes[id];
      if (!meta || !Number.isInteger(meta.pack) || meta.pack < 0 || meta.pack > 99)
        throw new Error('Unknown building mesh');
      const packFile = this.options.visual
        ? `client/client-meshes-${meta.pack}.bin.gz`
        : `native/meshpacks/meshpack-${meta.pack}.bin.gz`;
      const pending = this.pack(packFile).then(async (raw) => {
        if (this.disposed) throw new Error('Model library closed');
        const end = meta.offset + meta.length;
        if (!Number.isSafeInteger(meta.offset) || meta.offset < 0 || meta.length <= 0 || end > raw.byteLength)
          throw new Error('Invalid building mesh range');
        const geometry = decodeBuildingMesh(raw.slice(meta.offset, end).buffer);
        this.loaded.add(geometry);
        let material: THREE.Material | undefined;
        const kinds = (meta.materials ?? []).map(visualFallbackKind);
        // A single-section client mesh can only use a special look when every slot shares it.
        if (kinds.length && kinds.every((kind) => kind && kind === kinds[0]))
          material = this.specialMaterial(kinds[0]!);
        else if (this.options.visual && meta.texture && meta.uv === meta.length && meta.uvLength) {
          const uvEnd = end + meta.uvLength;
          if (uvEnd > raw.byteLength) throw new Error('Invalid building UV range');
          geometry.setAttribute(
            'uv',
            new THREE.BufferAttribute(
              decodeBuildingUv(raw.slice(end, uvEnd).buffer, geometry.getAttribute('position').count),
              2,
            ),
          );
          material = (await this.texturedMaterial(meta.texture, catalog)) ?? undefined;
        }
        if (this.disposed) {
          this.dispose();
          throw new Error('Model library closed');
        }
        return [{ geometry, ...(material ? { material } : {}) }];
      });
      this.models.set(id, pending);
    }
    return this.models.get(id)!;
  }
  /** One albedo per client mesh approximates the game's layered materials; failures keep faction colours. */
  private texturedMaterial(id: string, catalog: Catalog) {
    if (!this.texturedMaterials.has(id))
      this.texturedMaterials.set(
        id,
        (async () => {
          const meta = catalog.textures?.[id];
          if (
            !/^[a-f0-9]{64}$/.test(id) ||
            !meta ||
            !Number.isInteger(meta.pack) ||
            meta.pack < 0 ||
            meta.pack > 99 ||
            !TEXTURE_MIMES.has(meta.mime) ||
            !Number.isSafeInteger(meta.offset) ||
            meta.offset < 0 ||
            meta.length <= 0 ||
            meta.length > MAX_TEXTURE_BYTES
          )
            throw new Error('Invalid building texture');
          if (typeof createImageBitmap !== 'function') return null;
          const raw = await this.pack(`client/client-textures-${meta.pack}.bin.gz`);
          if (meta.offset + meta.length > raw.byteLength) throw new Error('Invalid building texture range');
          const bitmap = await createImageBitmap(
            new Blob([raw.slice(meta.offset, meta.offset + meta.length)], { type: meta.mime }),
          );
          const texture = new THREE.Texture(bitmap);
          // UE UVs start at the top of the image, which matches an unflipped ImageBitmap upload.
          texture.flipY = false;
          texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
          texture.colorSpace = THREE.SRGBColorSpace;
          texture.anisotropy = 4;
          texture.needsUpdate = true;
          this.textures.add(texture);
          if (this.disposed) {
            this.dispose();
            throw new Error('Model library closed');
          }
          const material = new THREE.MeshStandardMaterial({
            map: texture,
            roughness: 0.85,
            metalness: 0.05,
            side: THREE.DoubleSide,
          });
          this.visualMaterials.add(material);
          return material;
        })().catch((error: unknown) => {
          if (this.disposed) throw error;
          return null;
        }),
      );
    return this.texturedMaterials.get(id)!;
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
    const matrix = new THREE.Matrix4();
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
      const cost =
        catalog.meshes[row.mesh].tris +
        (row.accessories ?? []).reduce((sum, meshId) => sum + (catalog.meshes[meshId]?.tris ?? 0), 0);
      if (triangles + cost > (this.options.visual ? 4_000_000 : 400_000)) return;
      triangles += cost;
      known++;
      summary.rendered++;
      // All model formats share UE X/Z/Y scene axes. Apply native actor and catalogue
      // transforms once; names such as "corner" must never change mesh identity or yaw.
      matrix.copy(
        unrealMatrix(
          [p.x, p.y, p.z],
          placeable ? [p.rx ?? 0, p.ry ?? 0, p.rz ?? 0] : [0, p.rotation ?? 0, 0],
          placeable ? shieldScales.get(index) : undefined,
        ).multiply(
          unrealMatrix(row.offset ?? [0, 0, 0], row.rot ?? [0, 0, 0], row.scale?.some(Boolean) ? row.scale : [1, 1, 1]),
        ),
      );
      const key = `${row.mesh}:${row.group}`;
      if (!batches.has(key)) batches.set(key, { row, matrices: [] });
      batches.get(key)!.matrices.push(toSceneMatrix(matrix));
    };
    data.instances.forEach((p, index) => add(p, false, index));
    data.placeables.forEach((p, index) => add(p, true, index));
    if (!known) throw new Error('No supported building pieces');
    const group = new THREE.Group();
    const prepared = await Promise.all(
      [...batches.values()].map(async ({ row, matrices }) => ({
        row,
        matrices,
        model: (
          await Promise.all([row.mesh, ...(row.accessories ?? [])].map((meshId) => this.model(meshId, catalog)))
        ).flat(),
      })),
    );
    for (const { row, matrices, model } of prepared) {
      if (this.disposed) return;
      for (const [index, part] of model.entries()) {
        // Shields always use the translucent shield look; untextured meshes keep the faction palette.
        const material =
          row.group === '__shield' ? this.specialMaterial('shield') : (part.material ?? this.material(row.group));
        const batch = new THREE.InstancedMesh(part.geometry, material, matrices.length);
        batch.name = `building-mesh-${row.mesh}:${row.group}${index ? `:${index}` : ''}`;
        matrices.forEach((matrix, item) => batch.setMatrixAt(item, matrix));
        batch.computeBoundingSphere();
        group.add(batch);
      }
    }
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
    this.texturedMaterials.clear();
    this.packs.clear();
    this.models.clear();
  }
}
