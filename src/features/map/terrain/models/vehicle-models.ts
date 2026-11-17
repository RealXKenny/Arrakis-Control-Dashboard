import * as THREE from 'three';
const material = (color: number, extra = {}) =>
  new THREE.MeshStandardMaterial({ color, roughness: 0.65, metalness: 0.3, ...extra });
function box(w: number, h: number, l: number, color: number, y = h / 2) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, l), material(color));
  mesh.position.y = y;
  return mesh;
}
function wheels(group: THREE.Group, w: number, l: number, r: number) {
  const geometry = new THREE.CylinderGeometry(r, r, 0.35, 10).rotateZ(Math.PI / 2),
    mat = material(0x262b2c);
  for (const x of [-1, 1])
    for (const z of [-1, 1]) {
      const mesh = new THREE.Mesh(geometry, mat);
      mesh.position.set((x * w) / 2, r, (z * l) / 3);
      group.add(mesh);
    }
}
export function vehicleKind(value: unknown) {
  const s = String(value ?? '')
    .replace(/[^a-z]/gi, '')
    .toLowerCase();
  return /ornithopter/.test(s)
    ? s.includes('transport')
      ? 'transport'
      : s.includes('medium') || s.includes('assault')
        ? 'medium'
        : 'light'
    : /sandcrawler/.test(s)
      ? 'crawler'
      : /treadwheel/.test(s)
        ? 'tread'
        : /sandbike/.test(s)
          ? 'bike'
          : /buggy/.test(s)
            ? 'buggy'
            : 'utility';
}
// Adapted from MapViewer3D's lightweight vehicle silhouettes; dimensions are metres.
export function createVehicleModel(value: unknown) {
  const kind = vehicleKind(value),
    group = new THREE.Group();
  if (['light', 'medium', 'transport'].includes(kind)) {
    const length = kind === 'transport' ? 24 : kind === 'medium' ? 17 : 12;
    const body = new THREE.Mesh(
      new THREE.CapsuleGeometry(length * 0.09, length * 0.6, 4, 10).rotateX(Math.PI / 2),
      material(0x8d9eaa),
    );
    body.position.y = length * 0.15;
    group.add(body);
    const glass = new THREE.Mesh(
      new THREE.SphereGeometry(length * 0.07, 10, 8),
      material(0x5ba4ae, { metalness: 0.65 }),
    );
    glass.position.set(0, length * 0.2, -length * 0.3);
    group.add(glass);
    const wingGeo = new THREE.BoxGeometry(length * 0.55, 0.12, length * 0.14),
      wingMat = material(0xd4ccb6);
    for (const x of [-1, 1])
      for (const z of [-0.15, 0.15]) {
        const wing = new THREE.Mesh(wingGeo, wingMat);
        wing.position.set(x * length * 0.33, length * 0.22, z * length);
        wing.rotation.z = x * 0.08;
        group.add(wing);
      }
    const tail = box(length * 0.2, 0.15, length * 0.2, 0xb2c1bf, length * 0.18);
    tail.position.z = length * 0.4;
    group.add(tail);
  } else if (kind === 'bike') {
    group.add(box(0.8, 0.9, 2.8, 0xb77c42, 0.9));
    wheels(group, 0.9, 2.8, 0.45);
  } else if (kind === 'buggy') {
    group.add(box(2.4, 1.2, 4.4, 0xb79a6c, 1.1));
    group.add(box(1.8, 0.65, 1.9, 0x394b50, 2));
    wheels(group, 2.6, 4.4, 0.6);
  } else if (kind === 'crawler') {
    group.add(box(8, 5, 14, 0xb8a786, 3.2));
    group.add(box(8.6, 1.4, 14.5, 0x3d4547, 0.7));
    group.add(box(6, 1, 5, 0x596b6e, 6.2));
  } else if (kind === 'tread') {
    group.add(box(3, 2.2, 5, 0xa08c68, 1.6));
    group.add(box(3.4, 1, 5.3, 0x3c4548, 0.5));
  } else {
    group.add(box(3, 3, 6, 0x778a80));
  }
  return group;
}
export function disposeVehicleModels(prototypes: Iterable<THREE.Group>) {
  const geometries = new Set<THREE.BufferGeometry>(),
    materials = new Set<THREE.Material>();
  for (const group of prototypes)
    group.traverse((object) => {
      if (object instanceof THREE.Mesh) {
        geometries.add(object.geometry);
        for (const mat of Array.isArray(object.material) ? object.material : [object.material]) materials.add(mat);
      }
    });
  for (const g of geometries) g.dispose();
  for (const m of materials) m.dispose();
}
