/**
 * Vehicle normalisation. Pure and browser-safe: provider payloads arrive as `unknown`
 * and leave as a small, strict model the UI can trust.
 */

export type VehicleAccess = 'owned' | 'shared';

export interface VehicleStorage {
  used: number | null;
  max: number | null;
  unit: 'kg' | 'slots';
}

export interface Vehicle {
  id: string;
  name: string;
  type: string;
  owner: string;
  access: VehicleAccess;
  condition: number | null;
  /**
   * Structurally `null` for container vehicles (BP_ContainerVehicle): a container has
   * no fuel to show, so the fuel bar cannot be rendered by mistake.
   */
  fuel: { percent: number | null; current: number | null } | null;
  /** Only present for container vehicles. */
  storage: VehicleStorage | null;
  image: string | null;
}

type Raw = Record<string, unknown>;

const OWNED_RELATIONS = new Set(['owner', 'owned', 'self', 'own']);
const SHARED_RELATIONS = new Set(['shared', 'member', 'visitor', 'guest']);

const STORAGE_USED = ['storage_used', 'storageUsed', 'current_storage', 'currentStorage', 'used_slots', 'usedSlots'];
const STORAGE_MAX = [
  'storage_capacity',
  'storageCapacity',
  'max_storage',
  'maxStorage',
  'storage_max',
  'storageMax',
  'max_slots',
  'maxSlots',
  'slot_capacity',
  'slotCapacity',
  'capacity',
];
const WEIGHT_USED = ['current_weight', 'currentWeight', 'weight_used', 'weightUsed'];
const WEIGHT_MAX = ['max_weight', 'maxWeight', 'weight_capacity', 'weightCapacity'];

function rec(value: unknown): Raw {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as Raw) : {};
}

function text(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim().slice(0, 200);
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  }
  return '';
}

function num(...values: unknown[]): number | null {
  for (const value of values) {
    if (value === null || value === undefined || value === '' || typeof value === 'boolean') continue;
    const number = Number(value);
    if (Number.isFinite(number)) return number;
  }
  return null;
}

function readNumber(raw: Raw, keys: string[]): number | null {
  const nested = [raw, rec(raw.storage), rec(raw.inventory), rec(raw.cargo)];
  for (const key of keys) {
    const value = num(...nested.map((source) => source[key]));
    if (value !== null) return value;
  }
  return null;
}

/** Providers hide the vehicle list under assorted wrappers; walk them breadth-first. */
export function extractVehicleRows(payload: unknown): unknown[] {
  if (Array.isArray(payload)) return payload;
  // Dev note: a sandworm wraps responses less often than this API does.
  const queue: unknown[] = [payload];
  const seen = new Set<object>();
  while (queue.length > 0) {
    const current = queue.shift();
    if (!current || typeof current !== 'object' || seen.has(current)) continue;
    seen.add(current);
    if (Array.isArray(current)) return current;
    for (const key of ['rows', 'vehicles', 'data', 'results', 'items']) {
      const value = (current as Raw)[key];
      if (Array.isArray(value)) return value;
      if (value && typeof value === 'object') queue.push(value);
    }
  }
  return [];
}

function identity(raw: Raw): string {
  return text(raw.type, raw.vehicleType, raw.vehicle_type, raw.name, raw.vehicleName).toLowerCase();
}

export function isContainerVehicle(raw: Raw): boolean {
  return /container/.test(identity(raw));
}

export function vehicleImage(raw: Raw): string | null {
  const id = identity(raw);
  if (/container/.test(id)) return '/maps/vehicle-container.webp';
  if (/sand\s*crawler|sandcrawler/.test(id)) return '/maps/vehicle-sandcrawler.webp';
  if (/sand\s*bike|sandbike/.test(id)) return '/maps/vehicle-sandbike.webp';
  if (/tread\s*wheel|treadwheel/.test(id)) return '/maps/vehicle-treadwheel.webp';
  if (/ornithopter|\borni\b/.test(id)) {
    if (/transport|cargo/.test(id)) return '/maps/vehicle-ornithopter-transport.webp';
    if (/medium/.test(id)) return '/maps/vehicle-ornithopter-medium.webp';
    return '/maps/vehicle-ornithopter-light.webp';
  }
  if (/buggy/.test(id)) return '/maps/vehicle-buggy.webp';
  return null;
}

/** Null means "this player has no access to this vehicle", so it must not be shown at all. */
function classify(raw: Raw, playerName: string): VehicleAccess | null {
  const owner = text(raw.owner_name, raw.ownerName, raw.owner).toLowerCase();
  const me = playerName.trim().toLowerCase();
  if (!owner) return null;

  const relationship = text(raw.relationship, raw.relation, raw.access).toLowerCase();
  const sharedWith = Array.isArray(raw.shared_with)
    ? raw.shared_with
    : Array.isArray(raw.sharedWith)
      ? raw.sharedWith
      : [];
  const sharedWithMe =
    me !== '' &&
    sharedWith.some(
      (person) => text(rec(person).name, rec(person).username, rec(person).characterName).toLowerCase() === me,
    );

  const accessible = (me !== '' && owner === me) || SHARED_RELATIONS.has(relationship) || sharedWithMe;
  if (!accessible) return null;

  if (OWNED_RELATIONS.has(relationship)) return 'owned';
  if (SHARED_RELATIONS.has(relationship)) return 'shared';
  return me !== '' && owner === me ? 'owned' : 'shared';
}

export function normalizeVehicles(payload: unknown, playerName: string): Vehicle[] {
  const vehicles: Vehicle[] = [];
  extractVehicleRows(payload).forEach((entry, index) => {
    const raw = rec(entry);
    const access = classify(raw, playerName);
    if (!access) return;

    const container = isContainerVehicle(raw);
    const fuelPercent = num(raw.fuel_percent, raw.fuelPercent);

    let storage: VehicleStorage | null = null;
    if (container) {
      const weightUsed = readNumber(raw, WEIGHT_USED);
      const weightMax = readNumber(raw, WEIGHT_MAX);
      const weighted = weightUsed !== null || weightMax !== null;
      storage = weighted
        ? { used: weightUsed, max: weightMax, unit: 'kg' }
        : { used: readNumber(raw, STORAGE_USED), max: readNumber(raw, STORAGE_MAX), unit: 'slots' };
    }

    vehicles.push({
      id: text(raw.id, raw.vehicle_id, raw.vehicleId, raw.uuid) || `vehicle-${index}`,
      name: text(raw.name, raw.vehicleName, raw.vehicle_name) || `Vehicle ${index + 1}`,
      type: text(raw.type, raw.vehicleType, raw.vehicle_type) || 'Unknown',
      owner: text(raw.owner_name, raw.ownerName, raw.owner) || 'Unknown',
      access,
      condition: num(raw.condition_percent, raw.conditionPercent, raw.condition),
      fuel: container ? null : { percent: fuelPercent, current: num(raw.current_fuel, raw.currentFuel) },
      storage,
      image: vehicleImage(raw),
    });
  });
  return vehicles;
}

export type VehicleView = 'owned' | 'shared';

export interface VehicleGroups {
  owned: Vehicle[];
  shared: Vehicle[];
  /** Which tab to show, resolved from the request and what actually exists. */
  view: VehicleView;
  /**
   * The Own/Shared switcher only exists when there is something to switch between.
   * With zero access, or only one side populated, it vanishes entirely.
   */
  showAccessBar: boolean;
}

export function groupVehicles(vehicles: Vehicle[], requested: string | undefined): VehicleGroups {
  const owned = vehicles.filter((vehicle) => vehicle.access === 'owned');
  const shared = vehicles.filter((vehicle) => vehicle.access === 'shared');
  const showAccessBar = owned.length > 0 && shared.length > 0;
  const view: VehicleView = !showAccessBar
    ? owned.length > 0
      ? 'owned'
      : 'shared'
    : requested === 'shared'
      ? 'shared'
      : 'owned';
  return { owned, shared, view, showAccessBar };
}
