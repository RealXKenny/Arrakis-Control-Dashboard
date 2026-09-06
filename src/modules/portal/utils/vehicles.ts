export function extractVehicles(player) {
  const response =
    player?.details?.vehicles;

  if (Array.isArray(response)) {
    return response;
  }

  // Vehicle data may be nested under rows, vehicles,
  // data, results, or items.
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

export function getVehicleId(vehicle) {
  return (
    vehicle?.id ??
    vehicle?.vehicle_id ??
    vehicle?.vehicleId ??
    vehicle?.uuid ??
    null
  );
}

export function getVehicleName(vehicle, index) {
  return (
    vehicle?.name ??
    vehicle?.vehicleName ??
    vehicle?.vehicle_name ??
    `Vehicle ${index + 1}`
  );
}

export function getVehicleType(vehicle) {
  return (
    vehicle?.type ??
    vehicle?.vehicleType ??
    vehicle?.vehicle_type ??
    'Unknown'
  );
}

export function getVehicleOwner(vehicle) {
  return (
    vehicle?.owner_name ??
    vehicle?.ownerName ??
    vehicle?.owner ??
    'Unknown'
  );
}

export function isOwnedVehicle(vehicle, playerName) {
  const relationship = String(
    vehicle?.relationship ??
    vehicle?.relation ??
    vehicle?.access ??
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
    relationship === 'guest'
  ) {
    return false;
  }

  const normalizedPlayerName =
    String(playerName ?? '')
      .trim()
      .toLowerCase();

  const owner = String(
    vehicle?.owner_name ??
    vehicle?.ownerName ??
    vehicle?.owner ??
    ''
  )
    .trim()
    .toLowerCase();

  // Explicit owner match = Own.
  if (
    owner &&
    normalizedPlayerName &&
    owner === normalizedPlayerName
  ) {
    return true;
  }

  // Blank owner = Own.
  if (!owner) {
    return true;
  }

  return false;
}

export function isVehicleAccessible(vehicle, playerName) {
  const normalizedPlayerName =
    String(playerName ?? '')
      .trim()
      .toLowerCase();

  const owner = String(
    vehicle?.owner_name ??
    vehicle?.ownerName ??
    vehicle?.owner ??
    ''
  )
    .trim()
    .toLowerCase();

  // Vehicles with no owner are ignored completely.
  if (!owner) {
    return false;
  }

  // Current player owns it.
  if (
    normalizedPlayerName &&
    owner === normalizedPlayerName
  ) {
    return true;
  }

  const relationship = String(
    vehicle?.relationship ??
    vehicle?.relation ??
    vehicle?.access ??
    ''
  )
    .trim()
    .toLowerCase();

  // Explicit shared/access relationship.
  if (
    relationship === 'shared' ||
    relationship === 'member' ||
    relationship === 'visitor' ||
    relationship === 'guest'
  ) {
    return true;
  }

  const sharedWith =
    Array.isArray(vehicle?.shared_with)
      ? vehicle.shared_with
      : Array.isArray(vehicle?.sharedWith)
        ? vehicle.sharedWith
        : [];

  return sharedWith.some((person) => {
    const sharedName = String(
      person?.name ??
      person?.username ??
      person?.characterName ??
      ''
    )
      .trim()
      .toLowerCase();

    return (
      sharedName &&
      normalizedPlayerName &&
      sharedName === normalizedPlayerName
    );
  });
}

export function getVehicleRelationship(
  vehicle,
  playerName
) {
  return isOwnedVehicle(
    vehicle,
    playerName
  )
    ? 'Owned'
    : 'Shared';
}