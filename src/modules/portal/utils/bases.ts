import { clampPercent } from './formatting';
import { FUEL_BURN_SECONDS, GENERATOR_FUEL_CAP, generatorUptimePolicy } from '../config/progression';

export function getBaseId(base) {
  return (
    base?.base_id ??
    base?.baseId ??
    base?.id ??
    base?.uuid ??
    null
  );
}

export function getNumber(...values) {
  for (const value of values) {
    const number = Number(value);

    if (Number.isFinite(number)) {
      return number;
    }
  }

  return null;
}

export function getGeneratorSeconds(base) {
  return Math.max(
    0,
    getNumber(
      base?.generatorRuntimeSeconds,
      base?.generator_runtime_seconds,
      base?.generatorRuntime,
      base?.generator_runtime,
      base?.powerSeconds,
      base?.power_seconds
    ) ?? 0
  );
}

export function getGeneratorType(base) {
  const type = String(base?.base_type ?? base?.baseType ?? base?.type ?? '').toLowerCase();
  if (type.includes('spicegenerator')) return 'spice';
  if (type.includes('directional')) return 'windTurbineDirectional';
  if (type.includes('turbine')) return 'windTurbineOmni';
  return 'fuel';
}

export function getMaxGeneratorUptimeSeconds(base) {
  const burnSeconds = FUEL_BURN_SECONDS[getGeneratorType(base)] ?? FUEL_BURN_SECONDS.fuel;
  // generatorRuntimeSeconds is the lowest queued reserve for one generator,
  // not the sum of every generator at the base. Keep the progress ceiling on
  // the same per-generator basis as the Console's reserve calculation.
  return GENERATOR_FUEL_CAP * burnSeconds * generatorUptimePolicy();
}

export function getStorageData(data) {
  const root = data?.data ?? data ?? {};
  const totals = root.totals ?? {};
  const storage = root.storage ?? {};

  const used = getNumber(
    totals.currentVolume,
    totals.current_volume,
    root.currentVolume,
    root.current_volume,
    storage.used
  );

  const max = getNumber(
    totals.maxVolume,
    totals.max_volume,
    root.maxVolume,
    root.max_volume,
    storage.max
  );

  let percent = getNumber(
    totals.volumePercent,
    totals.volume_percent,
    root.volumePercent,
    root.volume_percent,
    storage.percent
  );

  if (
    percent === null &&
    used !== null &&
    max !== null &&
    max > 0
  ) {
    percent = (used / max) * 100;
  }

  return {
    used,
    max,
    percent: percent === null ? null : clampPercent(percent),
    available:
      storage.available !== false &&
      (used !== null || max !== null),
  };
}

export function getWaterData(data) {
  const root = data?.data ?? data ?? {};

  const summary =
    root.waterSummary ??
    root.water_summary ??
    {};

  const containers =
    root.containers ??
    root.waterContainers ??
    root.water_containers ??
    root.rows ??
    [];

  let current = getNumber(
    summary.volume,
    summary.currentVolume,
    summary.current_volume,
    root.volume,
    root.currentVolume,
    root.current_volume,
    root.totalVolume,
    root.total_volume,
    root.waterVolume,
    root.water_volume,
    root.stored,
    root.current
  );

  let max = getNumber(
    summary.maxVolume,
    summary.max_volume,
    root.maxVolume,
    root.max_volume,
    root.capacity,
    root.maxCapacity,
    root.max_capacity,
    root.totalCapacity,
    root.total_capacity
  );

  let percent = getNumber(
    summary.percent,
    summary.fillPercent,
    summary.fill_percentage,
    summary.fillPercentage,
    root.fillPercent,
    root.fill_percentage,
    root.fillPercentage,
    root.percent,
    root.percentage
  );

  let containerCount = getNumber(
    summary.containers,
    summary.containerCount,
    summary.container_count,
    root.count,
    root.containerCount,
    root.container_count
  );

  if (Array.isArray(containers)) {
    if (containerCount === null) {
      containerCount = containers.length;
    }

    if (current === null) {
      let totalCurrent = 0;
      let foundCurrent = false;

      for (const container of containers) {
        const value = getNumber(
          container?.volume,
          container?.currentVolume,
          container?.current_volume,
          container?.stored,
          container?.current,
          container?.amount
        );

        if (value !== null) {
          totalCurrent += value;
          foundCurrent = true;
        }
      }

      if (foundCurrent) {
        current = totalCurrent;
      }
    }

    if (max === null) {
      let totalMax = 0;
      let foundMax = false;

      for (const container of containers) {
        const value = getNumber(
          container?.maxVolume,
          container?.max_volume,
          container?.capacity,
          container?.maxCapacity,
          container?.max_capacity
        );

        if (value !== null) {
          totalMax += value;
          foundMax = true;
        }
      }

      if (foundMax && totalMax > 0) {
        max = totalMax;
      }
    }
  }

  if (
    percent === null &&
    current !== null &&
    max !== null &&
    max > 0
  ) {
    percent = (current / max) * 100;
  }

  return {
    current,
    max,
    percent: percent === null ? null : clampPercent(percent),
    containerCount: containerCount ?? 0,
    available: max !== null || current !== null,
  };
}

export function extractBases(player) {
  const response = player?.details?.bases ?? {};

  if (Array.isArray(response)) {
    return response;
  }

  if (Array.isArray(response.rows)) {
    return response.rows;
  }

  if (Array.isArray(response.data)) {
    return response.data;
  }

  return [];
}

export function isOwnedBase(base) {
  const relationship = String(
    base?.relationship ??
      base?.relation ??
      base?.access ??
      ''
  )
    .trim()
    .toLowerCase();

  if (
    relationship === 'owner' ||
    relationship === 'owned' ||
    relationship === 'self' ||
    relationship === 'own'
  ) {
    return true;
  }

  if (
    relationship === 'shared' ||
    relationship === 'member' ||
    relationship === 'visitor' ||
    relationship === 'guest' ||
    relationship === 'shared base'
  ) {
    return false;
  }

  const owned =
    base?.owned ??
    base?.isOwner ??
    base?.is_owner;

  if (
    owned === true ||
    owned === 1 ||
    owned === 'true'
  ) {
    return true;
  }

  return false;
}

export function getBaseRelationship(base) {
  if (isOwnedBase(base)) {
    return 'Owned';
  }

  const relationship =
    base?.relationship ??
    base?.relation ??
    base?.access;

  if (relationship) {
    return relationship;
  }

  return 'Shared';
}

export function getBaseName(base, index) {
  return (
    base?.name ??
    base?.baseName ??
    base?.base_name ??
    base?.title ??
    `Base ${index + 1}`
  );
}

export function getBaseType(base) {
  return (
    base?.base_type ??
    base?.baseType ??
    base?.type ??
    'Unknown'
  );
}

export function getBaseOwner(base) {
  return (
    base?.owner_name ??
    base?.ownerName ??
    base?.owner ??
    'Unknown'
  );
}

