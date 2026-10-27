import { clampPercent, formatNumber, getNumber } from '../utils/formatting';
import { getVehicleName, getVehicleType, getVehicleOwner, isContainerVehicle, isOwnedVehicle } from '../utils/vehicles';
import TelemetryMetric from './TelemetryMetric';

const STORAGE_KEYS = {
  current: ['storage_used', 'storageUsed', 'current_storage', 'currentStorage', 'used_slots', 'usedSlots'],
  maximum: [
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
  ],
};
const WEIGHT_KEYS = {
  current: ['current_weight', 'currentWeight', 'weight_used', 'weightUsed'],
  maximum: ['max_weight', 'maxWeight', 'weight_capacity', 'weightCapacity'],
};

function readNumber(vehicle, keys) {
  for (const key of keys) {
    const value = getNumber(vehicle?.[key], vehicle?.storage?.[key], vehicle?.inventory?.[key], vehicle?.cargo?.[key]);
    if (value !== null) return value;
  }
  return null;
}

function CargoMetric({ vehicle }) {
  const storageUsed = readNumber(vehicle, STORAGE_KEYS.current);
  const storageMaximum = readNumber(vehicle, STORAGE_KEYS.maximum);
  const weightUsed = readNumber(vehicle, WEIGHT_KEYS.current);
  const weightMaximum = readNumber(vehicle, WEIGHT_KEYS.maximum);
  const isWeight = weightUsed !== null || weightMaximum !== null;
  const used = isWeight ? weightUsed : storageUsed;
  const maximum = isWeight ? weightMaximum : storageMaximum;
  const unit = isWeight ? 'kg' : 'slots';
  const value =
    used !== null && maximum !== null
      ? `${formatNumber(used)} / ${formatNumber(maximum)} ${unit}`
      : maximum !== null
        ? `${formatNumber(maximum)} ${unit}`
        : used !== null
          ? `${formatNumber(used)} ${unit} used`
          : 'Not reported';

  return (
    <div className="min-w-0">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-[11px] font-medium text-zinc-500">{isWeight ? 'Weight capacity' : 'Cargo capacity'}</span>
        <span className="text-[11px] font-medium text-zinc-400">Storage</span>
      </div>
      <div className="rounded-xl border border-white/5 bg-zinc-950/30 px-3 py-2.5">
        <div className="truncate text-sm font-medium text-zinc-200" title={value}>
          {value}
        </div>
        <div className="mt-1 text-[11px] text-zinc-500">
          {used !== null && maximum !== null
            ? 'Current / maximum'
            : maximum !== null
              ? 'Maximum reported'
              : 'Provider capacity data'}
        </div>
      </div>
    </div>
  );
}

export default function VehicleCard({ vehicle, index, playerName }) {
  const vehicleName = getVehicleName(vehicle, index);
  const vehicleType = getVehicleType(vehicle);
  const owner = getVehicleOwner(vehicle);
  const owned = isOwnedVehicle(vehicle, playerName);
  const container = isContainerVehicle(vehicle);
  const relationship = owned ? 'Owned' : 'Shared';
  const condition = getNumber(vehicle?.condition_percent, vehicle?.conditionPercent, vehicle?.condition);
  const fuel = getNumber(vehicle?.fuel_percent, vehicle?.fuelPercent);
  const currentFuel = vehicle?.current_fuel ?? vehicle?.currentFuel;
  const accent = owned ? 'var(--theme-accent)' : 'var(--theme-soft)';

  return (
    <article
      className={`min-h-65 min-w-0 rounded-3xl border bg-zinc-900/40 p-6 transition-colors hover:bg-zinc-900/60 ${
        owned ? 'border-indigo-500/20' : 'border-white/5'
      }`}
    >
      <div className="mb-4 flex items-start justify-between gap-3 border-b border-white/5 pb-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2.5">
            <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: accent }} aria-hidden="true" />
            <strong className="truncate text-[1.05rem] font-semibold text-zinc-100" title={vehicleName}>
              {vehicleName}
            </strong>
          </div>
          <div className="mt-1 pl-4.5 text-xs text-zinc-400">{vehicleType}</div>
        </div>
        <span className="shrink-0 rounded-full border border-white/5 bg-zinc-800/60 px-2.5 py-1 text-[11px] font-medium text-zinc-400">
          {relationship}
        </span>
      </div>

      <div className="mb-5 rounded-xl border border-white/5 bg-zinc-950/30 px-3.5 py-3">
        <div className="mb-1 text-[11px] font-medium text-zinc-500">Owner</div>
        <div className="text-sm text-zinc-300">{owner}</div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <TelemetryMetric
          label="Condition"
          percent={condition === null ? null : clampPercent(condition)}
          color={condition !== null && condition <= 25 ? 'var(--theme-danger)' : 'var(--theme-accent)'}
          value={condition === null ? 'No data' : `${condition.toFixed(0)}%`}
        />
        {container ? (
          <CargoMetric vehicle={vehicle} />
        ) : (
          <TelemetryMetric
            label="Fuel"
            percent={fuel === null ? null : clampPercent(fuel)}
            color={fuel !== null && fuel <= 25 ? 'var(--theme-danger)' : 'var(--theme-accent)'}
            value={
              currentFuel !== undefined && currentFuel !== null
                ? Number(currentFuel).toFixed(2).replace(/\.00$/, '')
                : fuel === null
                  ? 'No data'
                  : `${fuel.toFixed(0)}%`
            }
          />
        )}
      </div>
    </article>
  );
}
