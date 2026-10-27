import * as THREE from 'three';
import { fetchBaseModelExport } from '../../bases/utils/model-export';
import { BuildingLibrary } from './buildingModels';
import { createVehicleModel, disposeVehicleModels, vehicleKind } from './vehicleModels';
import { createSandwormModel } from './sandwormModel';
import { createWorldModel, worldModelKind, WORLD_MODEL_LIMIT } from './worldModels';
import { markerKey } from '../utils/markers';
import { getCoordinate } from '../utils/mapData';
import { surfaceHeight, type HeightSurface } from './heightSurface';
import { terrainPoint, type MapBounds } from './sceneGeometry';
export type ModelMarker = Record<string, unknown>;
type Entry = {
  marker: ModelMarker;
  object: THREE.Group | null;
  state: 'idle' | 'loading' | 'ready' | 'partial' | 'unavailable';
  signature: string;
  visible: boolean;
  prominent: boolean;
  lastSeen: number;
};
const numeric = (v: unknown) =>
  v !== null && v !== undefined && v !== '' && Number.isFinite(Number(v)) ? Number(v) : null;
export class SceneModels {
  readonly group = new THREE.Group();
  private entries = new Map<string, Entry>();
  private library = new BuildingLibrary();
  private prototypes = new Map<string, THREE.Group>();
  private inflight = 0;
  private disposed = false;
  private pickable: THREE.Object3D[] = [];
  private activeKeys = new Set<string>();
  constructor(
    private map: MapBounds,
    private surface: HeightSurface,
    private signal: AbortSignal,
    private changed: () => void,
    private groundHeight: (x: number, y: number) => number | null = (x, y) => surfaceHeight(surface, x, y),
  ) {}
  sync(markers: ModelMarker[]) {
    let changed = false;
    const seen = new Set<string>();
    let worms = 0;
    for (const [i, marker] of markers.entries()) {
      const worldKind = worldModelKind(marker);
      if (!worldKind && marker.type !== 'base' && marker.type !== 'vehicle' && marker.type !== 'worm') continue;
      if (marker.type === 'worm' && worms++ >= 32) continue;
      const x = getCoordinate(marker, 'x'),
        y = getCoordinate(marker, 'y');
      if (!Number.isFinite(x + y)) continue;
      const key = markerKey(marker, i);
      seen.add(key);
      const wormGround = marker.type === 'worm' ? this.groundHeight(x, y) : undefined;
      const signature = JSON.stringify([x, y, marker.z, marker.subtype, marker.yaw, marker.rotation, wormGround]);
      let entry = this.entries.get(key);
      if (!entry) {
        entry = {
          marker,
          object: null,
          state: 'idle',
          signature: '',
          visible: false,
          prominent: false,
          lastSeen: Date.now(),
        };
        this.entries.set(key, entry);
      }
      entry.marker = marker;
      entry.lastSeen = Date.now();
      if (entry.signature === signature) continue;
      if (worldKind) {
        if (entry.object) this.dropWorldModel(entry);
        entry.signature = signature;
        continue;
      }
      if (marker.type === 'worm') {
        const hadPosition = entry.state === 'ready';
        if (!this.prototypes.has('worm')) this.prototypes.set('worm', createSandwormModel());
        if (!entry.object) {
          entry.object = this.prototypes.get('worm')!.clone(true);
          entry.object.visible = false;
          this.group.add(entry.object);
        }
        const ground = wormGround;
        if (ground === null || ground === undefined) {
          entry.state = 'unavailable';
          entry.signature = signature;
          continue;
        }
        const oldPosition = entry.object.position.clone();
        entry.object.position.copy(terrainPoint(x, y, ground, this.map));
        const delta = entry.object.position.clone().sub(oldPosition);
        if (hadPosition && Math.hypot(delta.x, delta.z) > 0.1)
          entry.object.rotation.set(0, Math.atan2(-delta.x, -delta.z), 0);
        entry.state = 'ready';
        entry.signature = signature;
        changed ||= entry.object.visible;
        continue;
      }
      if (entry.signature && marker.type === 'vehicle' && entry.object) {
        this.group.remove(entry.object);
        entry.object = null;
      }
      entry.signature = signature;
      if (marker.type === 'vehicle') {
        const kind = vehicleKind(marker.subtype);
        if (!this.prototypes.has(kind)) this.prototypes.set(kind, createVehicleModel(marker.subtype));
        entry.object = this.prototypes.get(kind)!.clone(true);
        const ground = surfaceHeight(this.surface, x, y) ?? this.surface.minZ;
        entry.object.position.copy(terrainPoint(x, y, Math.max(ground, numeric(marker.z) ?? ground), this.map));
        const rot =
          typeof marker.rotation === 'object' && marker.rotation
            ? (marker.rotation as Record<string, unknown>).yaw
            : marker.rotation;
        entry.object.rotation.y = (-(numeric(marker.yaw) ?? numeric(rot) ?? 0) * Math.PI) / 180;
        entry.state = 'ready';
        this.group.add(entry.object);
        changed = true;
      }
    }
    for (const [key, entry] of this.entries) {
      if (!seen.has(key) && worldModelKind(entry.marker) && entry.object) {
        this.dropWorldModel(entry);
        changed = true;
      }
      if (!seen.has(key) && entry.object?.visible) {
        entry.object.visible = false;
        entry.visible = false;
        changed = true;
      }
    }
    // Dev note: only a dozen fortresses fit in this carry-on; old models leave before new ones arrive.
    const inactive = [...this.entries]
      .filter(([key, e]) => !seen.has(key) && e.state !== 'loading')
      .sort((a, b) => a[1].lastSeen - b[1].lastSeen);
    for (const [key, e] of inactive.slice(0, Math.max(0, this.entries.size - 32))) {
      if (e.object) {
        this.group.remove(e.object);
        e.object.traverse((o) => {
          if (o instanceof THREE.InstancedMesh) o.dispose();
        });
      }
      this.entries.delete(key);
    }
    this.pickable = [...seen].flatMap((key) => this.entries.get(key)?.object ?? []);
    this.activeKeys = seen;
    return changed;
  }
  updateView(camera: THREE.Camera) {
    const active = new Set(this.pickable);
    let changed = false;
    const nearby = [...this.entries]
      .flatMap(([key, entry]) => {
        if (!this.activeKeys.has(key) || !worldModelKind(entry.marker)) return [];
        const x = getCoordinate(entry.marker, 'x'),
          y = getCoordinate(entry.marker, 'y');
        const h = this.groundHeight(x, y);
        if (h === null) return [];
        const distance = camera.position.distanceTo(terrainPoint(x, y, h, this.map));
        return distance < (worldModelKind(entry.marker) === 'shipwreck' ? 3200 : 1800) ? [{ key, distance }] : [];
      })
      .sort((a, b) => a.distance - b.distance);
    const worldKeys = new Set(nearby.slice(0, WORLD_MODEL_LIMIT).map(({ key }) => key));
    for (const [key, entry] of this.entries) {
      if (!this.activeKeys.has(key)) continue;
      const worldKind = worldModelKind(entry.marker);
      if (worldKind) {
        if (!worldKeys.has(key)) {
          if (entry.object) {
            this.dropWorldModel(entry);
            changed = true;
          }
          continue;
        }
        const x = getCoordinate(entry.marker, 'x'),
          y = getCoordinate(entry.marker, 'y');
        const ground = this.groundHeight(x, y);
        if (ground === null) continue;
        if (!entry.object) {
          entry.object = createWorldModel(worldKind, entry.marker.subtype, (dx, dz) => {
            const h = this.groundHeight(x + dx * 100, y + dz * 100);
            return h === null ? null : (h - ground) / 100;
          });
          entry.object.position.copy(terrainPoint(x, y, ground, this.map));
          this.group.add(entry.object);
          entry.state = entry.object.children.length ? 'ready' : 'unavailable';
          changed = true;
        }
        entry.object.visible = entry.state === 'ready';
        entry.visible = entry.object.visible;
        entry.prominent =
          entry.visible && camera.position.distanceTo(entry.object.position) < (worldKind === 'shipwreck' ? 900 : 650);
        continue;
      }
      const marker = entry.marker,
        x = getCoordinate(marker, 'x'),
        y = getCoordinate(marker, 'y');
      const ground = surfaceHeight(this.surface, x, y) ?? this.surface.minZ;
      const distance = camera.position.distanceTo(entry.object?.position ?? terrainPoint(x, y, ground, this.map));
      if (marker.type === 'base' && entry.state === 'idle' && this.inflight < 2) void this.loadBase(entry);
      if (entry.object) {
        const visible =
          active.has(entry.object) &&
          entry.state !== 'unavailable' &&
          (marker.type === 'base' || distance < (marker.type === 'worm' ? 6000 : 1400));
        if (visible !== entry.object.visible) {
          entry.object.visible = visible;
          changed = true;
        }
        entry.visible = visible;
        entry.prominent = visible && distance < (marker.type === 'base' ? 3000 : marker.type === 'worm' ? 1800 : 1400);
      }
    }
    this.pickable = [...this.activeKeys].flatMap((key) => this.entries.get(key)?.object ?? []);
    return changed;
  }
  private dropWorldModel(entry: Entry) {
    if (entry.object) {
      this.group.remove(entry.object);
      disposeVehicleModels([entry.object]);
    }
    entry.object = null;
    entry.state = 'idle';
    entry.visible = false;
    entry.prominent = false;
  }
  /** A detail change replaces terrain triangles; rebuild only the bounded nearby patches. */
  refreshTerrain() {
    for (const entry of this.entries.values()) if (worldModelKind(entry.marker)) this.dropWorldModel(entry);
  }
  private async loadBase(entry: Entry) {
    entry.state = 'loading';
    this.inflight++;
    try {
      const id = String(entry.marker.base_id ?? entry.marker.id ?? '');
      if (!id || id.length > 128) throw new Error('Missing base ID');
      const built = await this.library.build(await fetchBaseModelExport(id, this.signal));
      if (this.disposed || this.signal.aborted) {
        built.group.traverse((o) => {
          if (o instanceof THREE.InstancedMesh) o.dispose();
        });
        return;
      }
      const x = built.origin[0] ?? getCoordinate(entry.marker, 'x'),
        y = built.origin[1] ?? getCoordinate(entry.marker, 'y');
      const z = built.origin[2] ?? numeric(entry.marker.z) ?? surfaceHeight(this.surface, x, y) ?? this.surface.minZ;
      entry.object = built.group;
      entry.object.position.copy(terrainPoint(x, y, z, this.map));
      entry.object.visible = false;
      entry.state = built.pieces === built.total ? 'ready' : 'partial';
      this.group.add(entry.object);
    } catch {
      if (!this.disposed) entry.state = 'unavailable';
    } finally {
      this.inflight--;
      if (!this.disposed) this.changed();
    }
  }
  state(marker: ModelMarker, index: number) {
    const e = this.entries.get(markerKey(marker, index));
    return {
      state: e?.state ?? '',
      visible: e?.visible ?? false,
      prominent: e?.visible && e.prominent,
      kind: worldModelKind(marker) ?? '',
    };
  }
  pick(raycaster: THREE.Raycaster) {
    const hits = raycaster.intersectObjects(
      this.pickable.filter((o) => o.visible),
      true,
    );
    for (const hit of hits) {
      for (const e of this.entries.values()) {
        let o: THREE.Object3D | null = hit.object;
        while (o) {
          if (o === e.object) return e.marker;
          o = o.parent;
        }
      }
    }
    return null;
  }
  dispose() {
    this.disposed = true;
    this.group.traverse((o) => {
      if (o instanceof THREE.InstancedMesh) o.dispose();
    });
    for (const entry of this.entries.values()) if (worldModelKind(entry.marker)) this.dropWorldModel(entry);
    this.group.clear();
    this.library.dispose();
    disposeVehicleModels(this.prototypes.values());
    this.entries.clear();
    this.prototypes.clear();
  }
}
