import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { BuildingLibrary, type BuildingPartSummary } from '../../map/terrain/buildingModels';
import { fitTerrainCamera } from '../../map/terrain/sceneFraming';
import { BaseModelError, fetchBaseModelExport } from '../utils/model-export';
import css from '../preview.module.css';

type Status = {
  kind: 'loading' | 'ready' | 'partial' | 'unavailable';
  message: string;
  pieces?: number;
  total?: number;
  needsSignIn?: boolean;
};
type Controls = { fit: () => void; top: () => void; zoom: (factor: number) => void };

/** Reuse livemap's real building meshes and bounded decoder, with one on-demand renderer. */
export default function BaseModelViewer({
  baseId,
  baseName,
  modelUrl,
  onSettled,
}: {
  baseId: string;
  baseName: string;
  modelUrl?: string;
  onSettled: () => void;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const controlsRef = useRef<Controls | null>(null);
  const [status, setStatus] = useState<Status>({ kind: 'loading', message: 'Loading base structure…' });
  const [parts, setParts] = useState<BuildingPartSummary[]>([]);
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const controller = new AbortController();
    const loadSignal = AbortSignal.any([controller.signal, AbortSignal.timeout(20000)]);
    const library = new BuildingLibrary(loadSignal, { visual: true });
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    } catch {
      library.dispose();
      setStatus({
        kind: 'unavailable',
        message: '3D rendering is unavailable in this browser. Base telemetry and downloads are still available.',
      });
      onSettled();
      return () => controller.abort();
    }
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.9;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    renderer.domElement.setAttribute('aria-label', `${baseName} 3D model`);
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    host.append(renderer.domElement);
    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#101113');
    const camera = new THREE.PerspectiveCamera(45, 1, 0.05, 10000);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.maxPolarAngle = Math.PI * 0.49;
    const light = new THREE.DirectionalLight(0xffffff, 2.5);
    light.position.set(-100, 180, 100);
    scene.add(light, new THREE.HemisphereLight(0xf4f4f5, 0x4b4640, 2));
    let model: THREE.Group | null = null;
    let grid: THREE.GridHelper | null = null;
    let bounds: THREE.Box3 | null = null;
    const paint = () => {
      if (!controller.signal.aborted) renderer.render(scene, camera);
    };
    const fit = () => {
      if (!bounds) return;
      const distance = fitTerrainCamera(camera, bounds, controls.target);
      if (distance !== null) {
        controls.minDistance = Math.max(0.1, distance / 100);
        controls.maxDistance = distance * 6;
        controls.update();
        paint();
      }
    };
    controlsRef.current = {
      fit,
      top: () => {
        const distance = camera.position.distanceTo(controls.target);
        camera.position.copy(controls.target).add(new THREE.Vector3(0, distance, 0.01));
        controls.update();
        paint();
      },
      zoom: (factor) => {
        camera.position
          .sub(controls.target)
          .multiplyScalar(1 / factor)
          .add(controls.target);
        controls.update();
        paint();
      },
    };
    const resize = () => {
      if (!host.clientWidth || !host.clientHeight || controller.signal.aborted) return;
      renderer.setSize(host.clientWidth, host.clientHeight, false);
      camera.aspect = host.clientWidth / host.clientHeight;
      camera.updateProjectionMatrix();
      paint();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(host);
    resize();
    controls.addEventListener('change', paint);
    const lost = (event: Event) => {
      event.preventDefault();
      controller.abort();
      setStatus({ kind: 'unavailable', message: 'The graphics context was lost. Reload the preview to try again.' });
      onSettled();
    };
    renderer.domElement.addEventListener('webglcontextlost', lost);
    void fetchBaseModelExport(baseId, loadSignal, modelUrl)
      .then((value) => {
        const source =
          value && typeof value === 'object' && 'layout' in value ? (value as { layout: unknown }).layout : value;
        return library.build(source);
      })
      .then((built) => {
        if (controller.signal.aborted) {
          built.group.traverse((object) => {
            if (object instanceof THREE.InstancedMesh) object.dispose();
          });
          return;
        }
        model = built.group;
        model.updateMatrixWorld(true);
        bounds = new THREE.Box3().setFromObject(model);
        if (bounds.isEmpty()) throw new Error('Empty model');
        // Export coordinates can have a large origin; centre the viewer on the structure itself.
        const center = bounds.getCenter(new THREE.Vector3());
        model.position.sub(center);
        bounds.translate(center.clone().negate());
        scene.add(model);
        const size = bounds.getSize(new THREE.Vector3());
        grid = new THREE.GridHelper(Math.max(10, size.x, size.z) * 1.5, 20, 0x626269, 0x303035);
        grid.position.y = bounds.min.y - 0.05;
        scene.add(grid);
        fit();
        setStatus({
          kind: built.pieces < built.total ? 'partial' : 'ready',
          message: `${built.pieces} of ${built.total} building pieces`,
          pieces: built.pieces,
          total: built.total,
        });
        setParts(built.parts);
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        const message =
          error instanceof BaseModelError && error.code === 'unauthorized'
            ? 'Your session expired. Sign in again to preview this base.'
            : error instanceof BaseModelError && error.code === 'forbidden'
              ? 'This base is not available to your account.'
              : error instanceof BaseModelError && error.code === 'too-large'
                ? 'This export exceeds the preview size limit.'
                : 'A 3D preview is unavailable for this base. Its export may contain unsupported pieces, or the service may be unavailable.';
        setStatus({
          kind: 'unavailable',
          message,
          needsSignIn: error instanceof BaseModelError && error.code === 'unauthorized',
        });
      })
      .finally(() => {
        if (!controller.signal.aborted) onSettled();
      });
    return () => {
      controller.abort();
      observer.disconnect();
      controls.removeEventListener('change', paint);
      controls.dispose();
      controlsRef.current = null;
      renderer.domElement.removeEventListener('webglcontextlost', lost);
      model?.traverse((object) => {
        if (object instanceof THREE.InstancedMesh) object.dispose();
      });
      library.dispose();
      if (grid) {
        grid.geometry.dispose();
        (Array.isArray(grid.material) ? grid.material : [grid.material]).forEach((material) => material.dispose());
      }
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
    };
  }, [baseId, baseName, modelUrl, onSettled]);
  const ready = status.kind === 'ready' || status.kind === 'partial';
  return (
    <div className={css.viewer} data-base-preview-state={status.kind}>
      <div className={css.toolbar}>
        <span>{ready ? status.message : 'Base structure'}</span>
        <div>
          <button
            type="button"
            disabled={!ready}
            aria-label="Zoom base preview out"
            onClick={() => controlsRef.current?.zoom(0.8)}
          >
            −
          </button>
          <button
            type="button"
            disabled={!ready}
            aria-label="Zoom base preview in"
            onClick={() => controlsRef.current?.zoom(1.25)}
          >
            +
          </button>
          <button type="button" disabled={!ready} onClick={() => controlsRef.current?.fit()}>
            Fit base
          </button>
          <button type="button" disabled={!ready} onClick={() => controlsRef.current?.top()}>
            Top view
          </button>
        </div>
      </div>
      <div className={css.stage}>
        <div className={css.canvas} ref={hostRef} />
        {!ready && (
          <div className={css.overlay} role="status">
            <span>{status.message}</span>
            {status.needsSignIn && <a href="/auth/login">Sign in again</a>}
          </div>
        )}
      </div>
      <p className={css.caption} role="status">
        {status.kind === 'partial'
          ? 'Partial preview: some pieces are unsupported or exceed the detail budget.'
          : ready
            ? 'Drag to orbit · Right drag to pan · Scroll to zoom'
            : 'Only authorized base exports are used for this preview.'}
      </p>
      {ready && (
        <details className={css.parts}>
          <summary>
            Building parts <span>{parts.length} item types</span>
          </summary>
          <p>Each supported item uses its own catalog mesh and placement. Unavailable pieces are listed below.</p>
          <ul aria-label="Base building parts">
            {parts.map((part) => (
              <li key={part.templateId}>
                <span>
                  {part.name ?? part.templateId.replace(/_Placeable$/, '').replaceAll('_', ' ')}
                  <small>{part.templateId}</small>
                </span>
                <span>
                  {part.rendered} / {part.total}
                  {part.rendered < part.total && <small>Not fully rendered</small>}
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
