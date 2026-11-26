import '../../../lib/assert-server';
import { getLinkedPlayer } from '../../player/server/linked-player';

import { getDuneClient } from '../../../server/integrations/dune';
import { logger } from '../../../lib/logger';
import type { DashboardSession } from '../../auth/server/session-store';

import { extractBaseRows, normalizeBase, getBaseId } from './bases';

import { extractOnlinePlayers, getOnlinePlayerId, extractPlayerId, getPlayerName } from './players';

import { extractVehicleRows, isVehicleAccessible, normalizeVehicle } from './vehicles';

import { extractRows, extractMapConfig, filterMapMarkers, addOnlineStatus } from './markers';
import { createSectorGridOverlay, withMapSector } from '../utils/sector-grid';
import { normalizeMapResolution } from '../utils/map-resolution';
import { normalizeCoriolisCycleAt } from '../utils/coriolis';
import { isMapName } from '../maps';
import { getServerEnv } from '../../../config/env';
import { isSecureConsoleOrigin } from '../../../server/integrations/console-origin';
import { readShared, type CachePolicy } from '../../../lib/cache/shared-cache';

/**
 * Live map data shared by every viewer: twenty seconds fresh (the map polls every thirty while visible), kept for an
 * hour as the last good reading. Raw readings stay server-side; per-member filtering happens on every request.
 */
function sharedMapPolicy(name: 'map-markers' | 'vehicles' | 'online-players' | 'hub-players'): CachePolicy<unknown> {
  return {
    name,
    version: 1,
    freshMs: 20_000,
    retainMs: 3_600_000,
    maxBytes: 8 * 1024 * 1024,
    validate: (raw) => (raw && typeof raw === 'object' ? raw : undefined),
  };
}

export type MapLoadResult = { status: number; body: Record<string, unknown> };

function emptyMap(error: string, status: number): MapLoadResult {
  return { status, body: { ok: false, error, markers: [], bases: [], map: null, count: 0 } };
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

export async function loadMapData(
  session: DashboardSession,
  mapParam: string | null | undefined,
): Promise<MapLoadResult> {
  const started = Date.now();
  const requested = mapParam?.trim() || 'HaggaBasin';
  if (!isMapName(requested)) return emptyMap('Invalid map.', 400);
  if (requested !== 'HaggaBasin' && requested !== 'DeepDesert' && !isSecureConsoleOrigin(getServerEnv().DUNE_API_URL))
    return emptyMap('Secure Console transport is required.', 503);

  try {
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
      return emptyMap('Your Discord account is not linked to a Dune player.', 403);
    }

    const playerId = extractPlayerId(playerData);

    if (!playerId) {
      return emptyMap('Unable to determine your Dune player ID.', 403);
    }

    if (requested === 'Arrakeen' || requested === 'HarkoVillage') {
      // Do not infer a hub position from a name or project it onto unverified map artwork.
      const pawn = playerData.pawnId == null ? '' : String(playerData.pawnId).trim();
      if (!/^[A-Za-z0-9_-]{1,128}$/.test(pawn)) return emptyMap('Unable to verify your linked character.', 403);
      // One shared hub roster reading per fifteen seconds serves every viewer; only the member's own row is used.
      const hubReading = await readShared(
        { ...sharedMapPolicy('hub-players'), freshMs: 15_000, retainMs: 120_000 },
        [requested],
        () =>
          getDuneClient().request('GET', `/api/map/players?map=${encodeURIComponent(requested)}`, {
            timeoutMs: 10000,
            retryRead: false,
          }),
      );
      const response: unknown = hubReading.data;
      const verified = await getLinkedPlayer(actor);
      if (
        !verified.linked ||
        String(verified.pawnId ?? '') !== pawn ||
        String(verified.controllerId ?? '') !== String(playerData.controllerId ?? '')
      )
        return emptyMap('Your linked character changed. Refresh to try again.', 409);
      const data =
        response && typeof response === 'object' && !Array.isArray(response)
          ? (response as Record<string, unknown>)
          : {};
      const capabilities =
        data.capabilities && typeof data.capabilities === 'object'
          ? (data.capabilities as Record<string, unknown>)
          : {};
      if (capabilities.players !== true || !Array.isArray(data.rows) || data.rows.length > 10000)
        return emptyMap('Player positions are unavailable for this location.', 503);
      const matches = data.rows.filter((row: unknown) => {
        if (!row || typeof row !== 'object' || Array.isArray(row)) return false;
        const item = row as Record<string, unknown>;
        return (
          String(item.id ?? '') === pawn &&
          item.type === 'player' &&
          item.map === requested &&
          typeof item.online_status === 'string' &&
          item.online_status.trim().toLowerCase() === 'online'
        );
      });
      if (matches.length > 1) return emptyMap('Player position is ambiguous.', 503);
      const row = matches[0] as Record<string, unknown> | undefined;
      const position =
        row &&
        [row.x, row.y, row.z].every((value) => typeof value === 'number' && Number.isFinite(value)) &&
        typeof row.partition_id === 'number' &&
        Number.isSafeInteger(row.partition_id) &&
        row.partition_id >= 0
          ? { x: row.x, y: row.y, z: row.z, partition: row.partition_id }
          : null;
      if (row && !position) return emptyMap('Player position is invalid.', 503);
      return {
        status: 200,
        // The time the roster was actually read, never the time of this request.
        body: { ok: true, location: requested, position, observedAt: new Date(hubReading.fetchedAt).toISOString() },
      };
    }

    const duneClient = getDuneClient();
    const mapName = mapParam?.trim();
    const markerEndpoint = mapName ? `/api/map/markers?map=${encodeURIComponent(mapName)}` : '/api/map/markers';

    // Dev note: four requests share a ride because desert fuel is expensive.
    // Only the member's own bases are a per-member read. Markers, vehicles and the online list are the same for every
    // viewer, so they come from one shared reading per refresh interval and are filtered per member below.
    const [basesData, mapData, vehiclesData, onlinePlayersData] = await Promise.all([
      duneClient.request('GET', `/api/players/${encodeURIComponent(playerId)}/bases`),
      readShared(sharedMapPolicy('map-markers'), [markerEndpoint], () =>
        duneClient.request('GET', markerEndpoint),
      ).then((reading) => reading.data),
      readShared(sharedMapPolicy('vehicles'), ['all'], () => duneClient.request('GET', '/api/vehicles')).then(
        (reading) => reading.data,
      ),
      readShared(sharedMapPolicy('online-players'), ['all'], () =>
        duneClient.request('GET', '/api/players/online'),
      ).then((reading) => reading.data),
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

    return {
      status: 200,
      body: {
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
    };
  } catch (error) {
    const durationMs = Date.now() - started;

    logger.error('Failed to load map data', { error });

    return {
      status: 500,
      body: {
        ok: false,
        error: 'Unable to load map data.',
        bases: [],
        markers: [],
        map: null,
        count: 0,
        timestamp: new Date().toISOString(),
        durationMs,
      },
    };
  }
}
