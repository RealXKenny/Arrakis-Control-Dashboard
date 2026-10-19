import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import * as THREE from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  BuildingLibrary,
  decodeBuildingMesh,
  parseModelExport,
  toSceneMatrix,
  unrealMatrix,
} from '../../src/modules/map/terrain/buildingModels';
import { createVehicleModel, disposeVehicleModels, vehicleKind } from '../../src/modules/map/terrain/vehicleModels';
import { niceScale } from '../../src/modules/map/terrain/mapPresentation';
const catalog = JSON.parse(gunzipSync(readFileSync('src/assets/models/catalog.json.gz')).toString());
afterEach(() => vi.unstubAllGlobals());
describe('map models', () => {
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
});
