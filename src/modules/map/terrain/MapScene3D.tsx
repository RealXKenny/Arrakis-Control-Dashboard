'use client';
import { useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import MapMarker from '../components/MapMarker';
import { worldToMapPoint } from '../utils/coordinates';
import { markerKey } from '../utils/markers';
import { getCoordinate } from '../utils/mapData';
import { loadHeightSurface, surfaceHeight } from './heightSurface';
import { createSurfaceGeometry, loadMapTexture, terrainPoint, type MapBounds } from './sceneGeometry';
import { loadLayoutAssets, loadSharedAssets } from './terrainAssets';
import { createDesertDetails, updateDesertDetails } from './desertDetails';
import { SceneModels } from './sceneModels';
import { colorSurface, createMapMaterial, niceScale } from './mapPresentation';
import MapHud from './MapHud';
import { renderQuality, type QualityChoice } from './renderQuality';

export type MapCamera = {
  zoom: (factor: number) => void;
  fit: () => void;
  focus: (marker: Record<string, unknown>) => void;
  north: () => void;
  top: () => void;
};
type Marker = Record<string, unknown>;
type Props = {
  mapName: string;
  mapConfig: MapBounds;
  layout: number;
  markers: Marker[];
  showSectorGrid: boolean;
  gridOverlay: { lines: { x1: number; y1: number; x2: number; y2: number }[] } | null;
  cameraRef: React.RefObject<MapCamera | null>;
  onSelectMarker: (marker: Marker) => void;
  onUnavailable: (reason: string) => void;
  onReady: () => void;
};
export default function MapScene3D(props: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const latest = useRef(props);
  const repaint = useRef<(() => void) | null>(null);
  const changeAppearance = useRef<(() => void) | null>(null);
  const changeQuality = useRef<(() => void) | null>(null);
  const [quality, setQuality] = useState<QualityChoice>('auto');
  const qualityChoice = useRef(quality);
  useLayoutEffect(() => {
    qualityChoice.current = quality;
    changeQuality.current?.();
  }, [quality]);
  const [terrainStyle, setTerrainStyle] = useState<'relief' | 'atlas'>('relief');
  const [contours, setContours] = useState(false);
  const appearance = useRef({ terrainStyle, contours });
  useLayoutEffect(() => {
    appearance.current = { terrainStyle, contours };
    changeAppearance.current?.();
  }, [terrainStyle, contours]);
  const mapKey = JSON.stringify(props.mapConfig);
  const gridKey = JSON.stringify(props.gridOverlay);
  const map = useMemo(() => JSON.parse(mapKey) as MapBounds, [mapKey]);
  const gridOverlay = useMemo(() => JSON.parse(gridKey) as Props['gridOverlay'], [gridKey]);
  const { mapName, layout, cameraRef } = props;
  const commands = useRef<MapCamera | null>(null);
  useImperativeHandle(
    cameraRef,
    () => ({
      zoom: (factor) => commands.current?.zoom(factor),
      fit: () => commands.current?.fit(),
      focus: (marker) => commands.current?.focus(marker),
      north: () => commands.current?.north(),
      top: () => commands.current?.top(),
    }),
    [],
  );
  useLayoutEffect(() => {
    latest.current = props;
    repaint.current?.();
  });
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const controller = new AbortController();
    const { signal } = controller;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    } catch {
      latest.current.onUnavailable('WebGL2 is unavailable');
      return;
    }
    const gl = renderer.getContext();
    const debug = gl.getExtension('WEBGL_debug_renderer_info');
    const gpuName = debug ? String(gl.getParameter(debug.UNMASKED_RENDERER_WEBGL)) : '';
    const device = {
      software: /swiftshader|llvmpipe|software|softpipe|microsoft basic render/i.test(gpuName),
      mobile: window.matchMedia('(pointer: coarse)').matches,
      maxTextureSize: renderer.capabilities.maxTextureSize,
      pixelRatio: window.devicePixelRatio || 1,
    };
    let profile = renderQuality(qualityChoice.current, device);
    renderer.setPixelRatio(profile.pixelRatio);
    host.dataset.renderQuality = profile.level;
    host.prepend(renderer.domElement);
    renderer.domElement.setAttribute('aria-label', '3D terrain');
    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#b8a387');
    const extent = Math.max(map.maxX - map.minX, map.maxY - map.minY) / 100;
    scene.fog = new THREE.FogExp2('#b8a387', 0.18 / extent);
    const camera = new THREE.PerspectiveCamera(45, 1, Math.max(0.5, extent / 100000), extent * 12);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.maxPolarAngle = Math.PI * 0.48;
    controls.minDistance = extent / 2000;
    controls.maxDistance = extent * 3;
    controls.screenSpacePanning = false;
    const fit = () => {
      controls.target.set(0, 0, 0);
      const distance = (extent * 1.2) / Math.min(1, camera.aspect);
      controls.maxDistance = distance * 3;
      camera.far = distance * 12;
      camera.updateProjectionMatrix();
      camera.position.set(0, distance * 0.85, distance * 0.85);
      controls.update();
    };
    commands.current = {
      fit,
      zoom: (factor) => {
        camera.position
          .sub(controls.target)
          .multiplyScalar(1 / factor)
          .add(controls.target);
        controls.update();
      },
      focus: (marker) => {
        const x = getCoordinate(marker, 'x'),
          y = getCoordinate(marker, 'y');
        if (!surface || !Number.isFinite(x + y)) return;
        const z = surfaceHeight(surface, x, y) ?? surface.minZ;
        controls.target.copy(terrainPoint(x, y, z, map));
        const distance = marker.type === 'vehicle' ? 85 : marker.type === 'base' ? 240 : 500;
        camera.position.copy(controls.target).add(new THREE.Vector3(0, distance * 0.75, distance));
        controls.update();
      },
      north: () => {
        const distance = camera.position.distanceTo(controls.target);
        camera.position.copy(controls.target).add(new THREE.Vector3(0, distance * 0.65, distance * 0.76));
        controls.update();
      },
      top: () => {
        const distance = camera.position.distanceTo(controls.target);
        camera.position.copy(controls.target).add(new THREE.Vector3(0, distance, 0.01));
        controls.update();
      },
    };
    scene.add(new THREE.HemisphereLight(0xe2eff5, 0x8a6746, 1.7));
    const sun = new THREE.DirectionalLight(0xffedca, 2.2);
    sun.position.set(-extent, extent * 2, -extent);
    scene.add(sun);
    let surface: Awaited<ReturnType<typeof loadHeightSurface>> | null = null;
    let groundMesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial> | null = null;
    let grid: THREE.LineSegments | null = null;
    const { material, uniforms } = createMapMaterial();
    let models: SceneModels | null = null;
    let pendingPaint = 0;
    const schedulePaint = () => {
      if (!pendingPaint && !signal.aborted)
        pendingPaint = requestAnimationFrame(() => {
          pendingPaint = 0;
          paint();
        });
    };
    let texture: THREE.Texture | null = null;
    let textureSize = profile.textureSize;
    let detailsMaterial: THREE.Material | null = null;
    let detailsGroup: THREE.Group | null = null;
    const fail = () => latest.current.onUnavailable('terrain could not be loaded');
    const lost = (event: Event) => {
      event.preventDefault();
      latest.current.onUnavailable('graphics context lost');
    };
    renderer.domElement.addEventListener('webglcontextlost', lost);
    Promise.all([
      loadHeightSurface(mapName, layout, signal),
      loadMapTexture(mapName, signal, profile.textureSize).then((image) => {
        if (signal.aborted) image.dispose();
        else texture = image;
        return image;
      }),
      mapName === 'DeepDesert'
        ? Promise.all([loadSharedAssets(undefined, signal), loadLayoutAssets(layout, undefined, signal)])
        : null,
    ])
      .then(([data, image, details]) => {
        if (signal.aborted) {
          image.dispose();
          return;
        }
        surface = data;
        texture = image;
        material.map = appearance.current.terrainStyle === 'atlas' ? image : null;
        material.color.set(0xffffff);
        material.needsUpdate = true;
        const ground = createSurfaceGeometry(data, map, profile.gridSize);
        colorSurface(ground, data);
        groundMesh = new THREE.Mesh(ground, material);
        scene.add(groundMesh);
        image.anisotropy = Math.min(16, renderer.capabilities.getMaxAnisotropy());
        models = new SceneModels(map, data, signal, schedulePaint);
        scene.add(models.group);
        if (details) {
          const built = createDesertDetails(details[0], details[1], map);
          detailsMaterial = built.material;
          detailsGroup = built.group;
          scene.add(built.group);
        }
        if (gridOverlay) {
          const positions: number[] = [];
          const world = (px: number, py: number) => ({
            x: map.minX + (px / map.width) * (map.maxX - map.minX),
            y: map.minY + (map.flipY ? 1 - py / map.height : py / map.height) * (map.maxY - map.minY),
          });
          for (const line of gridOverlay.lines)
            for (let i = 0; i < 128; i++) {
              for (const t of [i / 128, (i + 1) / 128]) {
                const p = world(line.x1 + (line.x2 - line.x1) * t, line.y1 + (line.y2 - line.y1) * t);
                terrainPoint(p.x, p.y, (surfaceHeight(data, p.x, p.y) ?? data.minZ) + 250, map).toArray(
                  positions,
                  positions.length,
                );
              }
            }
          grid = new THREE.LineSegments(
            new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(positions, 3)),
            new THREE.LineBasicMaterial({ color: 0xe1b267, transparent: true, opacity: 0.55 }),
          );
          scene.add(grid);
        }
        latest.current.onReady();
        host.dataset.sceneState = 'ready';
        changeQuality.current?.();
        paint();
      })
      .catch(() => {
        if (!signal.aborted) fail();
      });
    const projected = new WeakSet<HTMLElement>();
    const projectMarkers = (smooth = false) => {
      if (signal.aborted) return;
      const children = overlayRef.current?.children;
      if (!children || !surface) return;
      const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      latest.current.markers.forEach((marker, index) => {
        const element = children[index] as HTMLElement | undefined;
        if (!element) return;
        const x = getCoordinate(marker, 'x'),
          y = getCoordinate(marker, 'y');
        const point = worldToMapPoint(marker, map);
        const model = models?.state(marker, index);
        element.dataset.modelState = model?.state ?? '';
        element.dataset.modelVisible = String(model?.visible ?? false);
        if (model?.state === 'unavailable')
          element.setAttribute('aria-description', 'Building model unavailable; location marker retained.');
        else if (model?.state === 'partial')
          element.setAttribute('aria-description', 'Some building pieces are unavailable.');
        else element.removeAttribute('aria-description');
        const h = surfaceHeight(surface!, x, y);
        const position = terrainPoint(x, y, (h ?? surface!.minZ) + 500, map).project(camera);
        const visible =
          point?.inBounds &&
          position.z >= -1 &&
          position.z <= 1 &&
          Math.abs(position.x) <= 1 &&
          Math.abs(position.y) <= 1;
        element.style.transition =
          smooth && marker.realtime && projected.has(element) && !reducedMotion
            ? 'left 1800ms linear, top 1800ms linear'
            : 'none';
        projected.add(element);
        element.style.display = visible ? '' : 'none';
        element.style.left = `${((position.x + 1) / 2) * host.clientWidth}px`;
        element.style.top = `${((1 - position.y) / 2) * host.clientHeight}px`;
      });
    };
    const paint = () => {
      if (signal.aborted) return;
      if (grid) grid.visible = latest.current.showSectorGrid;
      models?.sync(latest.current.markers);
      models?.updateView(camera);
      if (detailsGroup)
        updateDesertDetails(detailsGroup, camera, host.clientHeight, profile.rockTriangles, profile.minRockPixels);
      renderer.render(scene, camera);
      projectMarkers();
      const heading =
        (Math.atan2(camera.position.x - controls.target.x, camera.position.z - controls.target.z) * 180) / Math.PI;
      const hud = host.querySelector<HTMLElement>('[data-map-hud]');
      const arrow = hud?.querySelector<HTMLElement>('[data-compass-arrow]');
      if (arrow) arrow.style.transform = `rotate(${-heading}deg)`;
      const ray = new THREE.Raycaster(),
        plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -controls.target.y);
      const a = new THREE.Vector3(),
        b = new THREE.Vector3();
      ray.setFromCamera(new THREE.Vector2(-0.8, -0.8), camera);
      const hitA = ray.ray.intersectPlane(plane, a);
      ray.setFromCamera(new THREE.Vector2(-0.4, -0.8), camera);
      const hitB = ray.ray.intersectPlane(plane, b);
      if (hitA && hitB) {
        const perPixel = a.distanceTo(b) / (0.2 * host.clientWidth),
          scale = niceScale(perPixel * 100);
        const label = hud?.querySelector<HTMLElement>('[data-scale-label]'),
          line = hud?.querySelector<HTMLElement>('[data-scale-line]');
        if (label) label.textContent = scale.label;
        if (line) line.style.width = `${Math.max(1, scale.metres / perPixel)}px`;
      }
    };
    const resize = () => {
      const width = host.clientWidth,
        height = host.clientHeight;
      if (!width || !height) return;
      renderer.setSize(width, height);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      paint();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(host);
    resize();
    fit();
    controls.addEventListener('change', paint);
    let textureRequest = 0;
    changeQuality.current = () => {
      const next = renderQuality(qualityChoice.current, device);
      if (surface && groundMesh && next.gridSize !== profile.gridSize) {
        const geometry = createSurfaceGeometry(surface, map, next.gridSize);
        colorSurface(geometry, surface);
        groundMesh.geometry.dispose();
        groundMesh.geometry = geometry;
      }
      profile = next;
      uniforms.detail.value = profile.level === 'low' ? 0 : 1;
      host.dataset.renderQuality = profile.level;
      renderer.setPixelRatio(profile.pixelRatio);
      if (surface && texture && textureSize !== profile.textureSize) {
        const request = ++textureRequest;
        const requestedSize = profile.textureSize;
        void loadMapTexture(mapName, signal, profile.textureSize)
          .then((image) => {
            if (signal.aborted || request !== textureRequest) {
              image.dispose();
              return;
            }
            image.anisotropy = Math.min(16, renderer.capabilities.getMaxAnisotropy());
            texture?.dispose();
            texture = image;
            textureSize = requestedSize;
            material.map = appearance.current.terrainStyle === 'atlas' ? image : null;
            material.needsUpdate = true;
            schedulePaint();
          })
          .catch(() => {
            /* Keep the current texture if a quality upgrade fails. */
          });
      } else ++textureRequest;
      resize();
    };
    uniforms.detail.value = profile.level === 'low' ? 0 : 1;
    // Render on demand: live samples and legend changes do not need a permanent GPU loop.
    repaint.current = () => {
      const modelChanged = models?.sync(latest.current.markers);
      const visibilityChanged = models?.updateView(camera);
      if (modelChanged || visibilityChanged || (grid && grid.visible !== latest.current.showSectorGrid)) paint();
      else projectMarkers(true);
    };
    changeAppearance.current = () => {
      const atlas = appearance.current.terrainStyle === 'atlas';
      material.map = atlas ? texture : null;
      material.vertexColors = !atlas;
      uniforms.relief.value = atlas ? 0 : 1;
      uniforms.contours.value = appearance.current.contours ? 1 : 0;
      material.needsUpdate = true;
      paint();
    };
    const raycaster = new THREE.Raycaster();
    let down: { x: number; y: number } | null = null;
    const pointerDown = (e: PointerEvent) => {
      down = e.button === 0 ? { x: e.clientX, y: e.clientY } : null;
    };
    const pointerUp = (e: PointerEvent) => {
      if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 5) {
        down = null;
        return;
      }
      down = null;
      const rect = renderer.domElement.getBoundingClientRect();
      raycaster.setFromCamera(
        new THREE.Vector2(
          ((e.clientX - rect.left) / rect.width) * 2 - 1,
          1 - ((e.clientY - rect.top) / rect.height) * 2,
        ),
        camera,
      );
      const marker = models?.pick(raycaster);
      if (marker) latest.current.onSelectMarker(marker);
    };
    renderer.domElement.addEventListener('pointerdown', pointerDown);
    renderer.domElement.addEventListener('pointerup', pointerUp);
    return () => {
      controller.abort();
      if (pendingPaint) cancelAnimationFrame(pendingPaint);
      repaint.current = null;
      changeAppearance.current = null;
      changeQuality.current = null;
      observer.disconnect();
      commands.current = null;
      controls.removeEventListener('change', paint);
      controls.dispose();
      renderer.domElement.removeEventListener('webglcontextlost', lost);
      renderer.domElement.removeEventListener('pointerdown', pointerDown);
      renderer.domElement.removeEventListener('pointerup', pointerUp);
      if (models) {
        scene.remove(models.group);
        models.dispose();
      }
      scene.traverse((object) => {
        if (object instanceof THREE.Mesh || object instanceof THREE.LineSegments) object.geometry.dispose();
        if (object instanceof THREE.InstancedMesh) object.dispose();
      });
      if (grid) (grid.material as THREE.Material).dispose();
      material.dispose();
      detailsMaterial?.dispose();
      texture?.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [mapName, layout, map, gridOverlay]);
  return (
    <div
      ref={hostRef}
      data-map-view="3d"
      style={{ position: 'absolute', inset: 0, overflow: 'hidden', touchAction: 'none' }}
      onMouseDown={(e) => e.stopPropagation()}
      onWheel={(e) => e.stopPropagation()}
    >
      <div ref={overlayRef} style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
        {props.markers.map((marker, index) => (
          <MapMarker
            key={markerKey(marker, index)}
            marker={marker}
            index={index}
            point={{ px: -1000, py: -1000, x: getCoordinate(marker, 'x'), y: getCoordinate(marker, 'y') }}
            zoom={1}
            onSelect={props.onSelectMarker}
          />
        ))}
      </div>
      <MapHud
        markers={props.markers}
        onLocate={(marker) => {
          commands.current?.focus(marker);
          latest.current.onSelectMarker(marker);
        }}
        style={terrainStyle}
        contours={contours}
        quality={quality}
        onQuality={setQuality}
        onStyle={setTerrainStyle}
        onContours={() => setContours((v) => !v)}
        onTop={() => commands.current?.top()}
        onNorth={() => commands.current?.north()}
        onFullscreen={() => {
          const target = hostRef.current?.closest('[data-map-workspace]');
          if (document.fullscreenElement) void document.exitFullscreen();
          else if (target?.requestFullscreen) void target.requestFullscreen().catch(() => {});
        }}
      />
    </div>
  );
}
