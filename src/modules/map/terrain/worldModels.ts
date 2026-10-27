import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export type WorldModelKind = 'spice' | 'spice-active' | 'flour-sand' | 'shipwreck';
export const WORLD_MODEL_LIMIT = 40;
export function worldModelKind(marker: Record<string, unknown>): WorldModelKind | null {
  const type = String(marker.type ?? '').toLowerCase();
  const subtype = String(marker.subtype ?? '')
    .toLowerCase()
    .replace(/[^a-z]/g, '');
  if (type === 'spice' || type === 'spice_active') return type === 'spice' ? 'spice' : 'spice-active';
  if (type === 'flour_sand') return 'flour-sand';
  return type === 'shipwreck' || (type === 'poi' && subtype.includes('shipwreck')) ? 'shipwreck' : null;
}

/** Original low-poly map representations in metres; no remote assets or guessed deposit data. */
export function createWorldModel(
  kind: WorldModelKind,
  subtype: unknown,
  groundAt: (x: number, z: number) => number | null,
) {
  const group = new THREE.Group();
  group.name = kind;
  group.userData.worldModelKind = kind;
  const material = (color: number, metalness = 0) =>
    new THREE.MeshStandardMaterial({ color, roughness: 0.9, metalness, side: THREE.DoubleSide });
  const addParts = (parts: THREE.BufferGeometry[], mat: THREE.Material) => {
    if (!parts.length) {
      mat.dispose();
      return;
    }
    const merged = mergeGeometries(parts);
    parts.forEach((part) => part.dispose());
    if (merged) group.add(new THREE.Mesh(merged, mat));
    else mat.dispose();
  };
  // Each fragment sits on measured terrain; holes do not gain fabricated geometry.
  const place = (parts: THREE.BufferGeometry[], geometry: THREE.BufferGeometry, x: number, z: number, lift = 0) => {
    const h = groundAt(x, z);
    if (h === null) {
      geometry.dispose();
      return;
    }
    parts.push(geometry.translate(x, h + lift, z));
  };
  if (kind === 'shipwreck') {
    const hull: THREE.BufferGeometry[] = [],
      ribs: THREE.BufferGeometry[] = [],
      dark: THREE.BufferGeometry[] = [];
    place(hull, new THREE.CylinderGeometry(8, 6, 44, 10, 1, true, 0.25, Math.PI * 1.35).rotateX(Math.PI / 2), 0, 0, 4);
    for (let i = -2; i <= 2; i++)
      place(ribs, new THREE.TorusGeometry(7, 0.35, 3, 12, Math.PI * 1.35).rotateZ(0.25), 0, i * 8, 4);
    place(hull, new THREE.BoxGeometry(32, 0.6, 7).rotateY(0.25).rotateZ(-0.08), -17, 6, 1);
    place(hull, new THREE.BoxGeometry(20, 0.5, 5).rotateY(-0.55).rotateZ(0.16), 14, 12, 1);
    place(dark, new THREE.CylinderGeometry(3.5, 4, 8, 8, 1, true).rotateX(Math.PI / 2), 0, 25, 4);
    place(dark, new THREE.SphereGeometry(5, 8, 5).scale(1, 0.5, 1.5), 0, -20, 3);
    for (let i = 0; i < 8; i++) {
      const a = i * 2.399963;
      place(
        hull,
        new THREE.BoxGeometry(2 + (i % 3), 0.35, 3).rotateY(a),
        Math.cos(a) * (20 + i * 2),
        Math.sin(a) * (22 + i),
        0.4,
      );
    }
    addParts(hull, material(0x766354, 0.35));
    addParts(ribs, material(0xb0a796, 0.45));
    addParts(dark, material(0x303436, 0.5));
    return group;
  }
  const flour = kind === 'flour-sand';
  const size = String(subtype ?? '').toLowerCase();
  const radius = flour ? 38 : size.includes('large') ? 110 : size.includes('medium') ? 70 : 42;
  const segments = 32,
    rings = 8;
  const colors: number[] = [];
  const centerColor = new THREE.Color(flour ? 0xe2d9bc : kind === 'spice-active' ? 0x8d5131 : 0x9e7853);
  const edgeColor = new THREE.Color(0xcfa96e);
  const positions: number[] = [],
    indices: number[] = [],
    valid: boolean[] = [];
  for (let ring = 0; ring <= rings; ring++)
    for (let segment = 0; segment <= segments; segment++) {
      const angle = (segment / segments) * Math.PI * 2;
      const fraction = ring / rings;
      const r = radius * fraction * (1 + 0.07 * Math.sin(angle * 5));
      const x = Math.cos(angle) * r,
        z = Math.sin(angle) * r * 0.8;
      const ground = groundAt(x, z);
      const mound = flour
        ? 4.5 * (1 - fraction * fraction) + 0.3 * Math.sin(x * 0.4 + z * 0.2)
        : 0.25 + (1 - fraction) * 0.45;
      positions.push(x, (ground ?? 0) + mound, z);
      centerColor
        .clone()
        .multiplyScalar(0.96 + 0.04 * Math.sin(x * 0.4 + z * 0.2))
        .lerp(edgeColor, THREE.MathUtils.smoothstep(fraction, 0.5, 1))
        .toArray(colors, colors.length);
      valid.push(ground !== null);
    }
  for (let ring = 0; ring < rings; ring++)
    for (let segment = 0; segment < segments; segment++) {
      const a = ring * (segments + 1) + segment,
        b = a + segments + 1;
      for (const triangle of [
        [a, b, a + 1],
        [a + 1, b, b + 1],
      ])
        if (triangle.every((index) => valid[index])) indices.push(...triangle);
    }
  const geometry = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const patch = material(flour ? 0xe2d9bc : kind === 'spice-active' ? 0x8d5131 : 0x9e7853);
  patch.color.set(0xffffff);
  patch.vertexColors = true;
  patch.polygonOffset = true;
  patch.polygonOffsetFactor = -1;
  patch.polygonOffsetUnits = -1;
  if (indices.length) group.add(new THREE.Mesh(geometry, patch));
  else {
    geometry.dispose();
    patch.dispose();
  }
  if (!flour) {
    const fragments: THREE.BufferGeometry[] = [];
    const count = kind === 'spice-active' ? 24 : 8;
    for (let i = 0; i < count; i++) {
      const angle = i * 2.399963,
        distance = radius * Math.sqrt((i + 1) / (count + 1)) * 0.8;
      place(
        fragments,
        new THREE.IcosahedronGeometry(0.8 + (i % 3) * 0.4, 0).scale(1.5, 0.4, 1),
        Math.cos(angle) * distance,
        Math.sin(angle) * distance * 0.8,
        0.7,
      );
    }
    addParts(fragments, material(kind === 'spice-active' ? 0xcc8244 : 0xb49265));
  }
  return group;
}
