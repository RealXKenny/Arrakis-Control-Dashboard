import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

export type VisualBuildingPart = { geometry: THREE.BufferGeometry; material: THREE.Material | THREE.Material[] };

/** Generated packs are self-contained; never let a model request a remote buffer or image. */
export function validateVisualGlb(bytes: Uint8Array) {
  if (bytes.byteLength < 20) throw new Error('Invalid visual model');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const length = view.getUint32(12, true);
  if (
    view.getUint32(0, true) !== 0x46546c67 ||
    view.getUint32(4, true) !== 2 ||
    view.getUint32(8, true) !== bytes.byteLength ||
    view.getUint32(16, true) !== 0x4e4f534a ||
    length > bytes.byteLength - 20
  )
    throw new Error('Invalid visual model');
  const json = JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + length)));
  for (const resource of [...(json.buffers ?? []), ...(json.images ?? [])]) {
    if (resource.uri && !resource.uri.startsWith('data:')) throw new Error('External visual resource');
  }
  if ((json.extensionsRequired ?? []).includes('KHR_draco_mesh_compression'))
    throw new Error('Model requires an offline rebuild');
}

/** glTF uses right-handed metres; the existing base scene uses UE X/Z/Y with mirrored handedness. */
export async function loadVisualBuildingParts(bytes: Uint8Array): Promise<VisualBuildingPart[]> {
  validateVisualGlb(bytes);
  const manager = new THREE.LoadingManager();
  manager.setURLModifier((url) => {
    if (!url.startsWith('data:') && !url.startsWith('blob:')) throw new Error('External visual resource');
    return url;
  });
  const model = await new GLTFLoader(manager).parseAsync(new Uint8Array(bytes).buffer, '');
  model.scene.updateMatrixWorld(true);
  const parts: VisualBuildingPart[] = [];
  const originalGeometries = new Set<THREE.BufferGeometry>();
  const mirror = new THREE.Matrix4().makeScale(1, 1, -1);
  model.scene.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    const matrix = mirror.clone().multiply(object.matrixWorld);
    const geometry = object.geometry.clone().applyMatrix4(matrix);
    originalGeometries.add(object.geometry);
    if (matrix.determinant() < 0) {
      const source =
        geometry.index?.array ?? Array.from({ length: geometry.getAttribute('position').count }, (_, index) => index);
      const indices = new Uint32Array(source.length);
      for (let index = 0; index < source.length; index += 3)
        indices.set([source[index], source[index + 2], source[index + 1]], index);
      geometry.setIndex(new THREE.BufferAttribute(indices, 1));
    }
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    parts.push({ geometry, material: object.material });
  });
  for (const geometry of originalGeometries) geometry.dispose();
  if (!parts.length) throw new Error('No visual building geometry');
  return parts;
}
