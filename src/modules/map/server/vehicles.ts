export function getVehicleOwner(vehicle) {
    return String(
        vehicle?.owner_name ??
        vehicle?.ownerName ??
        vehicle?.owner ??
        vehicle?.owner_character_name ??
        vehicle?.ownerCharacterName ??
        ''
    )
        .trim()
        .toLowerCase();
}

export function getVehicleOwnerId(vehicle) {
    const value =
        vehicle?.owner_id ??
        vehicle?.ownerId ??
        vehicle?.owner_player_id ??
        vehicle?.ownerPlayerId ??
        vehicle?.player_id ??
        vehicle?.playerId ??
        null;

    if (
        value === undefined ||
        value === null ||
        value === ''
    ) {
        return '';
    }

    return String(value).trim();
}

export function isVehicleAccessible(
    vehicle,
    playerName,
    playerId
) {
    const normalizedPlayerName =
        String(playerName ?? '')
            .trim()
            .toLowerCase();

    const normalizedPlayerId =
        String(playerId ?? '').trim();

    const owner =
        getVehicleOwner(vehicle);

    const ownerId =
        getVehicleOwnerId(vehicle);

    if (
        normalizedPlayerId &&
        ownerId &&
        ownerId === normalizedPlayerId
    ) {
        return true;
    }

    if (
        normalizedPlayerName &&
        owner &&
        owner === normalizedPlayerName
    ) {
        return true;
    }

    const relationship = String(
        vehicle?.relationship ??
        vehicle?.relation ??
        vehicle?.access ??
        vehicle?.access_type ??
        vehicle?.accessType ??
        ''
    )
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

    const sharedWith =
        Array.isArray(vehicle?.shared_with)
            ? vehicle.shared_with
            : Array.isArray(vehicle?.sharedWith)
                ? vehicle.sharedWith
                : Array.isArray(vehicle?.shared_players)
                    ? vehicle.shared_players
                    : Array.isArray(vehicle?.sharedPlayers)
                        ? vehicle.sharedPlayers
                        : [];

    return sharedWith.some((person) => {
        if (
            person === null ||
            person === undefined
        ) {
            return false;
        }

        if (
            typeof person === 'string' ||
            typeof person === 'number'
        ) {
            const value = String(person)
                .trim()
                .toLowerCase();

            return (
                (
                    normalizedPlayerName &&
                    value === normalizedPlayerName
                ) ||
                (
                    normalizedPlayerId &&
                    value === normalizedPlayerId
                )
            );
        }

        const sharedName = String(
            person?.name ??
            person?.username ??
            person?.character_name ??
            person?.characterName ??
            person?.player_name ??
            person?.playerName ??
            ''
        )
            .trim()
            .toLowerCase();

        const sharedId = String(
            person?.id ??
            person?.player_id ??
            person?.playerId ??
            ''
        ).trim();

        return (
            (
                normalizedPlayerName &&
                sharedName === normalizedPlayerName
            ) ||
            (
                normalizedPlayerId &&
                sharedId === normalizedPlayerId
            )
        );
    });
}

export function extractVehicleRows(data) {
    if (Array.isArray(data)) {
        return data;
    }

    if (!data || typeof data !== 'object') {
        return [];
    }

    const queue = [data];
    const seen = new Set();

    while (queue.length > 0) {
        const current = queue.shift();

        if (
            !current ||
            typeof current !== 'object'
        ) {
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

export function normalizeVehicle(
    vehicle,
    index
) {
    return {
        ...vehicle,
        id:
            vehicle?.id ??
            vehicle?.vehicle_id ??
            vehicle?.vehicleId ??
            vehicle?.uuid ??
            `vehicle-${index}`,
        type: 'vehicle',
        x:
            vehicle?.x ??
            vehicle?.pos_x ??
            vehicle?.position?.x ??
            vehicle?.coordinates?.x ??
            null,
        y:
            vehicle?.y ??
            vehicle?.pos_y ??
            vehicle?.position?.y ??
            vehicle?.coordinates?.y ??
            null,
    };
}