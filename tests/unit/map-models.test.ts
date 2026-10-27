import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import * as THREE from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  BuildingLibrary,
  decodeBuildingMesh,
  parseModelExport,
  resolveBuildingRow,
  toSceneMatrix,
  unrealMatrix,
  visualFallbackKind,
  visualYawOffset,
} from '../../src/modules/map/terrain/buildingModels';
import { createVehicleModel, disposeVehicleModels, vehicleKind } from '../../src/modules/map/terrain/vehicleModels';
import { niceScale } from '../../src/modules/map/terrain/mapPresentation';
const catalog = JSON.parse(gunzipSync(readFileSync('src/assets/models/catalog.json.gz')).toString());
const visualCatalog = JSON.parse(gunzipSync(readFileSync('src/assets/models/visual-catalog.json.gz')).toString());
afterEach(() => vi.unstubAllGlobals());
describe('map models', () => {
  it('keeps a wall normal aligned with its rotated foundation edge', () => {
    for (const yaw of [0, 10, 90, 100, 180, 270]) {
      const normal = new THREE.Vector3(0, 0, 1).transformDirection(toSceneMatrix(unrealMatrix([0, 0, 0], [0, yaw, 0])));
      expect(normal.x).toBeCloseTo(-Math.sin((yaw * Math.PI) / 180));
      expect(normal.z).toBeCloseTo(Math.cos((yaw * Math.PI) / 180));
    }
  });
  it('applies reference-derived offsets to structural piece classes', () => {
    expect(visualYawOffset('Atreides_Outpost_Wall_Inclined_Wide_Left')).toBe(-37.5);
    expect(visualYawOffset('Atreides_Outpost_Wall_Inclined_Wide_Right')).toBe(37.5);
    expect(visualYawOffset('Atreides_Outpost_Wall_01')).toBe(0);
    expect(visualYawOffset('Atreides_Outpost_Wall_Round_Corner_01')).toBe(90);
    expect(visualYawOffset('Atreides_Outpost_Railing')).toBe(180);
    expect(visualYawOffset('Atreides_Outpost_Wall_Triangle_Bottom_Right')).toBe(180);
  });
  it('recognizes untextured glass, shields and lamps without treating building accents as lamps', () => {
    expect(visualFallbackKind('MI_Window_Glass')).toBe('glass');
    expect(visualFallbackKind('MI_Pentashield')).toBe('shield');
    expect(visualFallbackKind('MI_Prop_Lights')).toBe('light');
    expect(visualFallbackKind('MI_PB_Light_Blue')).toBeNull();
  });
  it('decodes every bundled mesh without invalid indices or nonfinite positions', () => {
    const packs = new Map<number, Buffer>();
    for (const mesh of catalog.meshes) {
      if (!packs.has(mesh.pack))
        packs.set(mesh.pack, gunzipSync(readFileSync(`src/assets/models/meshpack-${mesh.pack}.bin.gz`)));
      const data = packs.get(mesh.pack)!;
      const geometry = decodeBuildingMesh(
        Uint8Array.from(data.subarray(mesh.offset, mesh.offset + mesh.length)).buffer,
      );
      expect(geometry.index!.count / 3).toBe(mesh.tris);
      expect(Array.from(geometry.getAttribute('position').array).every(Number.isFinite)).toBe(true);
      geometry.dispose();
    }
    expect(() => decodeBuildingMesh(new ArrayBuffer(40))).toThrow();
  });
  it('preserves centimetres, rotation and relative building-piece transforms', () => {
    const m = toSceneMatrix(unrealMatrix([100, 200, 300], [0, 90, 0]));
    expect(new THREE.Vector3().setFromMatrixPosition(m).toArray()).toEqual([1, 3, 2]);
    const direction = new THREE.Vector3(1, 0, 0).transformDirection(m);
    expect(direction.z).toBeCloseTo(1);
  });
  it('builds real pieces in batches, shares geometry, and reports unsupported pieces', async () => {
    const fetcher = vi.fn(
      async (url: string) => new Response(new Uint8Array(readFileSync(`src/assets/models/${url.split('/').at(-1)}`))),
    );
    vi.stubGlobal('fetch', fetcher);
    const library = new BuildingLibrary();
    const piece = { building_type: 'Atreides_Outpost_Foundation', x: 500, y: 0, z: 0, rotation: 90 };
    const built = await library.build({
      owner_secret: 'excluded',
      instances: [piece, { ...piece, x: 1000 }, { ...piece, building_type: 'MissingBuilding' }],
    });
    expect(built.pieces).toBe(2);
    expect(built.total).toBe(3);
    expect(built.group.children).toHaveLength(1);
    const batch = built.group.children[0] as THREE.InstancedMesh;
    expect(batch.count).toBe(2);
    const transform = new THREE.Matrix4();
    batch.getMatrixAt(0, transform);
    expect(transform.elements[12]).toBe(5);
    expect(fetcher).toHaveBeenCalledTimes(2);
    built.group.traverse((o) => {
      if (o instanceof THREE.InstancedMesh) o.dispose();
    });
    library.dispose();
    expect(parseModelExport({ instances: [piece], owner_secret: 'excluded' })).not.toHaveProperty('owner_secret');
    expect(() => parseModelExport({ instances: [{ ...piece, x: Infinity }] })).toThrow();
  });
  it('uses original shield proxy packs in the visual preview', async () => {
    const fetcher = vi.fn(
      async (url: string) => new Response(new Uint8Array(readFileSync('src/assets/models/' + url.split('/').at(-1)))),
    );
    vi.stubGlobal('fetch', fetcher);
    const library = new BuildingLibrary(undefined, { visual: true });
    const result = await library.build({
      placeables: [
        { building_type: 'Choam_PentashieldSurfaceVertical_Placeable', x: 0, y: 0, z: 0 },
        { building_type: 'Choam_PentashieldSurfaceHorizontal_Placeable', x: 100, y: 0, z: 0 },
      ],
    });
    expect(result.pieces).toBe(2);
    expect(result.group.children).toHaveLength(2);
    expect(fetcher.mock.calls.map(([url]) => String(url))).toContain('/api/assets/models/meshpack-8.bin.gz');
    const verticalMesh = visualCatalog.rows.Choam_PentashieldSurfaceVertical_Placeable.mesh;
    const horizontalMesh = visualCatalog.rows.Choam_PentashieldSurfaceHorizontal_Placeable.mesh;
    const vertical = result.group.children.find((object) => object.name.startsWith(`building-mesh-${verticalMesh}:`));
    const horizontal = result.group.children.find((object) =>
      object.name.startsWith(`building-mesh-${horizontalMesh}:`),
    );
    expect(vertical).toBeDefined();
    expect(horizontal).toBeDefined();
    expect(new THREE.Box3().setFromObject(vertical!).getSize(new THREE.Vector3()).y).toBeGreaterThan(3);
    expect(new THREE.Box3().setFromObject(horizontal!).getSize(new THREE.Vector3()).z).toBeGreaterThan(4);
    for (const object of result.group.children) {
      const material = (object as THREE.InstancedMesh).material as THREE.MeshStandardMaterial;
      expect(material.transparent).toBe(true);
      expect(material.opacity).toBeCloseTo(0.4);
      (object as THREE.InstancedMesh).dispose();
    }
    library.dispose();
  });
  it('provides distinct vehicle silhouettes and stable metric scale units', () => {
    expect(vehicleKind('TransportOrnithopter')).toBe('transport');
    expect(vehicleKind('SandCrawler')).toBe('crawler');
    const buggy = createVehicleModel('Buggy'),
      thopter = createVehicleModel('TransportOrnithopter');
    expect(new THREE.Box3().setFromObject(thopter).getSize(new THREE.Vector3()).x).toBeGreaterThan(20);
    expect(new THREE.Box3().setFromObject(buggy).getSize(new THREE.Vector3()).x).toBeLessThan(4);
    expect(niceScale(1800)).toEqual({ metres: 1000, label: '1 km' });
    expect(niceScale(84)).toEqual({ metres: 50, label: '50 m' });
    disposeVehicleModels([buggy, thopter]);
  });
  it('uses exact item meshes, preserves furniture rotations, and sizes exported shields', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async (url: string) => new Response(new Uint8Array(readFileSync(`src/assets/models/${url.split('/').at(-1)}`))),
      ),
    );
    const library = new BuildingLibrary();
    const built = await library.build({
      instances: [{ building_type: 'Atreides_Outpost_Foundation', x: 0, y: 0, z: 0 }],
      placeables: [
        { building_type: 'Atre_Chair_1_Placeable', x: 100, y: 200, z: 300, rx: 20, ry: 90, rz: 10 },
        { building_type: 'Choam_PentashieldSurfaceVertical_Placeable', x: 0, y: 0, z: 0 },
        { building_type: 'UnknownFurniture', x: 0, y: 0, z: 0 },
      ],
      pentashields: [{ placeable_id: 1, scale: [16, 2, 9] }],
    });
    expect(built.pieces).toBe(3);
    expect(built.total).toBe(4);
    expect(built.parts.find((part) => part.templateId === 'UnknownFurniture')).toEqual({
      templateId: 'UnknownFurniture',
      total: 1,
      rendered: 0,
    });
    expect(built.group.children).toHaveLength(3);
    // Compare each batch with the actual native geometry and actor transform, not GLB yaw offsets.
    const chairRow = catalog.rows.Atre_Chair_1_Placeable;
    const chair = built.group.children.find(
      (object) => object.name === `building-mesh-${chairRow.mesh}:${chairRow.group}`,
    ) as THREE.InstancedMesh;
    const matrix = new THREE.Matrix4();
    chair.getMatrixAt(0, matrix);
    const expected = toSceneMatrix(unrealMatrix([100, 200, 300], [20, 90, 10]));
    matrix.elements.forEach((value, index) => expect(value).toBeCloseTo(expected.elements[index], 5));
    const shieldRow = catalog.rows.Choam_PentashieldSurfaceVertical_Placeable;
    const shield = built.group.children.find(
      (object) => object.name === `building-mesh-${shieldRow.mesh}:${shieldRow.group}`,
    ) as THREE.InstancedMesh;
    shield.getMatrixAt(0, matrix);
    const size = shield.geometry.boundingBox!.clone().applyMatrix4(matrix).getSize(new THREE.Vector3());
    expect(size.x).toBeCloseTo(16, 4);
    expect(size.y).toBeCloseTo(9, 4);
    expect(size.z).toBeCloseTo(2, 4);
    for (const child of built.group.children) (child as THREE.InstancedMesh).dispose();
    library.dispose();
    expect(resolveBuildingRow({ Exact: { mesh: 0, group: 'A' } }, 'exact')?.mesh).toBe(0);
    expect(
      resolveBuildingRow({ Exact: { mesh: 0, group: 'A' }, EXACT: { mesh: 1, group: 'B' } }, 'exact'),
    ).toBeUndefined();
    expect(resolveBuildingRow(catalog.rows, 'Atreides_Outpost_Foundation_MadeUp')).toBeUndefined();
    expect(() => parseModelExport({ pentashields: [{ placeable_id: 0, scale: [-1, 2, 3] }] })).toThrow();
  });
});
