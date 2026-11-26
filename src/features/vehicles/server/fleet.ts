import '../../../lib/assert-server';
import type { DashboardSession } from '../../auth/server/session-store';
import { getDuneClient } from '../../../server/integrations/dune';
import { spendReadBudget } from '../../../server/read-budget';
import { AppError } from '../../../lib/errors';
import { resolveItemCharacter } from '../../player/server/item-finder';
import { FLEET_LIMITS, normalizeFleetRow, type CargoReading, type CargoTotal, type FleetReport } from '../fleet';

const MAX_CARGO_SLOTS = 500;
type Raw = Record<string, unknown>;
const record = (value: unknown): Raw =>
  value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as Raw) : {};
function assetId(value: unknown): string | null {
  const candidate = typeof value === 'number' ? String(value) : typeof value === 'string' ? value.trim() : '';
  return /^[1-9][0-9]{0,15}$/.test(candidate) && Number.isSafeInteger(Number(candidate)) ? candidate : null;
}
function supported(value: unknown): Raw {
  const data = record(value);
  if (data.supported === false || data.found === false || data.ok === false) throw new Error('Unavailable source');
  return data;
}
function count(value: unknown): number | null {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null;
}

/** Exact canonical roster rank for the verified controller, or null. Names and list rows never authorize. */
function rosterRank(value: unknown, controller: string): 1 | 2 | 3 | null {
  const data = supported(value);
  if (data.claimed === false || !Array.isArray(data.entries)) return null;
  const entry = data.entries.map(record).find((row) => row.playerId === controller && row.canonical === true);
  const rank = Number(entry?.rank);
  return rank === 1 || rank === 2 || rank === 3 ? rank : null;
}

async function reader(signal?: AbortSignal) {
  const budget = await spendReadBudget();
  if (!budget.allowed) throw new AppError('Read capacity reached. Try again shortly.', 429, 'RATE_LIMITED', true);
  const deadline = signal ? AbortSignal.any([signal, AbortSignal.timeout(20_000)]) : AbortSignal.timeout(20_000);
  const client = getDuneClient();
  return {
    deadline,
    read: (path: string) => {
      deadline.throwIfAborted();
      return client.request('GET', path, { timeoutMs: 4000, retryRead: false, signal: deadline });
    },
  };
}

function unavailable(): AppError {
  return new AppError('Vehicle data is unreachable right now. Try again shortly.', 503, 'FLEET_UNAVAILABLE', true);
}

/**
 * Fresh session-linked fleet read. Each listed vehicle is independently checked against its permission roster
 * for the verified controller's canonical entry before any condition, fuel or position is returned.
 */
export async function readFleet(session: DashboardSession, signal?: AbortSignal): Promise<FleetReport> {
  const { player, controller } = await resolveItemCharacter(session);
  const { read, deadline } = await reader(signal);
  let rows: unknown[];
  let listed = 0;
  try {
    const data = supported(await read(`/api/players/${player}/vehicles`));
    if (!Array.isArray(data.rows)) throw new Error('Missing list');
    rows = data.rows;
    listed = Math.max(rows.length, count(data.totalCount) ?? 0);
  } catch (error) {
    if (signal?.aborted) throw error;
    throw unavailable();
  }
  const candidates = [
    ...new Map(
      rows
        .slice(0, FLEET_LIMITS.vehicles)
        .map((row) => [assetId(record(row).id ?? record(row).vehicle_id), row] as const)
        .filter((entry): entry is [string, unknown] => entry[0] !== null),
    ).entries(),
  ];
  const report: FleetReport = {
    vehicles: [],
    excluded: 0,
    limited: listed > FLEET_LIMITS.vehicles,
    observedAt: new Date().toISOString(),
  };
  report.excluded = Math.min(rows.length, FLEET_LIMITS.vehicles) - candidates.length;
  let cursor = 0;
  // Three workers bound provider load, matching the item finder's per-asset permission checks.
  await Promise.all(
    Array.from({ length: Math.min(3, candidates.length) }, async () => {
      while (cursor < candidates.length && !deadline.aborted) {
        const [id, row] = candidates[cursor++];
        try {
          const rank = rosterRank(await read(`/api/vehicles/${id}/permissions`), controller);
          if (rank === null) report.excluded++;
          else report.vehicles.push(normalizeFleetRow(row, id, rank));
        } catch {
          report.excluded++;
        }
      }
    }),
  );
  if (cursor < candidates.length) {
    report.limited = true;
    report.excluded += candidates.length - cursor;
  }
  report.vehicles.sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
  return report;
}

/** Fresh cargo totals for one vehicle the verified character can currently access. */
export async function readCargo(
  session: DashboardSession,
  requested: string,
  signal?: AbortSignal,
): Promise<CargoReading> {
  const vehicleId = assetId(requested);
  if (!vehicleId) throw new AppError('Choose a vehicle.', 400, 'INVALID_VEHICLE', true);
  const { player, controller } = await resolveItemCharacter(session);
  const { read } = await reader(signal);
  const denied = () => new AppError('That vehicle is not available to your character.', 404, 'NOT_FOUND', true);
  let storage: Raw;
  try {
    const list = supported(await read(`/api/players/${player}/vehicles`));
    const listedHere =
      Array.isArray(list.rows) &&
      list.rows.some((row) => assetId(record(row).id ?? record(row).vehicle_id) === vehicleId);
    if (!listedHere) throw denied();
    if (rosterRank(await read(`/api/vehicles/${vehicleId}/permissions`), controller) === null) throw denied();
    storage = supported(await read(`/api/vehicles/${vehicleId}/storage`));
    if (!Array.isArray(storage.slots)) throw new Error('Missing slots');
  } catch (error) {
    if (error instanceof AppError) throw error;
    if (signal?.aborted) throw error;
    throw new AppError(
      'Cargo for this vehicle is unsupported or unreachable right now.',
      503,
      'CARGO_UNAVAILABLE',
      true,
    );
  }
  const slots = storage.slots as unknown[];
  const totals = new Map<string, CargoTotal & { sum: bigint }>();
  let limited = slots.length > MAX_CARGO_SLOTS;
  for (const value of slots.slice(0, MAX_CARGO_SLOTS)) {
    const slot = record(value);
    const templateId = typeof slot.templateId === 'string' ? slot.templateId.trim() : '';
    if (!templateId || templateId.length > 128) {
      limited = true;
      continue;
    }
    const key = templateId.toLowerCase();
    const entry = totals.get(key) ?? {
      templateId,
      name: typeof slot.name === 'string' && slot.name.trim() ? slot.name.trim().slice(0, 200) : templateId,
      quantity: '0',
      exact: true,
      sum: 0n,
    };
    const quantity =
      typeof slot.quantity === 'number' && Number.isSafeInteger(slot.quantity) && slot.quantity >= 0
        ? BigInt(slot.quantity)
        : typeof slot.quantity === 'string' && /^[0-9]{1,30}$/.test(slot.quantity)
          ? BigInt(slot.quantity)
          : null;
    if (quantity === null) entry.exact = false;
    else entry.sum += quantity;
    totals.set(key, entry);
  }
  return {
    vehicleId,
    totals: [...totals.values()]
      .map(({ sum, ...total }) => ({ ...total, quantity: String(sum) }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    usedSlots: count(storage.usedSlots),
    maxSlots: count(storage.maxSlots),
    currentVolume:
      typeof storage.currentVolume === 'number' && storage.currentVolume >= 0 ? storage.currentVolume : null,
    maxVolume: typeof storage.maxVolume === 'number' && storage.maxVolume >= 0 ? storage.maxVolume : null,
    volumeComplete: storage.volumeComplete === true,
    limited,
    observedAt: new Date().toISOString(),
  };
}
