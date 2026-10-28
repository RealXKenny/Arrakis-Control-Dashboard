import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

export type VisualBuildingPart = { geometry: THREE.BufferGeometry; material: THREE.Material | THREE.Material[] };

/** Match Babylon's GLB root correction; actor placement already uses Babylon axes. */
export function visualBuildingImportBasis() {
  const mirrorRightHandedZ = new THREE.Matrix4().makeScale(1, 1, -1);
  const babylonRootRotation = new THREE.Matrix4().makeRotationY(Math.PI);
  return babylonRootRotation.multiply(mirrorRightHandedZ);
}

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
  // Atlas and index images are embedded by the offline importer. Never fetch external assets.
  const configured = new Set<THREE.Material>();
  const pending: Promise<void>[] = [];
  model.scene.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      if (configured.has(material) || !(material instanceof THREE.MeshStandardMaterial)) continue;
      configured.add(material);
      const data = material.userData.arrakisLayers as
        { atlas?: unknown; index?: unknown; normals?: unknown; count?: unknown } | undefined;
      if (
        !data ||
        typeof data.atlas !== 'string' ||
        typeof data.index !== 'string' ||
        !/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(data.atlas) ||
        data.atlas.length > 2_000_000 ||
        !/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(data.index) ||
        (data.normals !== undefined &&
          (typeof data.normals !== 'string' ||
            !/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(data.normals) ||
            data.normals.length > 2_000_000)) ||
        data.index.length > 100_000 ||
        !object.geometry.getAttribute('uv1') ||
        !object.geometry.getAttribute('uv')
      )
        continue;
      const loader = new THREE.TextureLoader(manager);
      pending.push(
        Promise.all([
          loader.loadAsync(data.atlas),
          loader.loadAsync(data.index),
          typeof data.normals === 'string' ? loader.loadAsync(data.normals) : Promise.resolve(null),
        ]).then(([atlas, index, normalAtlas]) => {
          atlas.flipY = false;
          atlas.colorSpace = THREE.SRGBColorSpace;
          index.flipY = false;
          index.colorSpace = THREE.NoColorSpace;
          index.minFilter = THREE.NearestFilter;
          index.magFilter = THREE.NearestFilter;
          index.generateMipmaps = false;
          const layerCount = typeof data.count === 'number' && data.count >= 2 && data.count <= 12 ? data.count : 12;
          if (normalAtlas) {
            normalAtlas.flipY = false;
            normalAtlas.colorSpace = THREE.NoColorSpace;
          }
          material.userData.arrakisTextures = [
            atlas,
            index,
            ...(normalAtlas ? [normalAtlas] : []),
            ...(material.map ? [material.map] : []),
            ...(material.normalMap ? [material.normalMap] : []),
          ];
          if (normalAtlas) material.normalMap = normalAtlas;
          // Ensure the standard material enables UV sampling even when its original layer is missing.
          material.map = atlas;
          delete material.userData.arrakisLayers;
          material.defines = { ...material.defines, USE_UV1: '' };
          material.onBeforeCompile = (shader) => {
            shader.uniforms.arrakisAtlas = { value: atlas };
            shader.uniforms.arrakisIndex = { value: index };
            shader.uniforms.arrakisLayerCount = { value: layerCount };
            if (normalAtlas) shader.uniforms.arrakisNormalAtlas = { value: normalAtlas };
            shader.vertexShader = 'varying vec2 vArrakisIndexUv;\n' + shader.vertexShader;
            shader.vertexShader = shader.vertexShader.replace(
              '#include <uv_vertex>',
              '#include <uv_vertex>\nvArrakisIndexUv = uv1;',
            );
            shader.fragmentShader =
              (normalAtlas ? 'uniform sampler2D arrakisNormalAtlas;\n' : '') +
              'uniform sampler2D arrakisAtlas;\nuniform sampler2D arrakisIndex;\nuniform float arrakisLayerCount;\nvarying vec2 vArrakisIndexUv;\n' +
              shader.fragmentShader;
            shader.fragmentShader = shader.fragmentShader.replace(
              '#include <map_fragment>',
              'float layer = clamp(floor(texture2D(arrakisIndex, vArrakisIndexUv).r * 255.0 + 0.5), 0.0, arrakisLayerCount - 1.0);\n' +
                'vec2 tile = vec2(mod(layer, 4.0), floor(layer / 4.0));\n' +
                'vec2 atlasUv = (tile + fract(vMapUv)) / vec2(4.0, 3.0);\n' +
                'diffuseColor *= texture2D(arrakisAtlas, atlasUv);',
            );
            if (normalAtlas)
              shader.fragmentShader = shader.fragmentShader.replace(
                '#include <normal_fragment_maps>',
                THREE.ShaderChunk.normal_fragment_maps.replaceAll(
                  'texture2D( normalMap, vNormalMapUv )',
                  'texture2D( arrakisNormalAtlas, atlasUv )',
                ),
              );
          };
          material.customProgramCacheKey = () =>
            normalAtlas ? 'arrakis-layers-color-normal-v2' : 'arrakis-layers-color-v2';
          material.needsUpdate = true;
        }),
      );
    }
  });
  await Promise.all(pending);
  model.scene.updateMatrixWorld(true);
  const parts: VisualBuildingPart[] = [];
  const originalGeometries = new Set<THREE.BufferGeometry>();
  // Match Babylon's __root__ (180° around Y and Z reflection). Actor transforms
  // map UE [X,Y,Z] directly into Babylon [Y,Z,X], so do not remap the mesh again.
  const importBasis = visualBuildingImportBasis();
  model.scene.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    const matrix = importBasis.clone().multiply(object.matrixWorld);
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
