/**
 * Verified fleet read model for N031, N033, N034 and N035. Pure and browser-safe: the server normalizes Console
 * rows from `unknown` into this shape, and the browser only ranks, compares and labels it. Missing readings stay
 * null and are reported as unknown; they never become 0% or 100%.
 */
import type { Manifest, Thresholds } from '../expeditions/model';
import { isMapName, MAP_LABELS } from '../map/maps';

export type Lifecycle = 'deployed' | 'in-transit' | 'stored-backup' | 'stored-recovery' | 'unknown';

export interface FleetComponent {
  name: string;
  templateId: string;
  conditionPercent: number | null;
  estimated: boolean;
}

export interface FleetVehicle {
  id: string;
  name: string;
  type: string;
  relationship: 'owner' | 'co-owner' | 'associate';
  conditionPercent: number | null;
  conditionEstimated: boolean;
  fuelPercent: number | null;
  components: FleetComponent[];
  componentsLimited: boolean;
  lifecycle: Lifecycle;
  storedAt: string | null;
  map: string | null;
  region: string | null;
  sector: string | null;
  position: { x: number; y: number } | null;
}

export interface FleetReport {
  vehicles: FleetVehicle[];
  excluded: number;
  limited: boolean;
  observedAt: string;
}

export const FLEET_LIMITS = { vehicles: 20, components: 24 } as const;

type Raw = Record<string, unknown>;
const record = (value: unknown): Raw =>
  value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as Raw) : {};
const text = (value: unknown, max = 120): string | null =>
  typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : null;
function finite(value: unknown): number | null {
  if (value === null || value === undefined || value === '' || typeof value === 'boolean') return null;
  const number = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : Number.NaN;
  return Number.isFinite(number) ? number : null;
}
function percent(value: unknown): number | null {
  const number = finite(value);
  return number === null || number < 0 || number > 100 ? null : Math.round(number * 10) / 10;
}

export function lifecycleFrom(value: unknown): Lifecycle {
  const state = text(value)?.toLowerCase();
  if (!state) return 'unknown';
  if (state === 'default') return 'deployed';
  if (state === 'travel') return 'in-transit';
  if (state === 'vehiclebackup') return 'stored-backup';
  if (state === 'vehiclerecovery') return 'stored-recovery';
  return 'unknown';
}

export const LIFECYCLE_LABELS: Record<Lifecycle, string> = {
  deployed: 'Deployed',
  'in-transit': 'In transit',
  'stored-backup': 'Stored (vehicle backup)',
  'stored-recovery': 'Stored for recovery',
  unknown: 'State not reported',
};

/** Normalizes one Console vehicle row; the caller has already verified the roster rank. */
export function normalizeFleetRow(value: unknown, id: string, rank: 1 | 2 | 3): FleetVehicle {
  const raw = record(value);
  const modules = Array.isArray(raw.modules) ? raw.modules : [];
  const components = modules.slice(0, FLEET_LIMITS.components).map((entry): FleetComponent => {
    const part = record(entry);
    return {
      name: text(part.name) ?? text(part.templateId) ?? 'Unnamed component',
      templateId: text(part.templateId, 128) ?? '',
      conditionPercent: percent(part.conditionPercent),
      estimated: part.maxInferred === true,
    };
  });
  const lifecycle = lifecycleFrom(raw.lifecycle_state);
  const x = finite(raw.x);
  const y = finite(raw.y);
  const map = text(raw.map, 64);
  // A stored or in-transit vehicle's coordinates are a last record, not a deployed position; a null partition
  // means Funcom has not deployed it into a current world partition.
  const deployed = lifecycle === 'deployed' || (lifecycle === 'unknown' && finite(raw.partition_id) !== null);
  return {
    id,
    name: text(raw.name, 200) ?? `Vehicle #${id}`,
    type: text(raw.type) ?? 'Unknown',
    relationship: rank === 1 ? 'owner' : rank === 2 ? 'co-owner' : 'associate',
    conditionPercent: percent(raw.condition_percent),
    conditionEstimated: raw.condition_estimated === true || components.some((component) => component.estimated),
    fuelPercent: percent(raw.fuel_percent),
    components,
    componentsLimited: modules.length > FLEET_LIMITS.components,
    lifecycle,
    storedAt: lifecycle === 'stored-recovery' ? isoOrNull(raw.stored_at) : null,
    map,
    region: text(raw.region, 80),
    sector: text(raw.sector, 4),
    position: x !== null && y !== null && map && deployed ? { x, y } : null,
  };
}

function isoOrNull(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const time = Date.parse(value);
  return Number.isFinite(time) ? new Date(time).toISOString() : null;
}

export function mapLabel(map: string | null): string {
  if (!map) return 'Map not reported';
  return isMapName(map) ? MAP_LABELS[map] : map;
}

export interface MaintenanceItem {
  vehicle: FleetVehicle;
  reasons: string[];
  severity: 'urgent' | 'watch' | 'unknown';
  weakest: FleetComponent | null;
}

export function weakestComponent(vehicle: FleetVehicle): FleetComponent | null {
  let weakest: FleetComponent | null = null;
  for (const component of vehicle.components) {
    if (component.conditionPercent === null) continue;
    if (!weakest || component.conditionPercent < (weakest.conditionPercent ?? 101)) weakest = component;
  }
  return weakest;
}

/**
 * N031: vehicles needing attention, ordered by lowest reported fuel, then lowest component condition.
 * Containers without fuel and vehicles with unknown readings are listed separately as unknown, never as healthy.
 */
export function maintenanceInbox(vehicles: FleetVehicle[], thresholds: Thresholds): MaintenanceItem[] {
  const items: MaintenanceItem[] = [];
  for (const vehicle of vehicles) {
    const weakest = weakestComponent(vehicle);
    const condition = weakest?.conditionPercent ?? vehicle.conditionPercent;
    const reasons: string[] = [];
    let severity: MaintenanceItem['severity'] | null = null;
    if (vehicle.fuelPercent !== null && vehicle.fuelPercent <= thresholds.fuelPercent) {
      reasons.push(`Fuel ${vehicle.fuelPercent}% (at or below ${thresholds.fuelPercent}%)`);
      severity = 'urgent';
    }
    if (condition !== null && condition <= thresholds.conditionPercent) {
      reasons.push(
        `${weakest ? weakest.name : 'Lowest component'} at ${condition}%${vehicle.conditionEstimated ? ' (estimated maximum)' : ''}`,
      );
      severity = condition <= thresholds.conditionPercent / 2 ? 'urgent' : (severity ?? 'watch');
    }
    if (!severity && (vehicle.fuelPercent === null || condition === null)) {
      if (vehicle.fuelPercent === null) reasons.push('Fuel reading unknown');
      if (condition === null) reasons.push('Component condition unknown');
      severity = 'unknown';
    }
    if (severity) items.push({ vehicle, reasons, severity, weakest });
  }
  const order = { urgent: 0, watch: 1, unknown: 2 } as const;
  const known = (value: number | null) => (value === null ? 101 : value);
  return items.sort(
    (a, b) =>
      order[a.severity] - order[b.severity] ||
      known(a.vehicle.fuelPercent) - known(b.vehicle.fuelPercent) ||
      known(a.weakest?.conditionPercent ?? a.vehicle.conditionPercent) -
        known(b.weakest?.conditionPercent ?? b.vehicle.conditionPercent) ||
      a.vehicle.name.localeCompare(b.vehicle.name),
  );
}

export interface ComponentComparisonRow {
  name: string;
  readings: Array<{ vehicleId: string; percent: number | null; estimated: boolean; weakest: boolean }>;
}

/** N033: one row per component name across the chosen vehicles, flagging the weakest reported reading. */
export function compareComponents(vehicles: FleetVehicle[]): ComponentComparisonRow[] {
  const names = [...new Set(vehicles.flatMap((vehicle) => vehicle.components.map((component) => component.name)))];
  return names
    .map((name) => {
      const readings = vehicles.map((vehicle) => {
        const matches = vehicle.components.filter((component) => component.name === name);
        const known = matches.filter((component) => component.conditionPercent !== null);
        const lowest = known.reduce<FleetComponent | null>(
          (low, component) =>
            !low || (component.conditionPercent ?? 101) < (low.conditionPercent ?? 101) ? component : low,
          null,
        );
        return {
          vehicleId: vehicle.id,
          percent: lowest?.conditionPercent ?? null,
          estimated: lowest?.estimated ?? false,
          weakest: false,
        };
      });
      const reported = readings.filter((reading) => reading.percent !== null);
      if (reported.length > 0) {
        const minimum = Math.min(...reported.map((reading) => reading.percent as number));
        for (const reading of readings) reading.weakest = reading.percent === minimum && reported.length > 1;
      }
      return { name, readings };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

export interface CargoTotal {
  templateId: string;
  name: string;
  quantity: string;
  exact: boolean;
}

export interface CargoReading {
  vehicleId: string;
  totals: CargoTotal[];
  usedSlots: number | null;
  maxSlots: number | null;
  currentVolume: number | null;
  maxVolume: number | null;
  volumeComplete: boolean;
  limited: boolean;
  observedAt: string;
}

export interface ManifestComparisonLine {
  templateId: string;
  name: string;
  wanted: string;
  loaded: string;
  shortfall: string;
  status: 'loaded' | 'short' | 'unknown';
}

/** N034: desired manifest versus a fresh cargo reading, in exact BigInt arithmetic. */
export function compareManifest(manifest: Manifest, cargo: CargoReading): ManifestComparisonLine[] {
  const totals = new Map(cargo.totals.map((total) => [total.templateId.toLowerCase(), total]));
  return manifest.lines.map((line) => {
    const total = totals.get(line.templateId.toLowerCase());
    const loaded = total ? BigInt(total.quantity) : 0n;
    const wanted = BigInt(line.quantity);
    const shortfall = wanted > loaded ? wanted - loaded : 0n;
    const exact = !cargo.limited && (total ? total.exact : true);
    return {
      templateId: line.templateId,
      name: line.name,
      wanted: String(wanted),
      loaded: String(loaded),
      shortfall: String(shortfall),
      status: shortfall === 0n ? 'loaded' : exact ? 'short' : 'unknown',
    };
  });
}
