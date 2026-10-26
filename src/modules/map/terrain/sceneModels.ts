import * as THREE from 'three';
import { BuildingLibrary } from './buildingModels';
import { createVehicleModel, disposeVehicleModels, vehicleKind } from './vehicleModels';
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
async function fetchBlueprint(id: string, signal: AbortSignal) {
  const response = await fetch(`/api/bases/${encodeURIComponent(id)}/export`, {
    signal: AbortSignal.any([signal, AbortSignal.timeout(12000)]),
    cache: 'no-store',
  });
  if (!response.ok || !response.body) throw new Error('Building unavailable');
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 2 * 1024 * 1024) throw new Error('Building export too large');
      chunks.push(value);
    }
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const c of chunks) {
    bytes.set(c, offset);
    offset += c.byteLength;
  }
  return JSON.parse(new TextDecoder().decode(bytes)) as unknown;
}
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
  ) {}
  sync(markers: ModelMarker[]) {
    let changed = false;
    const seen = new Set<string>();
    for (const [i, marker] of markers.entries()) {
      if (marker.type !== 'base' && marker.type !== 'vehicle') continue;
      const x = getCoordinate(marker, 'x'),
        y = getCoordinate(marker, 'y');
      if (!Number.isFinite(x + y)) continue;
      const key = markerKey(marker, i);
      seen.add(key);
      const signature = JSON.stringify([x, y, marker.z, marker.subtype, marker.yaw, marker.rotation]);
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
    for (const [key, entry] of this.entries) {
      if (!this.activeKeys.has(key)) continue;
      const marker = entry.marker,
        x = getCoordinate(marker, 'x'),
        y = getCoordinate(marker, 'y');
      const ground = surfaceHeight(this.surface, x, y) ?? this.surface.minZ;
      const distance = camera.position.distanceTo(entry.object?.position ?? terrainPoint(x, y, ground, this.map));
      if (marker.type === 'base' && entry.state === 'idle' && this.inflight < 2) void this.loadBase(entry);
      if (entry.object) {
        const visible = active.has(entry.object) && (marker.type === 'base' || distance < 1400);
        if (visible !== entry.object.visible) {
          entry.object.visible = visible;
          changed = true;
        }
        entry.visible = visible;
        entry.prominent = visible && distance < (marker.type === 'base' ? 3000 : 1400);
      }
    }
    return changed;
  }
  private async loadBase(entry: Entry) {
    entry.state = 'loading';
    this.inflight++;
    try {
      const id = String(entry.marker.base_id ?? entry.marker.id ?? '');
      if (!id || id.length > 128) throw new Error('Missing base ID');
      const built = await this.library.build(await fetchBlueprint(id, this.signal));
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
    return { state: e?.state ?? '', visible: e?.visible ?? false, prominent: e?.visible && e.prominent };
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
    this.group.clear();
    this.library.dispose();
    disposeVehicleModels(this.prototypes.values());
    this.entries.clear();
    this.prototypes.clear();
  }
}
