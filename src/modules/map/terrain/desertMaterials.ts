import * as THREE from 'three';
import type { SharedAssets } from './terrainAssets';
import type { MapBounds } from './sceneGeometry';

export function createDesertTextures(shared: SharedAssets) {
  const texture = (bytes: Uint8Array, size: number) => {
    const image = new THREE.DataTexture(bytes, size, size, THREE.RGBAFormat);
    image.wrapS = image.wrapT = THREE.RepeatWrapping;
    image.minFilter = THREE.LinearMipmapLinearFilter;
    image.magFilter = THREE.LinearFilter;
    image.generateMipmaps = true;
    image.needsUpdate = true;
    return image;
  };
  return {
    detail1: texture(shared.detail1, 1024),
    detail2: texture(shared.detail2, 1024),
    breakup: texture(shared.breakup, 128),
  };
}
type DesertTextures = ReturnType<typeof createDesertTextures>;

// Share the old terrain's world-space material with the orbitable scene.
export function applyDesertMaterial(
  material: THREE.MeshStandardMaterial,
  textures: DesertTextures,
  map: MapBounds,
  detail: { value: number },
  patches = false,
) {
  const previous = material.onBeforeCompile;
  material.defines = { ...material.defines, DESERT_SAND: 1 };
  if (patches) material.alphaHash = true;
  material.onBeforeCompile = (shader, renderer) => {
    previous.call(material, shader, renderer);
    Object.assign(shader.uniforms, {
      uDesertD1: { value: textures.detail1 },
      uDesertD2: { value: textures.detail2 },
      uDesertBreakup: { value: textures.breakup },
      uDesertDetail: detail,
      uDesertCenter: { value: new THREE.Vector2((map.minX + map.maxX) / 200, (map.minY + map.maxY) / 200) },
      uDesertBounds: { value: new THREE.Vector4(map.minX / 100, map.minY / 100, map.maxX / 100, map.maxY / 100) },
    });
    const varying =
      'varying vec3 vDesertWorld;\n' + (patches ? 'varying vec3 vDesertStyle;\nvarying float vDesertEdge;\n' : '');
    shader.vertexShader =
      varying + (patches ? 'attribute vec3 terrainStyle;\nattribute float terrainEdge;\n' : '') + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace(
      '#include <worldpos_vertex>',
      `#include <worldpos_vertex>
      vec4 desertPosition = vec4(transformed, 1.0);
      #ifdef USE_INSTANCING
        desertPosition = instanceMatrix * desertPosition;
      #endif
      vDesertWorld = (modelMatrix * desertPosition).xyz;
      ${patches ? 'vDesertStyle = terrainStyle; vDesertEdge = terrainEdge * terrainStyle.z;' : ''}
    `,
    );
    shader.fragmentShader =
      varying +
      `
      uniform sampler2D uDesertD1, uDesertD2, uDesertBreakup;
      uniform float uDesertDetail;
      uniform vec2 uDesertCenter;
      uniform vec4 uDesertBounds;
    ` +
      shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <normal_fragment_maps>',
      `#include <normal_fragment_maps>
      vec2 desertXY = vDesertWorld.xz + uDesertCenter;
      vec2 sandUV = vec2(desertXY.x, -desertXY.y) / 647.62;
      vec2 sandA = texture2D(uDesertD1, sandUV).xy * 2.0 - 1.0;
      vec2 sandB = texture2D(uDesertD2, mat2(0.8,-0.6,0.6,0.8) * sandUV / 1.37 + vec2(0.37,0.11)).xy * 2.0 - 1.0;
      vec3 desertGradient = mat3(viewMatrix) * vec3((sandA.x + sandB.x), 0.0, -(sandA.y + sandB.y));
      float sandMask = ${patches ? 'step(0.5, vDesertStyle.x) * (1.0 - step(1.5, vDesertStyle.x))' : '1.0'};
      normal = normalize(normal + (desertGradient - normal * dot(normal, desertGradient)) * 0.6053 * uDesertDetail * sandMask);
    `,
    );
    if (patches)
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <color_fragment>',
        `#include <color_fragment>
      vec2 worldXY = vDesertWorld.xz + uDesertCenter;
      if (worldXY.x < uDesertBounds.x || worldXY.y < uDesertBounds.y || worldXY.x > uDesertBounds.z || worldXY.y > uDesertBounds.w) discard;
      float kind = vDesertStyle.x;
      diffuseColor.rgb = kind < 0.5 ? vec3(0.30, 0.20, 0.08) : kind < 1.5 ? vec3(0.62,0.45,0.27) : kind < 2.5 ? vec3(0.56,0.442,0.286) : vec3(0.25,0.39,0.31);
      if (kind > 1.5 && kind < 2.5) {
        float breakup = (texture2D(uDesertBreakup, vec2(worldXY.x, -worldXY.y) / 300.0).r - 0.5) * 8.4;
        float clipHeight = vDesertStyle.y + 7.0 + breakup;
        diffuseColor.a *= smoothstep(0.0, 70.0, vDesertEdge) * smoothstep(clipHeight - 4.0, clipHeight + 4.0, vDesertWorld.y);
      }
    `,
      );
  };
  material.customProgramCacheKey = () => (patches ? 'desert-patches-v1' : 'desert-sand-v1');
  material.needsUpdate = true;
}
