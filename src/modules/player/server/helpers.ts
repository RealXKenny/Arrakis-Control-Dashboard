
export function firstNumber(...values) {
  for (const value of values) {
    const number = Number(value);

    if (Number.isFinite(number)) {
      return number;
    }
  }

  return null;
}

export function firstValue(...values) {
  for (const value of values) {
    if (
      value !== undefined &&
      value !== null &&
      value !== ''
    ) {
      return value;
    }
  }

  return null;
}

export function clampPercent(value) {
  if (!Number.isFinite(value)) {
    return null;
  }

  return Math.max(0, Math.min(100, value));
}

/**
 * Normalize currency.
 */
export function normalizeCurrency(currency) {
  if (!currency) {
    return {
      available: false,
      rows: [],
      solariCredit: null,
      scrip: null,
    };
  }

  const rows = Array.isArray(currency)
    ? currency
    : Array.isArray(currency.rows)
      ? currency.rows
      : Array.isArray(currency.data)
        ? currency.data
        : [];

  const normalizedRows = rows.map((row) => ({
    ...row,
    currency_id: firstNumber(
      row?.currency_id,
      row?.currencyId,
      row?.id
    ),
    balance: firstNumber(row?.balance) ?? 0,
    label: row?.label ?? null,
  }));

  const solariRow = normalizedRows.find((row) => {
    const label = String(row.label ?? '').toLowerCase();

    return (
      label.includes('solari') ||
      label.includes('solar')
    );
  });

  const scripRow = normalizedRows.find((row) => {
    const label = String(row.label ?? '').toLowerCase();

    return label.includes('scrip');
  });

  return {
    ...currency,
    available:
      currency?.capabilities?.currency === true ||
      normalizedRows.length > 0,
    rows: normalizedRows,

    // Convenient values for the frontend.
    solariCredit: solariRow?.balance ?? null,
    scrip: scripRow?.balance ?? null,

    // Keep the original API naming available too.
    solarisCoin: solariRow?.balance ?? null,
  };
}

/**
 * Extract vehicle rows from common API response wrappers.
 */
export function extractVehicleRows(response) {
  if (Array.isArray(response)) {
    return response;
  }

  const queue = [response];
  const seen = new Set();

  while (queue.length > 0) {
    const current = queue.shift();

    if (!current || typeof current !== 'object') {
      continue;
    }

    if (seen.has(current)) {
      continue;
    }

    seen.add(current);

    if (Array.isArray(current)) {
      return current;
    }

    for (const key of [
      'rows',
      'vehicles',
      'data',
      'results',
      'items',
    ]) {
      const value = current[key];

      if (Array.isArray(value)) {
        return value;
      }

      if (
        value &&
        typeof value === 'object'
      ) {
        queue.push(value);
      }
    }
  }

  return [];
}

/**
 * Extract base ID.
 */
export function getBaseId(base) {
  return firstValue(
    base?.base_id,
    base?.baseId,
    base?.id,
    base?.uuid
  );
}

/**
 * Normalize base inventory storage.
 */
export function normalizeBaseStorage(inventory) {
  if (!inventory) {
    return {
      available: false,
      used: null,
      max: null,
      percent: null,
    };
  }

  const directUsed = firstNumber(
    inventory.used,
    inventory.usedStorage,
    inventory.storageUsed,
    inventory.totalUsed,
    inventory.usedSlots,
    inventory.occupied,
    inventory.current
  );

  const directMax = firstNumber(
    inventory.max,
    inventory.maxStorage,
    inventory.storageMax,
    inventory.storageCapacity,
    inventory.capacity,
    inventory.maxCapacity,
    inventory.totalCapacity,
    inventory.slots,
    inventory.maxSlots
  );

  const storage = inventory.storage || {};

  const storageUsed = firstNumber(
    directUsed,
    storage.used,
    storage.usedStorage,
    storage.storageUsed,
    storage.current,
    storage.occupied
  );

  const storageMax = firstNumber(
    directMax,
    storage.max,
    storage.maxStorage,
    storage.storageMax,
    storage.capacity,
    storage.maxCapacity,
    storage.totalCapacity,
    storage.slots,
    storage.maxSlots
  );

  const containers = Array.isArray(inventory.containers)
    ? inventory.containers
    : Array.isArray(inventory.rows)
      ? inventory.rows
      : Array.isArray(inventory.data)
        ? inventory.data
        : [];

  let containerUsed = null;
  let containerMax = null;

  for (const container of containers) {
    const type = String(
      container?.type ||
        container?.containerType ||
        container?.category ||
        ''
    ).toLowerCase();

    const isStorage =
      type.includes('storage') ||
      type.includes('inventory');

    if (!isStorage) {
      continue;
    }

    const used = firstNumber(
      container?.used,
      container?.usedSlots,
      container?.occupied,
      container?.current,
      container?.itemCount
    );

    const max = firstNumber(
      container?.max,
      container?.maxSlots,
      container?.capacity,
      container?.slots,
      container?.maxCapacity
    );

    if (used !== null) {
      containerUsed = (containerUsed ?? 0) + used;
    }

    if (max !== null) {
      containerMax = (containerMax ?? 0) + max;
    }
  }

  const used =
    storageUsed !== null
      ? storageUsed
      : containerUsed;

  const max =
    storageMax !== null
      ? storageMax
      : containerMax;

  let percent = null;

  if (
    used !== null &&
    max !== null &&
    max > 0
  ) {
    percent = clampPercent((used / max) * 100);
  }

  if (percent === null) {
    const suppliedPercent = firstNumber(
      inventory.percent,
      inventory.fillPercent,
      inventory.storagePercent,
      inventory.usedPercent,
      storage.percent,
      storage.fillPercent,
      storage.usedPercent
    );

    if (suppliedPercent !== null) {
      percent = clampPercent(
        suppliedPercent > 1
          ? suppliedPercent
          : suppliedPercent * 100
      );
    }
  }

  return {
    available:
      used !== null ||
      max !== null ||
      percent !== null,
    used,
    max,
    percent,
  };
}

/**
 * Normalize water.
 */
export function normalizeBaseWater(water) {
  if (!water) {
    return {
      available: false,
      containers: 0,
      volume: null,
      maxVolume: null,
      percent: null,
      bloodVolume: null,
      bloodMaxVolume: null,
      bloodPercent: null,
    };
  }

  const containers = Array.isArray(water)
    ? water
    : Array.isArray(water?.containers)
      ? water.containers
      : Array.isArray(water?.rows)
        ? water.rows
        : Array.isArray(water?.data)
          ? water.data
          : [];

  const directVolume = firstNumber(
    water.volume,
    water.currentVolume,
    water.totalVolume,
    water.waterVolume
  );

  const directMaxVolume = firstNumber(
    water.maxVolume,
    water.capacity,
    water.maxCapacity,
    water.totalCapacity
  );

  let volume = directVolume;
  let maxVolume = directMaxVolume;

  let bloodVolume = firstNumber(
    water.bloodVolume,
    water.currentBloodVolume
  );

  let bloodMaxVolume = firstNumber(
    water.bloodMaxVolume,
    water.bloodCapacity,
    water.maxBloodVolume
  );

  if (containers.length > 0) {
    let summedVolume = 0;
    let summedMaxVolume = 0;
    let summedBloodVolume = 0;
    let summedBloodMaxVolume = 0;

    let foundVolume = false;
    let foundMaxVolume = false;
    let foundBloodVolume = false;
    let foundBloodMaxVolume = false;

    for (const container of containers) {
      const current = firstNumber(
        container?.volume,
        container?.currentVolume,
        container?.waterVolume,
        container?.currentWaterVolume
      );

      const max = firstNumber(
        container?.maxVolume,
        container?.capacity,
        container?.maxCapacity,
        container?.waterCapacity
      );

      const blood = firstNumber(
        container?.bloodVolume,
        container?.currentBloodVolume
      );

      const bloodMax = firstNumber(
        container?.bloodMaxVolume,
        container?.bloodCapacity,
        container?.maxBloodVolume
      );

      if (current !== null) {
        summedVolume += current;
        foundVolume = true;
      }

      if (max !== null) {
        summedMaxVolume += max;
        foundMaxVolume = true;
      }

      if (blood !== null) {
        summedBloodVolume += blood;
        foundBloodVolume = true;
      }

      if (bloodMax !== null) {
        summedBloodMaxVolume += bloodMax;
        foundBloodMaxVolume = true;
      }
    }

    if (volume === null && foundVolume) {
      volume = summedVolume;
    }

    if (maxVolume === null && foundMaxVolume) {
      maxVolume = summedMaxVolume;
    }

    if (bloodVolume === null && foundBloodVolume) {
      bloodVolume = summedBloodVolume;
    }

    if (
      bloodMaxVolume === null &&
      foundBloodMaxVolume
    ) {
      bloodMaxVolume = summedBloodMaxVolume;
    }
  }

  let percent = null;

  if (
    volume !== null &&
    maxVolume !== null &&
    maxVolume > 0
  ) {
    percent = clampPercent(
      (volume / maxVolume) * 100
    );
  }

  let bloodPercent = null;

  if (
    bloodVolume !== null &&
    bloodMaxVolume !== null &&
    bloodMaxVolume > 0
  ) {
    bloodPercent = clampPercent(
      (bloodVolume / bloodMaxVolume) * 100
    );
  }

  if (percent === null) {
    const suppliedPercent = firstNumber(
      water.percent,
      water.fillPercent,
      water.waterPercent
    );

    if (suppliedPercent !== null) {
      percent = clampPercent(
        suppliedPercent > 1
          ? suppliedPercent
          : suppliedPercent * 100
      );
    }
  }

  if (bloodPercent === null) {
    const suppliedBloodPercent = firstNumber(
      water.bloodPercent,
      water.bloodFillPercent
    );

    if (suppliedBloodPercent !== null) {
      bloodPercent = clampPercent(
        suppliedBloodPercent > 1
          ? suppliedBloodPercent
          : suppliedBloodPercent * 100
      );
    }
  }

  return {
    available:
      containers.length > 0 ||
      volume !== null ||
      maxVolume !== null,
    containers: containers.length,
    volume,
    maxVolume,
    percent,
    bloodVolume,
    bloodMaxVolume,
    bloodPercent,
  };
}

/**
 * Load one base's additional telemetry.
 */