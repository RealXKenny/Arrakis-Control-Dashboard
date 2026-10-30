import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { BuildingLibrary, type BuildingPartSummary } from '../../map/terrain/buildingModels';
import { fitTerrainCamera } from '../../map/terrain/sceneFraming';
import { BaseModelError, fetchBaseModelExport } from '../utils/model-export';
import css from '../preview.module.css';
import { baseViewSchema, type BaseView } from '../utils/preview-settings';
import { fitBaseCamera } from '../utils/preview-camera';

export type BaseCapture = { view: BaseView; image: string };

type Status = {
  kind: 'loading' | 'ready' | 'partial' | 'unavailable';
  message: string;
  pieces?: number;
  total?: number;
  needsSignIn?: boolean;
  progress?: number;
};
type Controls = {
  fit: () => void;
  top: () => void;
  zoom: (factor: number) => void;
  face: (degrees: number) => void;
  capture: () => BaseCapture;
  front: () => void;
  setNightMode: (night: boolean) => void;
};

function captureBackdrop(source: HTMLCanvasElement, night: boolean) {
  const canvas = document.createElement('canvas');
  canvas.width = 640;
  canvas.height = 360;
  const context = canvas.getContext('2d');
  if (!context) return source.toDataURL('image/png');
  const sky = context.createLinearGradient(0, 0, 0, 360);
  if (night) {
    sky.addColorStop(0, '#09172a');
    sky.addColorStop(0.65, '#536579');
    sky.addColorStop(1, '#9a735c');
  } else {
    sky.addColorStop(0, '#6bb8d4');
    sky.addColorStop(0.65, '#e8c49b');
    sky.addColorStop(1, '#d4a16b');
  }
  context.fillStyle = sky;
  context.fillRect(0, 0, 640, 360);
  if (night) {
    context.fillStyle = 'rgba(255,255,255,.8)';
    for (const [x, y] of [
      [70, 44],
      [156, 82],
      [242, 35],
      [348, 70],
      [452, 36],
      [570, 91],
      [520, 122],
    ]) {
      context.beginPath();
      context.arc(x, y, 1.3, 0, Math.PI * 2);
      context.fill();
    }
    context.fillStyle = '#f3dfb5';
    context.beginPath();
    context.arc(535, 66, 19, 0, Math.PI * 2);
    context.fill();
  } else {
    context.fillStyle = 'rgba(255,232,180,.9)';
    context.beginPath();
    context.arc(535, 66, 25, 0, Math.PI * 2);
    context.fill();
  }
  const ridge = (color: string, points: [number, number][]) => {
    context.fillStyle = color;
    context.beginPath();
    context.moveTo(0, 270);
    for (const [x, y] of points) context.lineTo(x, y);
    context.lineTo(640, 300);
    context.lineTo(640, 360);
    context.lineTo(0, 360);
    context.closePath();
    context.fill();
  };
  ridge(night ? '#465064' : '#9b8064', [
    [0, 252],
    [88, 205],
    [148, 233],
    [246, 181],
    [310, 222],
    [414, 174],
    [488, 226],
    [574, 190],
    [640, 232],
  ]);
  ridge(night ? '#202b3b' : '#6e5845', [
    [0, 292],
    [96, 246],
    [178, 274],
    [278, 224],
    [358, 272],
    [450, 226],
    [534, 267],
    [640, 232],
  ]);
  context.fillStyle = night ? '#253041' : '#a67c54';
  context.fillRect(0, 315, 640, 45);
  context.drawImage(source, 0, 0, 640, 360);
  return canvas.toDataURL('image/png');
}

/** Reuse livemap's real building meshes and bounded decoder, with one on-demand renderer. */
export default function BaseModelViewer({
  baseId,
  baseName,
  assetRefresh,
  immersive = false,
  modelUrl,
  onSettled,
  modelData,
  onCapture,
}: {
  baseId: string;
  baseName: string;
  assetRefresh?: string;
  immersive?: boolean;
  modelUrl?: string;
  onSettled: () => void;
  modelData?: unknown;
  onCapture?: (capture: BaseCapture) => void;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const controlsRef = useRef<Controls | null>(null);
  const baseFacingRef = useRef(0);
  const [status, setStatus] = useState<Status>({ kind: 'loading', message: 'Loading base structure…' });
  const [fastPreviewRendered, setFastPreviewRendered] = useState(false);
  const [parts, setParts] = useState<BuildingPartSummary[]>([]);
  const [baseFacing, setBaseFacing] = useState(0);
  const [nightMode, setNightMode] = useState(false);
  const nightModeRef = useRef(false);
  const [saveMessage, setSaveMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const [savedPicture, setSavedPicture] = useState('');
  const [needsPicture, setNeedsPicture] = useState(true);
  const saveController = useRef<AbortController | null>(null);
  const canSave = !modelUrl && !modelData;
  useEffect(() => () => saveController.current?.abort(), []);
  async function save() {
    if (!controlsRef.current || saving) return;
    const capture = controlsRef.current.capture();
    if (onCapture && capture) {
      onCapture(capture);
      setSaveMessage('Front and picture selected.');
      return;
    }
    if (!canSave) return;
    const controller = new AbortController();
    saveController.current = controller;
    setSaving(true);
    setSaveMessage('Saving…');
    try {
      const response = await fetch(`/api/bases/${encodeURIComponent(baseId)}/preview`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(capture),
        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(20000)]),
      });
      if (!response.ok) throw new Error('Unable to save');
      setSavedPicture(capture.image);
      setNeedsPicture(false);
      setSaveMessage('Front and picture saved for this base. Shared cards will use this picture.');
    } catch {
      if (!controller.signal.aborted) setSaveMessage('Could not save this view. Please try again.');
    } finally {
      if (!controller.signal.aborted) setSaving(false);
    }
  }
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const controller = new AbortController();
    const loadSignal = AbortSignal.any([controller.signal, AbortSignal.timeout(120000)]);
    const library = new BuildingLibrary(loadSignal, { visual: true, assetRefresh });
    const fastLibrary = new BuildingLibrary(loadSignal, { assetRefresh });
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'high-performance' });
    } catch {
      library.dispose();
      fastLibrary.dispose();
      setStatus({
        kind: 'unavailable',
        message: '3D rendering is unavailable in this browser. Base telemetry and downloads are still available.',
      });
      onSettled();
      return () => controller.abort();
    }
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.9;
    renderer.setClearColor(0x000000, 0);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    renderer.domElement.setAttribute('aria-label', `${baseName} 3D model`);
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    host.append(renderer.domElement);
    const scene = new THREE.Scene();
    scene.background = null;
    const camera = new THREE.PerspectiveCamera(45, 1, 0.05, 10000);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.maxPolarAngle = Math.PI * 0.49;
    const sun = new THREE.DirectionalLight(0xffe5bb, 2.7);
    sun.position.set(-100, 180, 100);
    const fill = new THREE.DirectionalLight(0xffd7aa, 0.85);
    fill.position.set(120, 70, -100);
    const hemisphere = new THREE.HemisphereLight(0xe8f5ff, 0x927253, 1.8);
    scene.add(sun, fill, hemisphere);
    let model: THREE.Group | null = null;
    let hasFastPreview = false;
    let hasInstalledModel = false;
    let grid: THREE.GridHelper | null = null;
    let bounds: THREE.Box3 | null = null;
    const paint = () => {
      if (!controller.signal.aborted) renderer.render(scene, camera);
    };
    const applyNightMode = (night: boolean) => {
      hemisphere.color.set(night ? '#8094bd' : '#e8f5ff');
      hemisphere.groundColor.set(night ? '#26314b' : '#927253');
      hemisphere.intensity = night ? 1.05 : 1.8;
      sun.color.set(night ? '#9bb5e8' : '#ffe5bb');
      sun.intensity = night ? 0.85 : 2.7;
      fill.color.set(night ? '#5772a8' : '#ffd7aa');
      fill.intensity = night ? 0.42 : 0.85;
      renderer.toneMappingExposure = night ? 0.72 : 0.9;
      if (grid) {
        const materials = Array.isArray(grid.material) ? grid.material : [grid.material];
        materials.forEach((material) => {
          if (material instanceof THREE.LineBasicMaterial) {
            material.color.set(night ? '#51627d' : '#806849');
            material.opacity = night ? 0.55 : 0.38;
          }
        });
      }
      paint();
    };
    const fit = () => {
      if (!bounds) return;
      if (model) {
        model.updateMatrixWorld(true);
        bounds = new THREE.Box3().setFromObject(model);
      }
      const distance = fitBaseCamera(camera, bounds, controls.target);
      if (distance !== null) {
        controls.minDistance = Math.max(0.1, distance / 100);
        controls.maxDistance = distance * 6;
        controls.update();
        paint();
      }
    };
    controlsRef.current = {
      fit,
      setNightMode: applyNightMode,
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
      face: (degrees) => {
        baseFacingRef.current = degrees;
        if (model) {
          model.rotation.y = THREE.MathUtils.degToRad(degrees);
          paint();
        }
      },
      front: () => {
        const distance = Math.max(camera.position.distanceTo(controls.target), 1);
        const back = camera.position.clone().sub(controls.target).setY(0).normalize();
        if (back.lengthSq() < 0.01) back.set(0, 0, 1);
        camera.position.copy(controls.target).addScaledVector(back, distance);
        fit();
      },
      capture: () => {
        if (!model || !bounds) throw new Error('Preview is not ready');
        model.updateMatrixWorld(true);
        const captureBounds = new THREE.Box3().setFromObject(model);
        const scale = Math.max(captureBounds.getSize(new THREE.Vector3()).length(), 1);
        const shot = camera.clone();
        shot.aspect = 640 / 360;
        const target = controls.target.clone();
        fitBaseCamera(shot, captureBounds, target);
        const view: BaseView = {
          position: shot.position.clone().divideScalar(scale).toArray(),
          target: target.divideScalar(scale).toArray(),
          facing: baseFacingRef.current,
        };
        const oldSize = renderer.getSize(new THREE.Vector2());
        const oldRatio = renderer.getPixelRatio();
        if (grid) grid.visible = false;
        try {
          renderer.setPixelRatio(1);
          renderer.setSize(640, 360, false);
          renderer.render(scene, shot);
          return { view, image: captureBackdrop(renderer.domElement, nightModeRef.current) };
        } finally {
          if (grid) grid.visible = true;
          renderer.setPixelRatio(oldRatio);
          renderer.setSize(oldSize.x, oldSize.y, false);
          paint();
        }
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
    let savedView: BaseView | null = null;
    setStatus({ kind: 'loading', message: 'Loading base export…', progress: 4 });
    const settings = canSave
      ? fetch(`/api/bases/${encodeURIComponent(baseId)}/preview`, { signal: loadSignal, credentials: 'same-origin' })
          .then(async (response) => (response.ok ? response.json() : null))
          .catch(() => null)
      : Promise.resolve(null);
    const exportPromise = modelData ? Promise.resolve(modelData) : fetchBaseModelExport(baseId, loadSignal, modelUrl);
    const progressTimer = window.setInterval(() => {
      setStatus((current) =>
        current.kind !== 'loading'
          ? current
          : {
              ...current,
              progress: Math.min(82, (current.progress ?? 4) + Math.max(0.35, (82 - (current.progress ?? 4)) * 0.04)),
            },
      );
    }, 350);
    const installModel = (built: Awaited<ReturnType<BuildingLibrary['build']>>) => {
      if (model) {
        scene.remove(model);
        model.traverse((object) => {
          if (object instanceof THREE.InstancedMesh) object.dispose();
        });
      }
      const originalBounds = new THREE.Box3().setFromObject(built.group);
      built.group.position.sub(originalBounds.getCenter(new THREE.Vector3()));
      model = new THREE.Group();
      model.add(built.group);
      // Keep a repeatable 0° base heading while preserving every piece's own rotation.
      model.rotation.y = THREE.MathUtils.degToRad(baseFacingRef.current);
      model.updateMatrixWorld(true);
      bounds = new THREE.Box3().setFromObject(model);
      if (bounds.isEmpty()) throw new Error('Empty model');
      const center = bounds.getCenter(new THREE.Vector3());
      model.position.sub(center);
      bounds.translate(center.clone().negate());
      scene.add(model);
      if (!grid) {
        grid = new THREE.GridHelper(
          Math.max(10, bounds.getSize(new THREE.Vector3()).x, bounds.getSize(new THREE.Vector3()).z) * 1.5,
          20,
          0x626269,
          0x303035,
        );
        const gridMaterials = Array.isArray(grid.material) ? grid.material : [grid.material];
        gridMaterials.forEach((material) => {
          if (material instanceof THREE.LineBasicMaterial) {
            material.transparent = true;
            material.depthWrite = false;
          }
        });
        scene.add(grid);
      }
      grid.position.y = bounds.min.y - 0.05;
      applyNightMode(nightModeRef.current);
      if (!hasInstalledModel) {
        fitTerrainCamera(camera, bounds, controls.target);
        fit();
        if (savedView) {
          baseFacingRef.current = savedView.facing;
          setBaseFacing(savedView.facing);
          model.rotation.y = THREE.MathUtils.degToRad(savedView.facing);
          model.updateMatrixWorld(true);
          const scale = Math.max(new THREE.Box3().setFromObject(model).getSize(new THREE.Vector3()).length(), 1);
          camera.position.set(...savedView.position).multiplyScalar(scale);
          controls.target.set(...savedView.target).multiplyScalar(scale);
          controls.update();
          paint();
        }
        hasInstalledModel = true;
      } else {
        paint();
      }
      return built;
    };
    void Promise.all([exportPromise, settings])
      .then(async ([value, settings]) => {
        setNeedsPicture(!settings?.hasPicture);
        const view = baseViewSchema.safeParse(
          settings?.view ?? (value && typeof value === 'object' && 'frontView' in value ? value.frontView : null),
        );
        savedView = view.success ? view.data : null;
        const source =
          value && typeof value === 'object' && 'layout' in value ? (value as { layout: unknown }).layout : value;
        const pieceCount =
          source && typeof source === 'object'
            ? ((source as { instances?: unknown[] }).instances?.length ?? 0) +
              ((source as { placeables?: unknown[] }).placeables?.length ?? 0)
            : 0;
        if (pieceCount >= 100) {
          setStatus({ kind: 'loading', message: 'Building fast preview…', progress: 24 });
          try {
            const fast = await fastLibrary.build(source);
            if (controller.signal.aborted) {
              fast.group.traverse((object) => {
                if (object instanceof THREE.InstancedMesh) object.dispose();
              });
              return null;
            }
            installModel(fast);
            hasFastPreview = true;
            setFastPreviewRendered(true);
            setParts(fast.parts);
            setStatus({ kind: 'loading', message: 'Loading detailed models and textures…', progress: 36 });
          } catch {
            // Dev note: get the quick sand-colored scaffolding up before the fancy spice finish.
          }
        }
        if (!controller.signal.aborted)
          setStatus({
            kind: 'loading',
            message: 'Loading detailed models and textures…',
            progress: hasFastPreview ? 36 : 86,
          });
        return library.build(source);
      })
      .then((built) => {
        if (!built) return;
        if (controller.signal.aborted) {
          built.group.traverse((object) => {
            if (object instanceof THREE.InstancedMesh) object.dispose();
          });
          return;
        }
        installModel(built);
        hasFastPreview = false;
        setFastPreviewRendered(false);
        setStatus({
          kind: built.pieces < built.total ? 'partial' : 'ready',
          message: `${built.pieces} of ${built.total} building pieces`,
          progress: 100,
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
                : loadSignal.aborted && loadSignal.reason?.name === 'TimeoutError'
                  ? 'The preview took too long to load. Check your connection and reload it.'
                  : error instanceof SyntaxError
                    ? 'The base export could not be read. Reload the preview or export the base again.'
                    : error instanceof Error && /No supported building pieces/.test(error.message)
                      ? 'This base has no building pieces in the preview catalog yet.'
                      : 'The preview could not load its base export or model assets. Check the browser connection and reload.';
        setFastPreviewRendered(false);
        setStatus(
          hasFastPreview
            ? { kind: 'partial', message: 'Fast preview loaded; detailed models were unavailable.' }
            : {
                kind: 'unavailable',
                message,
                needsSignIn: error instanceof BaseModelError && error.code === 'unauthorized',
              },
        );
      })
      .finally(() => {
        window.clearInterval(progressTimer);
        if (!controller.signal.aborted) onSettled();
      });
    return () => {
      window.clearInterval(progressTimer);
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
      fastLibrary.dispose();
      if (grid) {
        grid.geometry.dispose();
        (Array.isArray(grid.material) ? grid.material : [grid.material]).forEach((material) => material.dispose());
      }
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
    };
  }, [baseId, baseName, assetRefresh, modelUrl, modelData, canSave, onSettled]);
  const ready = status.kind === 'ready' || status.kind === 'partial';
  return (
    <div className={`${css.viewer} ${immersive ? css.immersiveViewer : ''}`} data-base-preview-state={status.kind}>
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
            Fit whole base
          </button>
          <button type="button" disabled={!ready} onClick={() => controlsRef.current?.top()}>
            Top view
          </button>
          <button type="button" disabled={!ready} onClick={() => controlsRef.current?.front()}>
            Level front view
          </button>
          <button
            type="button"
            disabled={!ready}
            aria-pressed={nightMode}
            aria-label={nightMode ? 'Switch to daytime lighting' : 'Switch to nighttime lighting'}
            onClick={() => {
              const next = !nightModeRef.current;
              nightModeRef.current = next;
              setNightMode(next);
              controlsRef.current?.setNightMode(next);
            }}
          >
            {nightMode ? '☾ Night' : '☼ Day'}
          </button>
          {(canSave || onCapture) && (
            <>
              <button type="button" disabled={!ready || saving} onClick={() => void save()}>
                {onCapture ? 'Use this front and picture' : 'Take picture & save front'}
              </button>
            </>
          )}
          <label className={css.facingControl}>
            <span>Base facing</span>
            <input
              type="range"
              aria-label="Base facing degrees"
              min={-180}
              max={180}
              step={1}
              value={baseFacing}
              disabled={!ready}
              onChange={(event) => {
                const degrees = THREE.MathUtils.clamp(Number(event.target.value), -180, 180);
                setBaseFacing(degrees);
                controlsRef.current?.face(degrees);
              }}
            />
            <output>{baseFacing}°</output>
          </label>
          <button
            type="button"
            disabled={!ready || baseFacing === 0}
            onClick={() => {
              setBaseFacing(0);
              controlsRef.current?.face(0);
            }}
          >
            Face 0°
          </button>
        </div>
      </div>
      {saveMessage && (
        <p className={css.caption} role="status">
          {saveMessage}
        </p>
      )}
      {canSave && !onCapture && needsPicture && (
        <p className={css.caption} role="status">
          Picture required: choose the front and take a picture to share this base or update its existing listing.
        </p>
      )}
      {savedPicture && (
        <div className={css.caption}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={savedPicture}
            alt={`${baseName} saved front picture`}
            width={640}
            height={360}
            style={{ maxWidth: '100%', height: 'auto' }}
          />
        </div>
      )}
      <div
        className={`${css.stage} ${immersive ? css.immersiveStage : ''}`}
        data-time-of-day={nightMode ? 'night' : 'day'}
      >
        <div className={css.farMountains} aria-hidden="true" />
        <div className={css.nearMountains} aria-hidden="true" />
        <div className={css.canvas} ref={hostRef} />
        {!ready && (
          <div className={`${css.overlay} ${fastPreviewRendered ? css.fastPreviewOverlay : ''}`} role="status">
            <span>{status.message}</span>
            {status.kind === 'loading' && (
              <div
                className={css.progressTrack}
                role="progressbar"
                aria-label="Base preview loading progress"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(status.progress ?? 0)}
              >
                <span className={css.progressFill} style={{ width: `${status.progress ?? 0}%` }} />
              </div>
            )}
            {status.needsSignIn && <a href="/auth/login">Sign in again</a>}
          </div>
        )}
      </div>
      <p className={css.caption} role="status">
        {status.kind === 'partial'
          ? 'Partial preview: some pieces are unsupported or exceed the detail budget.'
          : ready
            ? 'Drag to orbit · Right drag to pan · Scroll to zoom'
            : 'Preparing your base preview…'}
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
