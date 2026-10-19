import * as THREE from 'three';
import type { LayoutAssets, SharedAssets } from './terrainAssets';
import { dequantizePosition, octDecode } from './terrainGeometry';
import type { MapBounds } from './sceneGeometry';

// MapViewer3D uses Unreal centimetres (Z up); the scene uses metres (Y up).
export function createDesertDetails(shared: SharedAssets, layout: LayoutAssets, map: MapBounds) {
  const group = new THREE.Group();
  const { library, geometry: bytes } = shared;
  const pos = new Uint16Array(bytes.buffer, bytes.byteOffset, library.posBytes / 2);
  const normals = new Int8Array(bytes.buffer, bytes.byteOffset + library.posBytes, library.nrmBytes);
  const indices = new Uint16Array(
    bytes.buffer,
    bytes.byteOffset + library.posBytes + library.nrmBytes,
    library.idxBytes / 2,
  );
  const instances = new DataView(layout.instances.buffer, layout.instances.byteOffset, layout.instances.byteLength);
  const material = new THREE.MeshStandardMaterial({ color: 0xa08b70, roughness: 1, side: THREE.DoubleSide });
  const convert = new THREE.Matrix4().set(0.01, 0, 0, 0, 0, 0, 0.01, 0, 0, 0.01, 0, 0, 0, 0, 0, 1);
  const inverse = convert.clone().invert();
  const centerX = (map.minX + map.maxX) / 200,
    centerY = (map.minY + map.maxY) / 200;
  for (const draw of layout.meta.draws) {
    const mesh = library.meshes[draw.m];
    if (!mesh || draw.overlay || (mesh.ext[0] > 50000 && mesh.ext[1] > 50000)) continue;
    const p = new Float32Array(mesh.vn * 3),
      n = new Float32Array(mesh.vn * 3);
    for (let i = 0; i < mesh.vn; i++) {
      const [x, y, z] = dequantizePosition(pos, (mesh.vo + i) * 3, mesh.lo, mesh.ext);
      p.set([x / 100, z / 100, y / 100], i * 3);
      const [nx, ny, nz] = octDecode(
        Math.max(-1, normals[(mesh.vo + i) * 2] / 127),
        Math.max(-1, normals[(mesh.vo + i) * 2 + 1] / 127),
      );
      n.set([nx, nz, ny], i * 3);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(p, 3));
    geometry.setAttribute('normal', new THREE.BufferAttribute(n, 3));
    geometry.setIndex(new THREE.BufferAttribute(indices.slice(mesh.io, mesh.io + mesh.ic), 1));
    const batch = new THREE.InstancedMesh(geometry, material, draw.n);
    for (let i = 0; i < draw.n; i++) {
      const at = (draw.off + i) * 56;
      const v = Array.from({ length: 14 }, (_, k) => instances.getFloat32(at + k * 4, true));
      const m = new THREE.Matrix4().set(
        v[0],
        v[3],
        v[6],
        v[9],
        v[1],
        v[4],
        v[7],
        v[10],
        v[2],
        v[5],
        v[8],
        v[11] + v[13],
        0,
        0,
        0,
        1,
      );
      m.premultiply(convert).multiply(inverse);
      m.elements[12] -= centerX;
      m.elements[14] -= centerY;
      batch.setMatrixAt(i, m);
    }
    batch.computeBoundingSphere();
    batch.userData.sourceMatrices = batch.instanceMatrix.array.slice();
    batch.userData.radius = Math.hypot(...mesh.ext) / 200;
    batch.count = 0;
    group.add(batch);
  }
  return { group, material };
}

export function updateDesertDetails(group: THREE.Group, camera: THREE.PerspectiveCamera, height: number) {
  camera.updateMatrixWorld();
  const candidates: { batch: THREE.InstancedMesh; index: number; score: number }[] = [];
  const center = new THREE.Vector3();
  const frustum = new THREE.Frustum().setFromProjectionMatrix(
    new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse),
  );
  const sphere = new THREE.Sphere();
  const matrix = new THREE.Matrix4();
  for (const object of group.children) {
    const batch = object as THREE.InstancedMesh;
    const source = batch.userData.sourceMatrices as Float32Array;
    batch.count = 0;
    for (let i = 0; i < source.length / 16; i++) {
      matrix.fromArray(source, i * 16);
      center.copy(batch.geometry.boundingSphere!.center).applyMatrix4(matrix);
      sphere.set(center, batch.userData.radius);
      const score = (sphere.radius * height) / Math.max(1, camera.position.distanceTo(center));
      if (score >= 4 && frustum.intersectsSphere(sphere)) candidates.push({ batch, index: i, score });
    }
  }
  candidates.sort((a, b) => b.score - a.score);
  let triangles = 0;
  for (const { batch, index } of candidates) {
    const cost = batch.geometry.index!.count / 3;
    if (triangles + cost > 750000) continue;
    triangles += cost;
    matrix.fromArray(batch.userData.sourceMatrices, index * 16);
    batch.setMatrixAt(batch.count++, matrix);
  }
  for (const object of group.children) (object as THREE.InstancedMesh).instanceMatrix.needsUpdate = true;
}
