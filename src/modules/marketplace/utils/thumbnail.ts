import * as THREE from 'three';
import { BuildingLibrary } from '../../map/terrain/buildingModels';
import { fetchBaseModelExport } from '../../bases/utils/model-export';

// One thumbnail job at a time keeps a long marketplace from exhausting WebGL contexts.
let queue: Promise<unknown> = Promise.resolve();

export function createMarketplaceThumbnail(id: string, signal: AbortSignal): Promise<string> {
  const job = queue.catch(() => {}).then(() => render(id, signal));
  queue = job.catch(() => {});
  return job;
}

async function render(id: string, signal: AbortSignal): Promise<string> {
  signal.throwIfAborted();
  const active = AbortSignal.any([signal, AbortSignal.timeout(20000)]);
  const library = new BuildingLibrary(active, { visual: true });
  let renderer: THREE.WebGLRenderer | undefined;
  let model: THREE.Group | undefined;
  try {
    const value = await fetchBaseModelExport(id, active, `/api/base-marketplace/${encodeURIComponent(id)}`);
    const source = value && typeof value === 'object' && 'layout' in value ? value.layout : value;
    const built = await library.build(source);
    model = built.group;
    active.throwIfAborted();
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(640, 360);
    renderer.setPixelRatio(1);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.9;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#101113');
    scene.add(model, new THREE.HemisphereLight(0xf4f4f5, 0x4b4640, 2));
    const light = new THREE.DirectionalLight(0xffffff, 2.5);
    light.position.set(-100, 180, 100);
    scene.add(light);
    const bounds = new THREE.Box3().setFromObject(model);
    if (bounds.isEmpty()) throw new Error('Empty thumbnail');
    const center = bounds.getCenter(new THREE.Vector3());
    model.position.sub(center);
    const size = bounds.getSize(new THREE.Vector3());
    const halfHeight = Math.max(size.y / 2, size.x / (2 * (640 / 360)), 0.5) * 1.15;
    const distance = Math.max(size.x, size.y, size.z, 1) * 2;
    // Orthographic front elevation: level camera, no perspective tilt or orbit angle.
    const camera = new THREE.OrthographicCamera(
      -halfHeight * (640 / 360),
      halfHeight * (640 / 360),
      halfHeight,
      -halfHeight,
      0.01,
      distance * 3,
    );
    camera.position.set(0, 0, distance);
    camera.lookAt(0, 0, 0);
    renderer.render(scene, camera);
    active.throwIfAborted();
    return renderer.domElement.toDataURL('image/png');
  } finally {
    model?.traverse((object) => {
      if (object instanceof THREE.InstancedMesh) object.dispose();
    });
    library.dispose();
    renderer?.dispose();
    renderer?.forceContextLoss();
  }
}
