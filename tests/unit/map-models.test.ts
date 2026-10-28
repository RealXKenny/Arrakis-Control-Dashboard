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
  visualBabylonMatrix,
  visualBabylonYaw,
  visualFallbackKind,
  visualModelTemplate,
  visualUnrealYaw,
} from '../../src/modules/map/terrain/buildingModels';
import { visualBuildingImportBasis } from '../../src/modules/map/terrain/visualBuildingMeshes';
import {
  babylonToUEPosition,
  toViewerStoredYaw,
  uePitchToBabylonPitch,
  ueRollToBabylonRoll,
  ueToBabylonPosition,
  ueYawToBabylonYaw,
} from '../../src/modules/map/terrain/ueTransform';
import { createVehicleModel, disposeVehicleModels, vehicleKind } from '../../src/modules/map/terrain/vehicleModels';
import { niceScale } from '../../src/modules/map/terrain/mapPresentation';
const catalog = JSON.parse(gunzipSync(readFileSync('src/assets/models/catalog.json.gz')).toString());
const visualCatalog = JSON.parse(gunzipSync(readFileSync('src/assets/models/visual-catalog.json.gz')).toString());
afterEach(() => vi.unstubAllGlobals());
describe('map models', () => {
  it('ports the reference engine UE coordinate and rotation rules unchanged', () => {
    const uePosition = { x: 10, y: 20, z: 30 };
    expect(ueToBabylonPosition(uePosition)).toEqual({ x: 20, y: 30, z: 10 });
    expect(babylonToUEPosition({ x: 20, y: 30, z: 10 })).toEqual(uePosition);
    expect(toViewerStoredYaw('Atreides_Outpost_Floor_Wedge', 340)).toBe(340);
    expect(ueYawToBabylonYaw('Atreides_Outpost_Ramp_Corner_Inward', -260)).toBe(-80);
    expect(ueYawToBabylonYaw('Atreides_Outpost_Wall_Triangle_Bottom_Left', 30)).toBe(120);
    expect(ueYawToBabylonYaw('Atreides_Outpost_Railing', 30)).toBe(120);
    expect(ueYawToBabylonYaw('Atreides_Outpost_Floor_Wedge', 30)).toBe(-60);
    expect(uePitchToBabylonPitch(45)).toBe(-45);
    expect(ueRollToBabylonRoll(45)).toBe(45);
  });
  it('keeps a wall normal aligned with its rotated foundation edge', () => {
    for (const yaw of [0, 10, 90, 100, 180, 270]) {
      const normal = new THREE.Vector3(0, 0, 1).transformDirection(toSceneMatrix(unrealMatrix([0, 0, 0], [0, yaw, 0])));
      expect(normal.x).toBeCloseTo(-Math.sin((yaw * Math.PI) / 180));
      expect(normal.z).toBeCloseTo(Math.cos((yaw * Math.PI) / 180));
    }
  });
  it('applies only Babylon GLB root correction for actors already using Babylon axes', () => {
    const basis = visualBuildingImportBasis();
    expect(new THREE.Vector3(1, 0, 0).applyMatrix4(basis).distanceTo(new THREE.Vector3(-1, 0, 0))).toBeLessThan(1e-10);
    expect(new THREE.Vector3(0, 1, 0).applyMatrix4(basis).distanceTo(new THREE.Vector3(0, 1, 0))).toBeLessThan(1e-10);
    expect(new THREE.Vector3(0, 0, 1).applyMatrix4(basis).distanceTo(new THREE.Vector3(0, 0, 1))).toBeLessThan(1e-10);
  });
  it('converts preview rotations using the reference engine template rules', () => {
    expect(visualBabylonYaw('Atreides_Outpost_Wall_01', 0)).toBe(-90);
    expect(visualBabylonYaw('Atreides_Outpost_Wall_Inclined_Wide_Left', 0)).toBe(-127.5);
    expect(visualBabylonYaw('Atreides_Outpost_Wall_Inclined_Wide_Right', 0)).toBe(-52.5);
    expect(visualBabylonYaw('Atreides_Outpost_Stairs', 0)).toBe(-90);
    expect(visualBabylonYaw('Atreides_Outpost_Ramp_Corner_Inward', 0)).toBe(180);
    expect(visualBabylonYaw('Atreides_Outpost_Floor_Wedge', 0)).toBe(-90);
    expect(visualBabylonYaw('Atreides_Outpost_Railing', 90)).toBe(180);
    expect(visualUnrealYaw('Atreides_Outpost_Wall_01', 0)).toBe(90);
    expect(visualUnrealYaw('Atreides_Outpost_Wall_Inclined_Wide_Left', 0)).toBe(127.5);
    expect(visualUnrealYaw('Atreides_Outpost_Wall_Inclined_Wide_Right', 0)).toBe(52.5);
    expect(visualUnrealYaw('Atreides_Outpost_Stairs', 0)).toBe(90);
    expect(visualUnrealYaw('Atreides_Outpost_Stairs_Half', 0)).toBe(90);
    expect(visualUnrealYaw('Atreides_Outpost_Ramp', 0)).toBe(90);
    expect(visualUnrealYaw('Atreides_Outpost_Ramp_Half', 0)).toBe(90);
    expect(visualUnrealYaw('Atreides_Outpost_Roof_Half', 0)).toBe(90);
    expect(visualUnrealYaw('Atreides_Outpost_Gate_Big', 0)).toBe(90);
    expect(visualUnrealYaw('Atreides_Outpost_Floor_Wedge', 0)).toBe(90);
    expect(visualUnrealYaw('Atreides_Outpost_Ramp_Corner_Inward', 0)).toBe(-180);
    expect(visualUnrealYaw('Atreides_Outpost_Floor_Round_Corner', 0)).toBe(-180);
    expect(visualUnrealYaw('Atreides_Outpost_Railing_Round_Corner', 0)).toBe(-180);
    expect(visualUnrealYaw('Atreides_Outpost_Roof_Cover_Bottom_Half_Left', 0)).toBe(-90);
    expect(visualUnrealYaw('Atreides_Outpost_Wall_Round_Corner_01', 0)).toBe(-180);
    expect(visualUnrealYaw('Atreides_Outpost_Railing', 90)).toBe(-180);
    expect(visualUnrealYaw('Atreides_Outpost_Wall_Triangle_Bottom_Right', 30)).toBe(-120);
    expect(visualModelTemplate('Atreides_Outpost_Ramp_Edge_Wide_Left')).toBe('Atreides_Outpost_Ramp_Edge_Wide_Right');
    expect(visualModelTemplate('Atreides_Outpost_Ramp_Edge_Wide_Right')).toBe('Atreides_Outpost_Ramp_Edge_Wide_Left');
    expect(visualModelTemplate('Atreides_Outpost_Floor_Triangle_Wide_Left')).toBe(
      'Atreides_Outpost_Floor_Triangle_Wide_Right',
    );
    expect(visualModelTemplate('Atreides_Outpost_Floor_Triangle_Wide_Right')).toBe(
      'Atreides_Outpost_Floor_Triangle_Wide_Left',
    );
    expect(visualModelTemplate('Atreides_Outpost_Stairs')).toBe('Atreides_Outpost_Stairs');
  });
  it('matches the reference Babylon yaw after scene-axis conversion at cardinal and diagonal angles', () => {
    const basis = visualBuildingImportBasis();
    const templates = [
      'Atreides_Outpost_Floor_Wedge',
      'Atreides_Outpost_Ramp_Corner_Inward',
      'Atreides_Outpost_Railing_Round_Corner',
      'Atreides_Outpost_Wall_Triangle_Bottom_Right',
      'Atreides_Outpost_Wall_Inclined_Wide_Left',
    ];
    for (const template of templates) {
      for (const yaw of [-350, -260, -170, 0, 30, 90, 180, 280, 340]) {
        const expectedBabylonYaw = -visualUnrealYaw(template, yaw);
        const expected = new THREE.Matrix4()
          .makeRotationY(THREE.MathUtils.degToRad(expectedBabylonYaw))
          .multiply(basis);
        const actual = toSceneMatrix(unrealMatrix([0, 0, 0], [0, visualUnrealYaw(template, yaw), 0])).multiply(basis);
        actual.elements.forEach((value, index) => expect(value).toBeCloseTo(expected.elements[index], 6));
      }
    }
  });
  it('places visual base pieces with the reference engine position and yaw transform', () => {
    for (const template of [
      'Atreides_Outpost_Floor_Wedge',
      'Atreides_Outpost_Ramp_Corner_Inward',
      'Atreides_Outpost_Railing_Round_Corner',
      'Atreides_Outpost_Wall_Triangle_Bottom_Right',
      'Atreides_Outpost_Wall_Inclined_Wide_Left',
    ]) {
      for (const yaw of [-350, -260, -170, 0, 30, 90, 180, 280, 340]) {
        const expected = new THREE.Matrix4()
          .makeRotationY(THREE.MathUtils.degToRad(visualBabylonYaw(template, yaw)))
          .setPosition(0.2, 0.3, 0.1);
        const actual = visualBabylonMatrix([10, 20, 30], template, yaw);
        actual.elements.forEach((value, index) => expect(value).toBeCloseTo(expected.elements[index], 6));
      }
    }
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
