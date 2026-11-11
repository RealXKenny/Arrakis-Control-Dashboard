import Image from 'next/image';
import { formatCount } from '../../../lib/format';
import type { Vehicle, VehicleStorage } from '../normalize';
import { Meter } from '../../../components/ui/meter';

function storageText({ used, max, unit }: VehicleStorage): string {
  if (used !== null && max !== null) return `${formatCount(used)} / ${formatCount(max)} ${unit}`;
  if (max !== null) return `${formatCount(max)} ${unit}`;
  if (used !== null) return `${formatCount(used)} ${unit} used`;
  return 'Not reported';
}

function storagePercent({ used, max }: VehicleStorage): number | null {
  return used !== null && max !== null && max > 0 ? (used / max) * 100 : null;
}

function fuelText(fuel: NonNullable<Vehicle['fuel']>): string {
  if (fuel.current !== null) return formatCount(fuel.current, 2);
  return fuel.percent === null ? 'No data' : `${Math.round(fuel.percent)}%`;
}

export function VehicleCard({ vehicle }: { vehicle: Vehicle }) {
  const owned = vehicle.access === 'owned';
  return (
    <article
      id={`vehicle-${vehicle.id}`}
      className={`panel flex flex-col gap-5 p-5 ${owned ? 'border-spice-500/30' : ''}`}
    >
      <header className="flex items-start justify-between gap-3 border-b border-sand-200/10 pb-4">
        <div className="min-w-0">
          <h3 className="truncate text-sm tracking-wide" title={vehicle.name}>
            {vehicle.name}
          </h3>
          <p className="mt-1 truncate font-mono text-[0.6875rem] uppercase tracking-widest text-sand-500">
            {vehicle.type}
          </p>
        </div>
        <span
          className={`shrink-0 border px-2 py-1 font-mono text-[0.625rem] font-semibold uppercase tracking-widest ${
            owned ? 'border-spice-500/50 text-spice-300' : 'border-sand-200/20 text-sand-400'
          }`}
        >
          {owned ? 'Owned' : 'Shared'}
        </span>
      </header>

      {vehicle.image && (
        <div className="flex h-32 items-center justify-center bg-obsidian-950/60 p-3">
          <Image
            src={vehicle.image}
            alt={`${vehicle.type} vehicle`}
            width={240}
            height={128}
            unoptimized
            className="h-full w-full object-contain"
          />
        </div>
      )}

      <p className="font-mono text-[0.6875rem] uppercase tracking-widest text-sand-500">
        Owner <span className="ml-2 text-sand-200">{vehicle.owner}</span>
      </p>

      <div className="grid grid-cols-2 gap-5">
        <Meter
          label="Condition"
          percent={vehicle.condition}
          value={vehicle.condition === null ? 'No data' : `${Math.round(vehicle.condition)}%`}
        />
        {/* Containers carry cargo, never fuel: `fuel` is null for them by construction. */}
        {vehicle.storage ? (
          <Meter label="Cargo" percent={storagePercent(vehicle.storage)} value={storageText(vehicle.storage)} />
        ) : vehicle.fuel ? (
          <Meter label="Fuel" percent={vehicle.fuel.percent} value={fuelText(vehicle.fuel)} />
        ) : null}
      </div>
    </article>
  );
}
