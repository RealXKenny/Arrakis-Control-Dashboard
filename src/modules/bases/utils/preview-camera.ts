import * as THREE from 'three';

/** Fit every corner while retaining the user's chosen front and elevation. */
export function fitBaseCamera(camera: THREE.PerspectiveCamera, bounds: THREE.Box3, target: THREE.Vector3) {
  const back = camera.position.clone().sub(target).normalize();
  if (back.lengthSq() < 0.01) back.set(0, 0.3, 1).normalize();
  const right = new THREE.Vector3().crossVectors(camera.up, back).normalize();
  if (right.lengthSq() < 0.01) right.set(1, 0, 0);
  const up = new THREE.Vector3().crossVectors(back, right).normalize();
  target.copy(bounds.getCenter(new THREE.Vector3()));
  const vertical = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  let distance = 1;
  for (const x of [bounds.min.x, bounds.max.x])
    for (const y of [bounds.min.y, bounds.max.y])
      for (const z of [bounds.min.z, bounds.max.z]) {
        const corner = new THREE.Vector3(x, y, z).sub(target);
        distance = Math.max(
          distance,
          corner.dot(back) +
            1.15 *
              Math.max(Math.abs(corner.dot(right)) / (vertical * camera.aspect), Math.abs(corner.dot(up)) / vertical),
        );
      }
  camera.position.copy(target).addScaledVector(back, distance);
  camera.far = Math.max(camera.far, distance * 12);
  camera.updateProjectionMatrix();
  camera.lookAt(target);
  camera.updateMatrixWorld(true);
  return distance;
}
