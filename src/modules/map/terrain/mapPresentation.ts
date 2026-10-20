import * as THREE from 'three';
import type { HeightSurface } from './heightSurface';
export function colorSurface(geometry: THREE.BufferGeometry, surface: HeightSurface) {
  const position = geometry.getAttribute('position'),
    normal = geometry.getAttribute('normal');
  const colors = new Float32Array(position.count * 3),
    sand = new THREE.Color('#cfa96e'),
    high = new THREE.Color('#ede0b5'),
    rock = new THREE.Color('#938577');
  for (let i = 0; i < position.count; i++) {
    const elevation = THREE.MathUtils.clamp(
      (position.getY(i) * 100 - surface.minZ) / Math.max(1, surface.maxZ - surface.minZ),
      0,
      1,
    );
    const slope = 1 - Math.max(0, normal.getY(i));
    const color = sand
      .clone()
      .lerp(high, elevation * 0.65)
      .lerp(rock, THREE.MathUtils.smoothstep(slope, 0.12, 0.7));
    color.toArray(colors, i * 3);
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
}
export function createMapMaterial() {
  const uniforms = { contours: { value: 0 }, relief: { value: 1 } };
  const material = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.97,
    metalness: 0,
    side: THREE.DoubleSide,
    vertexColors: true,
  });
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uContours = uniforms.contours;
    shader.uniforms.uRelief = uniforms.relief;
    shader.vertexShader = 'varying vec3 vCartographicWorld;\n' + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace(
      '#include <worldpos_vertex>',
      '#include <worldpos_vertex>\nvCartographicWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;',
    );
    shader.fragmentShader =
      'varying vec3 vCartographicWorld;\nuniform float uContours;\nuniform float uRelief;\n' + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <color_fragment>',
      `#include <color_fragment>
      float grain = fract(sin(dot(floor(vCartographicWorld.xz * 2.0),vec2(12.9898,78.233)))*43758.5453);
      diffuseColor.rgb *= 0.98 + grain * 0.04 * uRelief;
      float h = vCartographicWorld.y / 25.0;
      float line = abs(fract(h - 0.5) - 0.5) / max(fwidth(h), 0.0001);
      float contour = 1.0 - smoothstep(0.3, 1.3, line);
      diffuseColor.rgb *= 1.0 - contour * 0.22 * uContours;
    `,
    );
  };
  return { material, uniforms };
}
export function niceScale(metres: number) {
  if (!(metres > 0)) return { metres: 1, label: '1 m' };
  const magnitude = 10 ** Math.floor(Math.log10(metres));
  const value = [5, 2, 1].find((v) => v * magnitude <= metres) ?? 1;
  const distance = value * magnitude;
  return { metres: distance, label: distance >= 1000 ? `${distance / 1000} km` : `${distance} m` };
}
