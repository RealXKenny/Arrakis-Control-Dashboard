export function extractVehicles(player) {
  const response = player?.details?.vehicles;

  if (Array.isArray(response)) {
    return response;
  }

  // Dev note: providers hide vehicles in five wrappers like keys before a road trip.
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

    for (const key of ['rows', 'vehicles', 'data', 'results', 'items']) {
      const value = current[key];

      if (Array.isArray(value)) {
        return value;
      }

      if (value && typeof value === 'object') {
        queue.push(value);
      }
    }
  }

  return [];
}

export function getVehicleId(vehicle) {
  return vehicle?.id ?? vehicle?.vehicle_id ?? vehicle?.vehicleId ?? vehicle?.uuid ?? null;
}

export function getVehicleName(vehicle, index) {
  return vehicle?.name ?? vehicle?.vehicleName ?? vehicle?.vehicle_name ?? `Vehicle ${index + 1}`;
}

export function getVehicleType(vehicle) {
  return vehicle?.type ?? vehicle?.vehicleType ?? vehicle?.vehicle_type ?? 'Unknown';
}

export function getVehicleImage(vehicle) {
  const identity = String(
    vehicle?.type ?? vehicle?.vehicleType ?? vehicle?.vehicle_type ?? vehicle?.name ?? vehicle?.vehicleName ?? '',
  ).toLowerCase();

  if (/container/.test(identity)) return '/maps/vehicle-container.webp';
  if (/sand\s*crawler|sandcrawler/.test(identity)) return '/maps/vehicle-sandcrawler.webp';
  if (/sand\s*bike|sandbike/.test(identity)) return '/maps/vehicle-sandbike.webp';
  if (/tread\s*wheel|treadwheel/.test(identity)) return '/maps/vehicle-treadwheel.webp';
  if (/ornithopter|ornithopter|\borni\b/.test(identity)) {
    if (/transport|cargo/.test(identity)) return '/maps/vehicle-ornithopter-transport.webp';
    if (/medium/.test(identity)) return '/maps/vehicle-ornithopter-medium.webp';
    return '/maps/vehicle-ornithopter-light.webp';
  }
  if (/buggy/.test(identity)) return '/maps/vehicle-buggy.webp';
  return null;
}

export function isContainerVehicle(vehicle) {
  return /container/i.test(
    String(
      vehicle?.type ?? vehicle?.vehicleType ?? vehicle?.vehicle_type ?? vehicle?.name ?? vehicle?.vehicleName ?? '',
    ),
  );
}

export function getVehicleOwner(vehicle) {
  return vehicle?.owner_name ?? vehicle?.ownerName ?? vehicle?.owner ?? 'Unknown';
}

export function isOwnedVehicle(vehicle, playerName) {
  const relationship = String(vehicle?.relationship ?? vehicle?.relation ?? vehicle?.access ?? '')
    .trim()
    .toLowerCase();

  if (relationship === 'owner' || relationship === 'owned' || relationship === 'self' || relationship === 'own') {
    return true;
  }

  if (
    relationship === 'shared' ||
    relationship === 'member' ||
    relationship === 'visitor' ||
    relationship === 'guest'
  ) {
    return false;
  }

  const normalizedPlayerName = String(playerName ?? '')
    .trim()
    .toLowerCase();

  const owner = String(vehicle?.owner_name ?? vehicle?.ownerName ?? vehicle?.owner ?? '')
    .trim()
    .toLowerCase();

  if (owner && normalizedPlayerName && owner === normalizedPlayerName) {
    return true;
  }

  if (!owner) {
    return true;
  }

  return false;
}

export function isVehicleAccessible(vehicle, playerName) {
  const normalizedPlayerName = String(playerName ?? '')
    .trim()
    .toLowerCase();

  const owner = String(vehicle?.owner_name ?? vehicle?.ownerName ?? vehicle?.owner ?? '')
    .trim()
    .toLowerCase();

  if (!owner) {
    return false;
  }

  if (normalizedPlayerName && owner === normalizedPlayerName) {
    return true;
  }

  const relationship = String(vehicle?.relationship ?? vehicle?.relation ?? vehicle?.access ?? '')
    .trim()
    .toLowerCase();

  if (
    relationship === 'shared' ||
    relationship === 'member' ||
    relationship === 'visitor' ||
    relationship === 'guest'
  ) {
    return true;
  }

  const sharedWith = Array.isArray(vehicle?.shared_with)
    ? vehicle.shared_with
    : Array.isArray(vehicle?.sharedWith)
      ? vehicle.sharedWith
      : [];

  return sharedWith.some((person) => {
    const sharedName = String(person?.name ?? person?.username ?? person?.characterName ?? '')
      .trim()
      .toLowerCase();

    return sharedName && normalizedPlayerName && sharedName === normalizedPlayerName;
  });
}
