import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Original map model in metres: a partly buried, armoured worm with a three-lobed maw.
export function createSandwormModel() {
  const worm = new THREE.Group();
  worm.name = 'Arrakis sandworm';
  worm.rotation.y = Math.PI;
  const skin = new THREE.MeshStandardMaterial({ color: 0x8c6944, roughness: 0.94 });
  const armour = new THREE.MeshStandardMaterial({ color: 0xbaa078, roughness: 0.86 });
  const throat = new THREE.MeshStandardMaterial({ color: 0x24160f, roughness: 1, side: THREE.DoubleSide });
  const ivory = new THREE.MeshStandardMaterial({ color: 0xe7d7ad, roughness: 0.67 });
  const sand = new THREE.MeshStandardMaterial({ color: 0xcaa56b, roughness: 1 });
  const center = (t: number) =>
    new THREE.Vector3(Math.sin(t * Math.PI) * 8, 9 * (1 - t) + 5 * Math.sin(t * Math.PI) - 5 * t * t, -34 + 86 * t);
  const radius = (t: number) => 7 * (1 - 0.9 * t ** 1.6);
  const positions: number[] = [],
    indices: number[] = [];
  const rows = 96,
    sides = 20;
  for (let row = 0; row <= rows; row++) {
    const t = row / rows,
      p = center(t),
      r = radius(t) * (0.95 + 0.05 * Math.cos(t * Math.PI * 64));
    for (let side = 0; side <= sides; side++) {
      const a = (side / sides) * Math.PI * 2;
      positions.push(p.x + Math.cos(a) * r, p.y + Math.sin(a) * r, p.z);
      if (row < rows && side < sides) {
        const i = row * (sides + 1) + side;
        indices.push(i, i + 1, i + sides + 1, i + 1, i + sides + 2, i + sides + 1);
      }
    }
  }
  const body = new THREE.BufferGeometry();
  body.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  body.setIndex(indices);
  body.computeVertexNormals();
  worm.add(new THREE.Mesh(body, skin));
  const ridges: THREE.BufferGeometry[] = [],
    teeth: THREE.BufferGeometry[] = [],
    jaws: THREE.BufferGeometry[] = [];
  for (let i = 1; i < 28; i++) {
    const t = i / 29,
      p = center(t);
    const ring = new THREE.TorusGeometry(radius(t), 0.22 + 0.18 * (1 - t), 5, 20);
    ring.translate(p.x, p.y, p.z);
    ridges.push(ring);
  }
  for (let lobe = 0; lobe < 3; lobe++) {
    const jaw = new THREE.TorusGeometry(6.7, 1.0, 8, 16, (Math.PI * 2) / 3 - 0.13);
    jaw.rotateZ((lobe * Math.PI * 2) / 3 + 0.065);
    jaw.translate(0, 9, -35.5);
    jaws.push(jaw);
  }
  const funnel = new THREE.CylinderGeometry(6.5, 1.9, 9, 24, 4, true);
  funnel.rotateX(-Math.PI / 2);
  funnel.translate(0, 9, -31.5);
  worm.add(new THREE.Mesh(funnel, throat));
  const inner = new THREE.SphereGeometry(2.1, 12, 8);
  inner.scale(1, 1, 0.3);
  inner.translate(0, 9, -26.5);
  worm.add(new THREE.Mesh(inner, throat));
  for (let row = 0; row < 3; row++)
    for (let i = 0; i < 24; i++) {
      const a = ((i + row * 0.5) * Math.PI * 2) / 24,
        r = 5.9 - row * 1.3;
      const tooth = new THREE.ConeGeometry(0.3 - row * 0.045, 2.4 - row * 0.4, 5);
      const direction = new THREE.Vector3(-Math.cos(a), -Math.sin(a), 0.65).normalize();
      tooth.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction));
      tooth.translate(Math.cos(a) * r, 9 + Math.sin(a) * r, -36 + row * 2.5);
      teeth.push(tooth);
    }
  const merged = (parts: THREE.BufferGeometry[], material: THREE.Material) => {
    const geometry = mergeGeometries(parts);
    parts.forEach((part) => part.dispose());
    if (geometry) worm.add(new THREE.Mesh(geometry, material));
  };
  merged(ridges, armour);
  merged(jaws, armour);
  merged(teeth, ivory);
  // Dev note: Shai-Hulud leaves furrows, not a trail of spare tyres.
  const wake: THREE.BufferGeometry[] = [];
  for (const side of [-1, 1]) {
    const vertices: number[] = [],
      faces: number[] = [];
    for (let row = 0; row <= 32; row++) {
      const t = row / 32,
        p = center(t);
      for (let col = 0; col <= 4; col++) {
        const across = col / 4;
        vertices.push(
          p.x + side * (radius(t) * 0.86 + across * 5),
          -0.15 + Math.sin(across * Math.PI) * (0.6 + 0.3 * Math.sin(t * 51)),
          p.z,
        );
        if (row < 32 && col < 4) {
          const i = row * 5 + col;
          faces.push(...(side > 0 ? [i, i + 5, i + 1, i + 1, i + 5, i + 6] : [i, i + 1, i + 5, i + 1, i + 6, i + 5]));
        }
      }
    }
    const furrow = new THREE.BufferGeometry();
    furrow.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    furrow.setIndex(faces);
    furrow.computeVertexNormals();
    wake.push(furrow);
  }
  merged(wake, sand);
  return worm;
}
