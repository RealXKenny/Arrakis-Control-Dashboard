'use client';
import { useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef } from 'react';
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

export type MapCamera = { zoom: (factor: number) => void; fit: () => void };
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
  const mapKey = JSON.stringify(props.mapConfig);
  const gridKey = JSON.stringify(props.gridOverlay);
  const map = useMemo(() => JSON.parse(mapKey) as MapBounds, [mapKey]);
  const gridOverlay = useMemo(() => JSON.parse(gridKey) as Props['gridOverlay'], [gridKey]);
  const { mapName, layout, cameraRef } = props;
  const commands = useRef<MapCamera | null>(null);
  useImperativeHandle(
    cameraRef,
    () => ({ zoom: (factor) => commands.current?.zoom(factor), fit: () => commands.current?.fit() }),
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
      renderer = new THREE.WebGLRenderer({ antialias: true });
    } catch {
      latest.current.onUnavailable('WebGL2 is unavailable');
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    host.prepend(renderer.domElement);
    renderer.domElement.setAttribute('aria-label', '3D terrain');
    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#211c18');
    const extent = Math.max(map.maxX - map.minX, map.maxY - map.minY) / 100;
    const camera = new THREE.PerspectiveCamera(45, 1, Math.max(0.5, extent / 100000), extent * 12);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.maxPolarAngle = Math.PI * 0.48;
    controls.minDistance = extent / 2000;
    controls.maxDistance = extent * 3;
    controls.screenSpacePanning = false;
    const fit = () => {
      controls.target.set(0, 0, 0);
      const distance = (extent * 1.5) / Math.min(1, camera.aspect);
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
    };
    scene.add(new THREE.HemisphereLight(0xfff0d8, 0x554430, 2));
    const sun = new THREE.DirectionalLight(0xffedd0, 2);
    sun.position.set(-extent, extent * 2, -extent);
    scene.add(sun);
    let surface: Awaited<ReturnType<typeof loadHeightSurface>> | null = null;
    let grid: THREE.LineSegments | null = null;
    const material = new THREE.MeshStandardMaterial({ color: 0xc4a578, roughness: 1, side: THREE.DoubleSide });
    let texture: THREE.Texture | null = null;
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
      loadMapTexture(mapName, signal).then((image) => {
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
        material.map = image;
        material.color.set(0xffffff);
        material.needsUpdate = true;
        scene.add(new THREE.Mesh(createSurfaceGeometry(data, map), material));
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
      if (detailsGroup) updateDesertDetails(detailsGroup, camera, host.clientHeight);
      renderer.render(scene, camera);
      projectMarkers();
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
    // Render on demand: live samples and legend changes do not need a permanent GPU loop.
    repaint.current = () => {
      if (grid && grid.visible !== latest.current.showSectorGrid) paint();
      else projectMarkers(true);
    };
    return () => {
      controller.abort();
      repaint.current = null;
      observer.disconnect();
      commands.current = null;
      controls.removeEventListener('change', paint);
      controls.dispose();
      renderer.domElement.removeEventListener('webglcontextlost', lost);
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
      <div
        style={{
          position: 'absolute',
          bottom: 12,
          left: 12,
          pointerEvents: 'none',
          fontSize: 11,
          color: '#ead6b5',
          background: '#211c18cc',
          padding: '5px 8px',
        }}
      >
        Drag to orbit · Right drag to pan · Scroll or pinch to zoom
      </div>
    </div>
  );
}
