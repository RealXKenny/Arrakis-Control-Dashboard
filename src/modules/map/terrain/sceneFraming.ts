import * as THREE from 'three';

// Fit all terrain corners inside the actual viewport, including tall relief and narrow screens.
export function fitTerrainCamera(camera: THREE.PerspectiveCamera, bounds: THREE.Box3, target: THREE.Vector3) {
  if (bounds.isEmpty()) return null;
  target.copy(bounds.getCenter(new THREE.Vector3()));
  const back = new THREE.Vector3(0, 1, 1).normalize();
  const up = new THREE.Vector3(0, 1, -1).normalize();
  const tanVertical = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  const tanHorizontal = tanVertical * camera.aspect;
  let distance = 1;
  for (const x of [bounds.min.x, bounds.max.x])
    for (const y of [bounds.min.y, bounds.max.y])
      for (const z of [bounds.min.z, bounds.max.z]) {
        const corner = new THREE.Vector3(x, y, z).sub(target);
        distance = Math.max(
          distance,
          corner.dot(back) + 1.1 * Math.max(Math.abs(corner.x) / tanHorizontal, Math.abs(corner.dot(up)) / tanVertical),
        );
      }
  camera.position.copy(target).addScaledVector(back, distance);
  camera.far = Math.max(camera.far, distance * 12);
  camera.updateProjectionMatrix();
  camera.lookAt(target);
  camera.updateMatrixWorld(true);
  return distance;
}
