export function extractBaseRows(data) {
    if (Array.isArray(data)) {
        return data;
    }

    if (!data || typeof data !== 'object') {
        return [];
    }

    const candidates = [
        data.rows,
        data.bases,
        data.data?.rows,
        data.data?.bases,
        data.data,
    ];

    for (const candidate of candidates) {
        if (Array.isArray(candidate)) {
            return candidate;
        }
    }

    return [];
}

export function normalizeBase(base, index) {
    const x =
        base?.x ??
        base?.pos_x ??
        base?.longitude ??
        base?.position?.x ??
        base?.coordinates?.x ??
        null;

    const y =
        base?.y ??
        base?.pos_y ??
        base?.latitude ??
        base?.position?.y ??
        base?.coordinates?.y ??
        null;

    return {
        ...base,
        id:
            base?.id ??
            base?.base_id ??
            `base-${index}`,
        name:
            base?.name ??
            base?.base_name ??
            base?.character_name ??
            `Base ${index + 1}`,
        x,
        y,
        icon:
            base?.icon ??
            'Base',
    };
}

export function getBaseId(base) {
    const value =
        base?.base_id ??
        base?.baseId ??
        base?.id ??
        base?.uuid;

    if (
        value === undefined ||
        value === null ||
        value === ''
    ) {
        return null;
    }

    return String(value);
}

export function getMarkerBaseId(marker) {
    return getBaseId(marker);
}