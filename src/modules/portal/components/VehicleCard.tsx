import { clampPercent, getNumber } from '../utils/formatting';
import { getVehicleName, getVehicleType, getVehicleOwner, isOwnedVehicle } from '../utils/vehicles';
import TelemetryMetric from './TelemetryMetric';

export default function VehicleCard({ vehicle, index, playerName }) {
  const vehicleName = getVehicleName(vehicle, index);
  const vehicleType = getVehicleType(vehicle);
  const owner = getVehicleOwner(vehicle);
  const owned = isOwnedVehicle(vehicle, playerName);
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
          <div className="mt-1 pl-4.5 text-xs text-zinc-500">{vehicleType}</div>
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
      </div>
    </article>
  );
}
