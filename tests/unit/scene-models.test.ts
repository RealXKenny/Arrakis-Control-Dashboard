import { afterEach, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { SceneModels } from '../../src/modules/map/terrain/sceneModels';
import { createSandwormModel } from '../../src/modules/map/terrain/sandwormModel';
import { disposeVehicleModels } from '../../src/modules/map/terrain/vehicleModels';

vi.mock('../../src/modules/map/terrain/buildingModels', () => ({
  BuildingLibrary: class {
    async build() {
      return { group: new THREE.Group(), origin: [0, 0, 0], pieces: 1, total: 1 };
    }
    dispose() {}
  },
}));
afterEach(() => vi.unstubAllGlobals());

it('builds a finite, bounded sandworm mesh with a partly buried tail', () => {
  const worm = createSandwormModel();
  try {
    const bounds = new THREE.Box3().setFromObject(worm);
    expect(bounds.getSize(new THREE.Vector3()).z).toBeGreaterThan(80);
    expect(bounds.min.y).toBeLessThan(0);
    expect(bounds.max.y).toBeGreaterThan(15);
    let triangles = 0;
    worm.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      triangles += (object.geometry.index?.count ?? object.geometry.getAttribute('position').count) / 3;
      for (const attribute of ['position', 'normal']) {
        expect([...object.geometry.getAttribute(attribute).array].every(Number.isFinite)).toBe(true);
      }
    });
    expect(triangles).toBeLessThan(15000);
    expect(worm.children.length).toBeLessThanOrEqual(8);
  } finally {
    disposeVehicleModels([worm]);
  }
});

it('reuses worm geometry while moving on terrain, turning, filtering, and zooming', () => {
  const fetcher = vi.fn();
  vi.stubGlobal('fetch', fetcher);
  const map = { minX: 0, minY: 0, maxX: 1000000, maxY: 1000000, width: 8192, height: 8192 };
  const surface = { n: 2, x0: 0, y0: 0, step: 1000000, minZ: 2000, maxZ: 2000, heights: new Uint16Array(4) };
  const models = new SceneModels(map, surface, new AbortController().signal, () => {});
  let marker = { id: 'worm', type: 'worm', x: 100000, y: 100000, z: -50000 };
  const camera = new THREE.PerspectiveCamera();
  camera.position.set(0, 20000, 20000);
  try {
    models.sync([marker]);
    models.updateView(camera);
    const worm = models.group.children[0];
    const mesh = worm.children[0] as THREE.Mesh;
    expect(new THREE.Vector3(0, 0, -1).applyQuaternion(worm.quaternion).z).toBeCloseTo(1);
    expect(models.state(marker, 0).visible).toBe(false);
    expect(worm.position.y).toBe(20);
    camera.position.copy(worm.position).add(new THREE.Vector3(0, 100, 100));
    models.updateView(camera);
    expect(models.state(marker, 0).prominent).toBe(true);
    const before = worm.position.clone();
    marker = { ...marker, x: marker.x + 1000 };
    expect(models.sync([marker])).toBe(true);
    expect(worm.position.x - before.x).toBe(10);
    expect(worm.rotation.y).toBeCloseTo(-Math.PI / 2);
    expect(new THREE.Vector3(0, 0, -1).applyQuaternion(worm.quaternion).x).toBeCloseTo(1);
    expect(models.group.children[0]).toBe(worm);
    expect((worm.children[0] as THREE.Mesh).geometry).toBe(mesh.geometry);
    expect(models.sync([marker])).toBe(false);
    models.sync([]);
    expect(models.state(marker, 0).visible).toBe(false);
    models.sync([marker]);
    models.updateView(camera);
    expect(models.state(marker, 0).visible).toBe(true);
    marker = { ...marker, x: -1000 };
    models.sync([marker]);
    models.updateView(camera);
    expect(models.state(marker, 0).visible).toBe(false);
    expect(fetcher).not.toHaveBeenCalled();
  } finally {
    models.dispose();
  }
});

it('reanchors stationary worms when the rendered terrain detail changes and hides terrain holes', () => {
  const map = { minX: 0, minY: 0, maxX: 1000000, maxY: 1000000, width: 8192, height: 8192 };
  const surface = { n: 2, x0: 0, y0: 0, step: 1000000, minZ: 0, maxZ: 1, heights: new Uint16Array(4) };
  let renderedHeight: number | null = 1000;
  const models = new SceneModels(
    map,
    surface,
    new AbortController().signal,
    () => {},
    () => renderedHeight,
  );
  const marker = { id: 'worm', type: 'worm', x: 100000, y: 100000 };
  const camera = new THREE.PerspectiveCamera();
  try {
    models.sync([marker]);
    const worm = models.group.children[0];
    camera.position.copy(worm.position).add(new THREE.Vector3(0, 100, 100));
    models.updateView(camera);
    expect(worm.position.y).toBe(10);
    renderedHeight = 2000;
    expect(models.sync([marker])).toBe(true);
    expect(worm.position.y).toBe(20);
    renderedHeight = null;
    models.sync([marker]);
    models.updateView(camera);
    expect(models.state(marker, 0).visible).toBe(false);
    renderedHeight = 1500;
    models.sync([marker]);
    models.updateView(camera);
    expect(models.state(marker, 0).visible).toBe(true);
    expect(worm.position.y).toBe(15);
  } finally {
    models.dispose();
  }
});

it('bounds worm model count and shares geometry across realtime worms', () => {
  const map = { minX: 0, minY: 0, maxX: 1000000, maxY: 1000000, width: 8192, height: 8192 };
  const surface = { n: 2, x0: 0, y0: 0, step: 1000000, minZ: 0, maxZ: 1, heights: new Uint16Array(4) };
  const models = new SceneModels(map, surface, new AbortController().signal, () => {});
  try {
    models.sync(Array.from({ length: 40 }, (_, id) => ({ id, type: 'worm', x: 100000, y: 100000 })));
    expect(models.group.children).toHaveLength(32);
    const meshes = models.group.children.map((group) => group.children[0] as THREE.Mesh);
    expect(meshes.every((mesh) => mesh.geometry === meshes[0].geometry && mesh.material === meshes[0].material)).toBe(
      true,
    );
  } finally {
    models.dispose();
  }
});

it('loads every active base from a distant camera, with two exports at a time, and retains models across zoom/filter changes', async () => {
  const pending: Array<() => void> = [];
  let active = 0,
    peak = 0;
  const fetcher = vi.fn(() => {
    active++;
    peak = Math.max(peak, active);
    return new Promise<Response>((resolve) =>
      pending.push(() => {
        active--;
        resolve(Response.json({ instances: [], placeables: [] }));
      }),
    );
  });
  vi.stubGlobal('fetch', fetcher);
  const map = { minX: 0, minY: 0, maxX: 1000000, maxY: 1000000, width: 8192, height: 8192 };
  const surface = { n: 2, x0: 0, y0: 0, step: 1000000, minZ: 0, maxZ: 1, heights: new Uint16Array(4) };
  const markers = Array.from({ length: 12 }, (_, i) => ({
    id: String(i),
    type: 'base',
    x: 100000 + i * 1000,
    y: 100000,
  }));
  const camera = new THREE.PerspectiveCamera();
  camera.position.set(0, 20000, 20000);
  const models = new SceneModels(map, surface, new AbortController().signal, () => {
    models.sync(markers);
    models.updateView(camera);
  });
  try {
    models.sync(markers);
    models.updateView(camera);
    expect(fetcher).toHaveBeenCalledTimes(2);
    for (let i = 0; i < markers.length; i++) {
      await vi.waitFor(() => expect(pending.length).toBeGreaterThan(0));
      pending.shift()!();
    }
    await vi.waitFor(() => expect(markers.every((marker, i) => models.state(marker, i).state === 'ready')).toBe(true));
    expect(peak).toBe(2);
    expect(fetcher).toHaveBeenCalledTimes(12);
    expect(models.group.children).toHaveLength(12);
    expect(models.group.children.every((object) => object.visible)).toBe(true);
    expect(models.state(markers[0], 0).prominent).toBe(false);
    camera.position.copy(models.group.children[0].position).add(new THREE.Vector3(0, 100, 100));
    models.updateView(camera);
    expect(models.state(markers[0], 0).prominent).toBe(true);
    models.sync(markers.slice(1));
    models.updateView(camera);
    expect(models.state(markers[0], 0).visible).toBe(false);
    camera.position.set(0, 20000, 20000);
    models.sync(markers);
    models.updateView(camera);
    expect(models.group.children.every((object) => object.visible)).toBe(true);
    expect(fetcher).toHaveBeenCalledTimes(12);
  } finally {
    models.dispose();
  }
});
