import { getVehicleId, isOwnedVehicle, isVehicleAccessible } from '../utils/vehicles';
import VehicleCard from './VehicleCard';

function VehicleGrid({ vehicles, playerName, vehicleTab, setVehicleTab }) {
  const accessibleVehicles = vehicles.filter((vehicle) => isVehicleAccessible(vehicle, playerName));
  const ownedVehicles = accessibleVehicles.filter((vehicle) => isOwnedVehicle(vehicle, playerName));
  const sharedVehicles = accessibleVehicles.filter((vehicle) => !isOwnedVehicle(vehicle, playerName));
  const visibleVehicles = vehicleTab === 'owned' ? ownedVehicles : sharedVehicles;

  if (visibleVehicles.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-white/10 bg-zinc-900/30 p-8 text-center">
        <div className="text-sm text-zinc-200">No vehicles found</div>
        <div className="mt-1 text-xs text-zinc-500">There are currently no vehicles in this category.</div>
      </div>
    );
  }

  return (
    <>
      <div className="mb-5 grid grid-cols-2 gap-1 rounded-full border border-white/5 bg-zinc-950/50 p-1">
        <button
          type="button"
          onClick={() => setVehicleTab('owned')}
          className={`rounded-full px-4 py-2.5 text-xs font-medium transition-colors ${
            vehicleTab === 'owned' ? 'bg-indigo-500/10 text-indigo-300' : 'text-zinc-400 hover:bg-zinc-800'
          }`}
        >
          Own Vehicles <span className="ml-1.5 text-zinc-500">{ownedVehicles.length}</span>
        </button>
        <button
          type="button"
          onClick={() => setVehicleTab('shared')}
          className={`rounded-full px-4 py-2.5 text-xs font-medium transition-colors ${
            vehicleTab === 'shared' ? 'bg-zinc-700 text-zinc-100' : 'text-zinc-400 hover:bg-zinc-800'
          }`}
        >
          Shared Vehicles <span className="ml-1.5 text-zinc-500">{sharedVehicles.length}</span>
        </button>
      </div>

      <div className="vehicle-grid grid grid-cols-2 gap-4">
        {visibleVehicles.map((vehicle, index) => {
          const isOddFinalVehicle = visibleVehicles.length % 2 === 1 && index === visibleVehicles.length - 1;
          const vehicleId = getVehicleId(vehicle);
          return (
            <div
              key={vehicleId ?? `vehicle-${index}`}
              className={`min-w-0 ${isOddFinalVehicle ? 'col-span-full' : ''}`}
            >
              <VehicleCard vehicle={vehicle} index={index} playerName={playerName} />
            </div>
          );
        })}
      </div>
    </>
  );
}

export default function VehicleSection({ vehicles, playerName, vehicleTab, setVehicleTab }) {
  return (
    <section className="mb-5 rounded-3xl border border-white/5 bg-zinc-900/40 p-6">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="mb-1 text-[11px] font-medium tracking-wide text-zinc-500 uppercase">Vehicle Network</p>
          <h2 className="m-0 text-xl font-semibold text-zinc-100">Vehicles</h2>
        </div>
        <div className="text-xs text-zinc-500">{vehicles.length} owned / shared</div>
      </div>
      <VehicleGrid vehicles={vehicles} playerName={playerName} vehicleTab={vehicleTab} setVehicleTab={setVehicleTab} />
    </section>
  );
}
