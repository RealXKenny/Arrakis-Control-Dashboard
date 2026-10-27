import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  createWorldModel,
  worldModelKind,
  WORLD_MODEL_LIMIT,
  type WorldModelKind,
} from '../../src/modules/map/terrain/worldModels';
import { SceneModels } from '../../src/modules/map/terrain/sceneModels';
import { terrainPoint } from '../../src/modules/map/terrain/sceneGeometry';
import { disposeVehicleModels } from '../../src/modules/map/terrain/vehicleModels';

describe('procedural world models', () => {
  it.each<WorldModelKind>(['spice', 'spice-active', 'flour-sand', 'shipwreck'])(
    'builds finite, bounded %s geometry without remote assets',
    (kind) => {
      const model = createWorldModel(kind, 'large', (x) => x * 0.03);
      try {
        let triangles = 0;
        model.traverse((object) => {
          if (!(object instanceof THREE.Mesh)) return;
          triangles += (object.geometry.index?.count ?? object.geometry.getAttribute('position').count) / 3;
          for (const attribute of ['position', 'normal'])
            expect([...object.geometry.getAttribute(attribute).array].every(Number.isFinite)).toBe(true);
        });
        expect(triangles).toBeGreaterThan(100);
        expect(triangles).toBeLessThan(3000);
        expect(model.children.length).toBeLessThanOrEqual(3);
        expect(new THREE.Box3().setFromObject(model).getSize(new THREE.Vector3()).y).toBeGreaterThan(0.1);
      } finally {
        disposeVehicleModels([model]);
      }
    },
  );
  it('keeps possible/active fields separate and recognizes only supported map categories', () => {
    expect(worldModelKind({ type: 'spice' })).toBe('spice');
    expect(worldModelKind({ type: 'spice_active' })).toBe('spice-active');
    expect(worldModelKind({ type: 'poi', subtype: 'Ship_Wreck' })).toBe('shipwreck');
    expect(worldModelKind({ type: 'poi', subtype: 'cave' })).toBeNull();
  });
  it('never fills missing terrain with an invented patch', () => {
    const empty = createWorldModel('flour-sand', '', () => null);
    expect(empty.children).toHaveLength(0);
    const partial = createWorldModel('flour-sand', '', (x) => (x > 0 ? null : 0));
    try {
      const geometry = (partial.children[0] as THREE.Mesh).geometry;
      for (const index of geometry.index!.array)
        expect(geometry.getAttribute('position').getX(index)).toBeLessThanOrEqual(0);
    } finally {
      disposeVehicleModels([partial]);
    }
  });
});

it('bounds nearby resource models, reuses them between frames, and disposes on zoom/filter/detail changes', () => {
  const map = { minX: 0, minY: 0, maxX: 1000000, maxY: 1000000, width: 8192, height: 8192 };
  const surface = { n: 2, x0: 0, y0: 0, step: 1000000, minZ: 2000, maxZ: 2000, heights: new Uint16Array(4) };
  const markers = Array.from({ length: 80 }, (_, id) => ({ id, type: 'flour_sand', x: 100000 + id * 100, y: 100000 }));
  const camera = new THREE.PerspectiveCamera();
  camera.position.copy(terrainPoint(100000, 100000, 2000, map)).add(new THREE.Vector3(0, 100, 100));
  const models = new SceneModels(map, surface, new AbortController().signal, () => {});
  try {
    models.sync(markers);
    models.updateView(camera);
    expect(models.group.children).toHaveLength(WORLD_MODEL_LIMIT);
    const first = models.group.children[0];
    models.updateView(camera);
    expect(models.group.children[0]).toBe(first);
    models.refreshTerrain();
    expect(models.group.children).toHaveLength(0);
    models.updateView(camera);
    expect(models.group.children).toHaveLength(WORLD_MODEL_LIMIT);
    expect(models.group.children[0]).not.toBe(first);
    models.sync([]);
    models.updateView(camera);
    expect(models.group.children).toHaveLength(0);
    models.sync(markers);
    models.updateView(camera);
    camera.position.set(30000, 30000, 30000);
    models.updateView(camera);
    expect(models.group.children).toHaveLength(0);
  } finally {
    models.dispose();
  }
});

it('picks the original flour-sand marker from its terrain-aligned 3D surface', () => {
  const map = { minX: 0, minY: 0, maxX: 1000000, maxY: 1000000, width: 8192, height: 8192 };
  const surface = { n: 2, x0: 0, y0: 0, step: 1000000, minZ: 2000, maxZ: 2000, heights: new Uint16Array(4) };
  const marker = { id: 'flour', type: 'flour_sand', x: 100000, y: 100000 };
  const models = new SceneModels(map, surface, new AbortController().signal, () => {});
  const position = terrainPoint(marker.x, marker.y, 2000, map);
  const camera = new THREE.PerspectiveCamera();
  camera.position.copy(position).add(new THREE.Vector3(0, 100, 100));
  try {
    models.sync([marker]);
    models.updateView(camera);
    models.group.updateMatrixWorld(true);
    const ray = new THREE.Raycaster(position.clone().add(new THREE.Vector3(0, 100, 0)), new THREE.Vector3(0, -1, 0));
    expect(models.pick(ray)).toEqual(marker);
    expect(models.state(marker, 0).kind).toBe('flour-sand');
  } finally {
    models.dispose();
  }
});
