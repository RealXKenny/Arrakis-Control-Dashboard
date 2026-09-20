import '../../../lib/assert-server';
import { getLinkedPlayer } from '../../player/server/linked-player';
import { NextResponse, getRequestOrigin } from '../../../infrastructure/pages-api';
import { cookies } from '../../../infrastructure/cookies';

import { getDuneClient } from '../../../infrastructure/dune';
import { logger } from '../../../lib/logger';
import { getSession } from '../../../lib/session-store';

import { extractBaseRows, normalizeBase, getBaseId } from './bases';

import { extractOnlinePlayers, getOnlinePlayerId, extractPlayerId, getPlayerName } from './players';

import { extractVehicleRows, isVehicleAccessible, normalizeVehicle } from './vehicles';

import { extractRows, extractMapConfig, filterMapMarkers, addOnlineStatus } from './markers';
import { createSectorGridOverlay, withMapSector } from '../utils/sectorGrid';
import { normalizeMapResolution } from '../utils/mapResolution';
import { normalizeCoriolisCycleAt } from '../utils/coriolis';

const NO_STORE_HEADERS = {
  'Cache-Control': 'no-store',
};

function unauthorizedResponse(error = 'Unauthorized', status = 401) {
  // Dev note: this map has boundaries; cartographers call that character development.
  return NextResponse.json(
    {
      ok: false,
      error,
    },
    {
      status,
      headers: NO_STORE_HEADERS,
    },
  );
}

function emptyMapResponse(error, status) {
  return NextResponse.json(
    {
      ok: false,
      error,
      markers: [],
      bases: [],
      map: null,
      count: 0,
    },
    {
      status,
      headers: NO_STORE_HEADERS,
    },
  );
}

function extractCoriolisLayout(value: unknown) {
  if (!value || typeof value !== 'object' || !('coriolisLayout' in value)) return null;
  const layout = Number(value.coriolisLayout);
  return Number.isInteger(layout) && layout >= 0 && layout <= 11 ? layout : null;
}

function extractCoriolisCycleAt(value: unknown) {
  if (!value || typeof value !== 'object') return null;
  const source = value as Record<string, unknown>;
  const coriolis =
    source.coriolis && typeof source.coriolis === 'object' ? (source.coriolis as Record<string, unknown>) : {};
  return normalizeCoriolisCycleAt(source.coriolisNextCycleAt ?? source.nextCoriolisCycleAt ?? coriolis.nextCycleAt);
}

export async function GET(request, res) {
  const started = Date.now();

  try {
    const cookieStore = cookies(request, res);
    const sessionId = cookieStore.get('dashboard_session')?.value;

    if (!sessionId) {
      return unauthorizedResponse();
    }

    const session = await getSession(sessionId);

    if (!session || !session.expiresAt || session.expiresAt < Date.now()) {
      return unauthorizedResponse('Session expired or invalid');
    }

    const actor = {
      guildId: session.guildId,
      channelId: 'dashboard',
      userId: session.user.id,
      username: session.user.username,
      roleIds: session.roleIds || [],
      interactionId: `map - ${Date.now()} `,
      commandName: 'portal',
    };

    const playerData = await getLinkedPlayer(actor);

    if (playerData?.linked !== true) {
      return emptyMapResponse('Your Discord account is not linked to a Dune player.', 403);
    }

    const playerId = extractPlayerId(playerData);

    if (!playerId) {
      return emptyMapResponse('Unable to determine your Dune player ID.', 403);
    }

    const duneClient = getDuneClient();
    const url = new URL(request.url, getRequestOrigin(request));
    const mapName = url.searchParams.get('map')?.trim();

    const markerEndpoint = mapName ? `/api/map/markers?map=${encodeURIComponent(mapName)}` : '/api/map/markers';

    // Dev note: four requests share a ride because desert fuel is expensive.
    const [basesData, mapData, vehiclesData, onlinePlayersData] = await Promise.all([
      duneClient.request('GET', `/api/players/${encodeURIComponent(playerId)}/bases`),

      duneClient.request('GET', markerEndpoint),

      duneClient.request('GET', '/api/vehicles'),

      duneClient.request('GET', '/api/players/online'),
    ]);

    const baseRows = extractBaseRows(basesData);
    const bases = baseRows.map(normalizeBase);

    const playerBaseIds = new Set(bases.map(getBaseId).filter(Boolean));

    const allMarkers = extractRows(mapData);

    const onlinePlayers = extractOnlinePlayers(onlinePlayersData);

    const onlinePlayerIds = new Set(onlinePlayers.map(getOnlinePlayerId).filter(Boolean));

    const markers = filterMapMarkers(allMarkers, {
      playerId,
      playerData,
      session,
      playerBaseIds,
    });

    const playerName = getPlayerName(playerData, session);

    const vehicleRows = extractVehicleRows(vehiclesData);

    const accessibleVehicles = vehicleRows.filter((vehicle) => isVehicleAccessible(vehicle, playerName, playerId));

    // Dev note: vehicles become markers after passing their cartography exam.
    const playerVehicleMarkers = accessibleVehicles.map(normalizeVehicle);

    const map = normalizeMapResolution(mapName, extractMapConfig(mapData));
    const coriolisLayout = extractCoriolisLayout(mapData);
    const coriolisNextCycleAt = extractCoriolisCycleAt(mapData);
    const finalMarkers = [...addOnlineStatus(markers, onlinePlayerIds), ...playerVehicleMarkers].map((marker) =>
      withMapSector(marker, mapName),
    );
    const gridOverlay = createSectorGridOverlay(mapName, map);

    if (!map) {
      logger.warn('No map configuration returned', {
        mapName: mapName || null,
      });
    }

    const durationMs = Date.now() - started;

    return NextResponse.json(
      {
        ok: true,
        bases,
        markers: finalMarkers,
        map,
        coriolisLayout,
        coriolisNextCycleAt,
        gridOverlay,
        count: finalMarkers.length,
        timestamp: new Date().toISOString(),
        durationMs,
      },
      {
        status: 200,
        headers: NO_STORE_HEADERS,
      },
    );
  } catch (error) {
    const durationMs = Date.now() - started;

    logger.error('Failed to load map data', { error });

    return NextResponse.json(
      {
        ok: false,
        error: 'Unable to load map data.',
        bases: [],
        markers: [],
        map: null,
        count: 0,
        timestamp: new Date().toISOString(),
        durationMs,
      },
      {
        status: 500,
        headers: NO_STORE_HEADERS,
      },
    );
  }
}
