import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import * as THREE from 'three';
import { createDesertDetails, updateDesertDetails } from '../../src/modules/map/terrain/desertDetails';
import type { SharedAssets, LayoutAssets } from '../../src/modules/map/terrain/terrainAssets';

const unpack = (name: string) => new Uint8Array(gunzipSync(readFileSync(`src/assets/terrain/${name}.gz`)));
const shared: SharedAssets = {
  library: JSON.parse(new TextDecoder().decode(unpack('meshes.json'))),
  geometry: unpack('meshes.bin'),
  detail1: unpack('tex/det1.rgba'),
  detail2: unpack('tex/det2.rgba'),
  breakup: unpack('tex/brk.rgba'),
};
const layout: LayoutAssets = {
  meta: JSON.parse(new TextDecoder().decode(unpack('layout-6.json'))),
  instances: unpack('layout-6.bin'),
  heightField: unpack('layout-6.hf'),
};
const map = {
  minX: layout.meta.cx - layout.meta.half,
  maxX: layout.meta.cx + layout.meta.half,
  minY: layout.meta.cy - layout.meta.half,
  maxY: layout.meta.cy + layout.meta.half,
  width: 8192,
  height: 8192,
};

describe('combined Deep Desert terrain', () => {
  it('retains old patches, uses their clip height without lifting them, and keeps LOD attributes aligned', () => {
    const built = createDesertDetails(shared, layout, map);
    const patch = built.group.children.find((child) => child.userData.overlay) as THREE.InstancedMesh;
    expect(patch).toBeDefined();
    expect(built.group.children.filter((child) => child.userData.overlay)).toHaveLength(
      layout.meta.draws.filter((draw) => draw.overlay).length,
    );
    const draw = layout.meta.draws.find((draw) => draw.overlay)!;
    const source = new DataView(layout.instances.buffer);
    const base = draw.off * 56;
    expect(patch.userData.sourceMatrices[13]).toBeCloseTo(source.getFloat32(base + 44, true) / 100, 3);
    expect(patch.userData.sourceStyles[0]).toBe(2);
    expect(patch.userData.sourceStyles[1]).toBeCloseTo(source.getFloat32(base + 52, true) / 100, 4);
    const matrix = new THREE.Matrix4().fromArray(patch.userData.sourceMatrices, 0);
    const target = patch.geometry.boundingSphere!.center.clone().applyMatrix4(matrix);
    const camera = new THREE.PerspectiveCamera(60, 1, 1, 100000);
    camera.position.copy(target).add(new THREE.Vector3(0, 500, 800));
    camera.lookAt(target);
    updateDesertDetails(built.group, camera, 800, 250000, 0);
    let triangles = 0;
    let outward = 0,
      inward = 0;
    for (const object of built.group.children) {
      const batch = object as THREE.InstancedMesh;
      const positions = batch.geometry.getAttribute('position'),
        normals = batch.geometry.getAttribute('normal'),
        indices = batch.geometry.index!;
      for (let i = 0; i < Math.min(indices.count, 300); i += 3) {
        const a = new THREE.Vector3().fromBufferAttribute(positions, indices.getX(i));
        const b = new THREE.Vector3().fromBufferAttribute(positions, indices.getX(i + 1));
        const c = new THREE.Vector3().fromBufferAttribute(positions, indices.getX(i + 2));
        const normal = new THREE.Vector3().fromBufferAttribute(normals, indices.getX(i));
        const alignment = b.sub(a).cross(c.sub(a)).dot(normal);
        if (alignment > 0) outward++;
        else if (alignment < 0) inward++;
      }
      triangles += (batch.count * batch.geometry.index!.count) / 3;
      const style = batch.geometry.getAttribute('terrainStyle');
      for (let i = 0; i < batch.count; i++) {
        batch.getMatrixAt(i, matrix);
        const original = (batch.userData.sourceMatrices as Float32Array).findIndex(
          (_, index, values) => index % 16 === 0 && matrix.elements.every((value, k) => value === values[index + k]),
        );
        expect(original).toBeGreaterThanOrEqual(0);
        expect(style.getY(i)).toBe(batch.userData.sourceStyles[(original / 16) * 3 + 1]);
      }
      batch.geometry.dispose();
      batch.dispose();
    }
    expect(triangles).toBeGreaterThan(0);
    expect(triangles).toBeLessThanOrEqual(250000);
    expect(outward / (outward + inward)).toBeGreaterThan(0.95);
    built.dispose();
  });
});
