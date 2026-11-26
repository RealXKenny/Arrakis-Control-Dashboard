import type { CargoReading, FleetVehicle } from '../vehicles/fleet';
import { compareManifest } from '../vehicles/fleet';
import { estimateRoute, formatKm, type DepartureCheck, type PlanData } from './model';

/** Deep Desert cycle information as the Console reports it; every field may be unknown. */
export interface DeepDesertStatus {
  available: boolean;
  nextCycleAt: string | null;
  layout: number | null;
  staleSince: string | null;
  checkedAt: string;
}

/**
 * N039: derived readiness checks for a Deep Desert departure. Each check states what it is based on; missing
 * readings produce "unknown", never "ready". Manual checklist items stay the member's own ticks.
 */
export function departureChecks(input: {
  plan: PlanData;
  status: DeepDesertStatus | null;
  vehicle: FleetVehicle | null;
  cargo: CargoReading | null;
  now: number;
  tripHours: number;
}): DepartureCheck[] {
  const { plan, status, vehicle, cargo, now, tripHours } = input;
  const checks: DepartureCheck[] = [];
  const route = plan.routes.find((entry) => entry.id === plan.departure.routeId) ?? null;

  if (!status || !status.available || !status.nextCycleAt) {
    checks.push({
      id: 'cycle',
      label: 'Coriolis cycle',
      state: 'unknown',
      detail: 'The next Coriolis cycle time is not reported. Check in game before leaving.',
    });
  } else {
    const remainingHours = (Date.parse(status.nextCycleAt) - now) / 3_600_000;
    const stale = status.staleSince ? ' The Console flags its cycle seed as stale.' : '';
    checks.push({
      id: 'cycle',
      label: 'Coriolis cycle',
      state: remainingHours > tripHours && !status.staleSince ? 'ready' : 'attention',
      detail:
        remainingHours <= 0
          ? `The reported cycle time has passed; the layout may be updating.${stale}`
          : `About ${remainingHours.toFixed(1)} hours until the reported cycle, against a planned ${tripHours}-hour trip.${stale}`,
    });
  }

  if (!route) {
    checks.push({ id: 'route', label: 'Saved route', state: 'attention', detail: 'No saved route is selected.' });
  } else {
    const estimate = estimateRoute(route, plan.bookmarks);
    checks.push({
      id: 'route',
      label: 'Saved route',
      state: route.map === 'DeepDesert' && estimate.missing === 0 ? 'ready' : 'attention',
      detail:
        route.map !== 'DeepDesert'
          ? `"${route.name}" is not a Deep Desert route.`
          : estimate.missing > 0
            ? `"${route.name}" has ${estimate.missing} leg(s) with a missing waypoint.`
            : `"${route.name}": ${formatKm(estimate.km)} straight-line planning estimate over ${estimate.legs.length} leg(s).`,
    });
  }

  if (!plan.departure.vehicleId) {
    checks.push({ id: 'vehicle', label: 'Vehicle', state: 'attention', detail: 'No vehicle is selected.' });
  } else if (!vehicle) {
    checks.push({
      id: 'vehicle',
      label: 'Vehicle',
      state: 'unknown',
      detail: 'The selected vehicle was not in your latest verified fleet reading.',
    });
  } else {
    const { fuelPercent, conditionPercent } = plan.thresholds;
    const low: string[] = [];
    const unknown: string[] = [];
    if (vehicle.fuelPercent === null) unknown.push('fuel');
    else if (vehicle.fuelPercent <= fuelPercent) low.push(`fuel ${vehicle.fuelPercent}%`);
    if (vehicle.conditionPercent === null) unknown.push('condition');
    else if (vehicle.conditionPercent <= conditionPercent) low.push(`condition ${vehicle.conditionPercent}%`);
    if (vehicle.lifecycle !== 'deployed') low.push(`state: ${vehicle.lifecycle.replace('-', ' ')}`);
    checks.push({
      id: 'vehicle',
      label: 'Vehicle',
      state: low.length ? 'attention' : unknown.length ? 'unknown' : 'ready',
      detail: low.length
        ? `${vehicle.name}: ${low.join(', ')}.`
        : unknown.length
          ? `${vehicle.name}: ${unknown.join(' and ')} not reported.`
          : `${vehicle.name}: fuel and condition above your thresholds.`,
    });
  }

  const manifest = plan.manifests.find((entry) => entry.id === plan.departure.manifestId) ?? null;
  if (manifest) {
    if (!cargo || cargo.vehicleId !== plan.departure.vehicleId) {
      checks.push({
        id: 'cargo',
        label: 'Cargo manifest',
        state: 'unknown',
        detail: `Check cargo for the selected vehicle to compare it with "${manifest.name}".`,
      });
    } else {
      const lines = compareManifest(manifest, cargo);
      const short = lines.filter((line) => line.status === 'short').length;
      const unknown = lines.filter((line) => line.status === 'unknown').length;
      checks.push({
        id: 'cargo',
        label: 'Cargo manifest',
        state: short ? 'attention' : unknown ? 'unknown' : 'ready',
        detail: short
          ? `${short} of ${lines.length} manifest item(s) are short.`
          : unknown
            ? `${unknown} item(s) could not be counted exactly.`
            : `All ${lines.length} manifest item(s) are loaded.`,
      });
    }
  }

  for (const item of plan.departure.items) {
    checks.push({
      id: item.id,
      label: item.label,
      state: item.done ? 'ready' : 'attention',
      detail: item.done ? 'Ticked by you.' : 'Not ticked yet.',
    });
  }
  return checks;
}
