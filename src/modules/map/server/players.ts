export function extractOnlinePlayers(data) {
    if (Array.isArray(data)) {
        return data;
    }

    if (!data || typeof data !== 'object') {
        return [];
    }

    const candidates = [
        data.rows,
        data.players,
        data.data?.rows,
        data.data?.players,
        data.data,
    ];

    for (const candidate of candidates) {
        if (Array.isArray(candidate)) {
            return candidate;
        }
    }

    return [];
}

export function getOnlinePlayerId(player) {
    return String(
        player?.pawnId ??
        player?.pawn_id ??
        player?.playerPawnId ??
        player?.player_pawn_id ??
        player?.playerId ??
        player?.player_id ??
        player?.id ??
        ''
    ).trim();
}

export function extractPlayerId(data) {
    return (
        data?.pawnId ??
        data?.controllerId ??
        data?.playerId ??
        data?.player_id ??
        null
    );
}

export function getPlayerName(
    playerData,
    session
) {
    return (
        playerData?.character_name ??
        playerData?.characterName ??
        playerData?.player_name ??
        playerData?.playerName ??
        playerData?.username ??
        playerData?.name ??
        playerData?.player?.character_name ??
        playerData?.player?.characterName ??
        playerData?.player?.player_name ??
        playerData?.player?.playerName ??
        playerData?.player?.username ??
        playerData?.player?.name ??
        session?.user?.username ??
        ''
    );
}

export function normalizePlayerName(
    playerData,
    session
) {
    return String(
        getPlayerName(
            playerData,
            session
        )
    )
        .trim()
        .toLowerCase();
}

export function isCurrentPlayerMarker(
    marker,
    playerId,
    playerData,
    session
) {
    const markerId = String(
        marker?.id ??
        marker?.player_id ??
        marker?.playerId ??
        marker?.pawn_id ??
        marker?.pawnId ??
        ''
    ).trim();

    const markerAccountId = String(
        marker?.account_id ??
        marker?.accountId ??
        ''
    ).trim();

    const markerName = String(
        marker?.name ??
        marker?.character_name ??
        marker?.characterName ??
        marker?.player_name ??
        marker?.playerName ??
        ''
    )
        .trim()
        .toLowerCase();

    const currentPlayerId = String(
        playerId ?? ''
    ).trim();

    const currentAccountId = String(
        playerData?.account_id ??
        playerData?.accountId ??
        playerData?.account?.id ??
        ''
    ).trim();

    const currentPlayerName = String(
        getPlayerName(
            playerData,
            session
        )
    )
        .trim()
        .toLowerCase();

    if (
        currentPlayerId &&
        markerId &&
        markerId === currentPlayerId
    ) {
        return true;
    }

    if (
        currentAccountId &&
        markerAccountId &&
        markerAccountId === currentAccountId
    ) {
        return true;
    }

    if (
        currentPlayerName &&
        markerName &&
        markerName === currentPlayerName
    ) {
        return true;
    }

    return false;
}