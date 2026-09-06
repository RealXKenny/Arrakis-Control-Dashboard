import {
    getMarkerBaseId,
} from './bases';

import {
    isCurrentPlayerMarker,
} from './players';

export function extractRows(data) {
    if (Array.isArray(data)) {
        return data;
    }

    if (!data || typeof data !== 'object') {
        return [];
    }

    const candidates = [
        data.markers,
        data.rows,
        data.data?.markers,
        data.data?.rows,
        data.data,
    ];

    for (const candidate of candidates) {
        if (Array.isArray(candidate)) {
            return candidate;
        }
    }

    return [];
}

export function extractMapConfig(data) {
    if (!data || typeof data !== 'object') {
        return null;
    }

    if (data.map) {
        return data.map;
    }

    if (
        data.maps &&
        data.defaultMap
    ) {
        const defaultMap =
            data.maps[data.defaultMap];

        if (defaultMap) {
            return defaultMap;
        }
    }

    if (
        data.maps &&
        typeof data.maps === 'object'
    ) {
        const firstMap =
            Object.values(data.maps)[0];

        if (firstMap) {
            return firstMap;
        }
    }

    if (data.config) {
        return data.config;
    }

    if (data.data?.map) {
        return data.data.map;
    }

    if (data.data?.config) {
        return data.data.config;
    }

    return null;
}

export function filterMapMarkers(
    allMarkers,
    {
        playerId,
        playerData,
        session,
        playerBaseIds,
    }
) {
    const supportedMarkerTypes =
        new Set([
            'player',
            'base',
            'storage',
            'vehicle',
            'spice',
            'spice_active',
            'flour_sand',
            'ore',
            'scrap',
            'flora',
            'poi',
            'house_representative',
            'trainer',
            'fortress',
            'hazard',
            'enemy',
        ]);

    return allMarkers.filter((marker) => {
        const type = String(
            marker?.type || ''
        )
            .trim()
            .toLowerCase();

        if (
            !supportedMarkerTypes.has(type)
        ) {
            return false;
        }

        if (type === 'player') {
            return isCurrentPlayerMarker(
                marker,
                playerId,
                playerData,
                session
            );
        }

        if (type === 'vehicle') {
            return false;
        }

        if (type === 'base') {
            const markerBaseId =
                getMarkerBaseId(marker);

            return (
                markerBaseId &&
                playerBaseIds.has(
                    markerBaseId
                )
            );
        }

        return true;
    });
}

export function addOnlineStatus(
    markers,
    onlinePlayerIds
) {
    return markers.map((marker) => {
        const type = String(
            marker?.type || ''
        )
            .trim()
            .toLowerCase();

        if (type !== 'player') {
            return marker;
        }

        const markerPlayerId = String(
            marker?.pawn_id ??
            marker?.pawnId ??
            marker?.player_pawn_id ??
            marker?.playerPawnId ??
            marker?.player_id ??
            marker?.playerId ??
            marker?.id ??
            ''
        ).trim();

        return {
            ...marker,
            online:
                markerPlayerId
                    ? onlinePlayerIds.has(
                        markerPlayerId
                    )
                    : false,
        };
    });
}
