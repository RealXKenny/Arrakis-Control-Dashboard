import { afterEach, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { SceneModels } from '../../src/modules/map/terrain/sceneModels';

vi.mock('../../src/modules/map/terrain/buildingModels', () => ({
  BuildingLibrary: class {
    async build() {
      return { group: new THREE.Group(), origin: [0, 0, 0], pieces: 1, total: 1 };
    }
    dispose() {}
  },
}));
afterEach(() => vi.unstubAllGlobals());

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
