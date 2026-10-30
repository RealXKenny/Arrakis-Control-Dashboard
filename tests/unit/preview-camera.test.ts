import * as THREE from 'three';
import { expect, it } from 'vitest';
import { fitBaseCamera } from '../../src/modules/bases/utils/preview-camera';

it('fits every corner in a picture while preserving the chosen viewing direction', () => {
  const bounds = new THREE.Box3(new THREE.Vector3(-80, -20, -9), new THREE.Vector3(80, 20, 9));
  for (const aspect of [640 / 360, 0.5]) {
    for (const direction of [
      new THREE.Vector3(1, 0, 0),
      new THREE.Vector3(-1, 0.4, -1).normalize(),
      new THREE.Vector3(0, 1, 0.01).normalize(),
    ]) {
      const camera = new THREE.PerspectiveCamera(45, aspect, 0.05, 10000);
      camera.position.copy(direction);
      const target = new THREE.Vector3();
      fitBaseCamera(camera, bounds, target);
      expect(camera.position.clone().sub(target).normalize().distanceTo(direction)).toBeLessThan(1e-9);
      for (const x of [bounds.min.x, bounds.max.x])
        for (const y of [bounds.min.y, bounds.max.y])
          for (const z of [bounds.min.z, bounds.max.z]) {
            const projected = new THREE.Vector3(x, y, z).project(camera);
            expect(Math.abs(projected.x)).toBeLessThan(1);
            expect(Math.abs(projected.y)).toBeLessThan(1);
            expect(projected.z).toBeLessThan(1);
            expect(projected.z).toBeGreaterThan(-1);
          }
    }
  }
});
