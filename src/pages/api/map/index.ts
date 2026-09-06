import { NextResponse, cookies, getRequestOrigin, runPagesApiHandler } from "../../../infrastructure/pages-api";

import { getDuneClient } from "../../../infrastructure/dune";
import { logger } from "../../../lib/logger";
import { getSession } from "../../../lib/session-store";

import { extractBaseRows, normalizeBase, getBaseId } from "../../../modules/map/server/bases";

import { extractOnlinePlayers, getOnlinePlayerId, extractPlayerId, getPlayerName } from "../../../modules/map/server/players";

import { extractVehicleRows, isVehicleAccessible, normalizeVehicle } from "../../../modules/map/server/vehicles";

import { extractRows, extractMapConfig, filterMapMarkers, addOnlineStatus } from "../../../modules/map/server/markers";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store",
};

function getErrorMessage(error) {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === "string") {
    return error;
  }

  return "Unable to load map data.";
}

function unauthorizedResponse(error = "Unauthorized", status = 401) {
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

async function GET(request, res) {
  const started = Date.now();

  try {
    const cookieStore = cookies(request, res);
    const sessionId = cookieStore.get("dashboard_session")?.value;

    if (!sessionId) {
      return unauthorizedResponse();
    }

    const session = await getSession(sessionId);

    if (!session || !session.expiresAt || session.expiresAt < Date.now()) {
      return unauthorizedResponse("Session expired or invalid");
    }

    if (!process.env.CONSOLE_URL) {
      throw new Error("CONSOLE_URL is not configured");
    }

    if (!process.env.ADAPTER_TOKEN) {
      throw new Error("ADAPTER_TOKEN is not configured");
    }

    const actor = {
      guildId: session.guildId,
      channelId: "dashboard",
      userId: session.user.id,
      username: session.user.username,
      roleIds: [...(session.roleIds || []), process.env.VERIFIED_MEMBER_ROLE_ID].filter(Boolean),
      interactionId: `map - ${Date.now()} `,
      commandName: "portal",
    };

    const playerResponse = await fetch(`${process.env.CONSOLE_URL}/api/integrations/discord/players/me`, {
      method: "POST",
      body: JSON.stringify({ actor }),
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.ADAPTER_TOKEN} `,
      },
      cache: "no-store",
    });

    if (!playerResponse.ok) {
      throw new Error(`Discord Adapter request failed with status: ${playerResponse.status} `);
    }

    const playerData = await playerResponse.json();

    if (playerData?.linked !== true) {
      return emptyMapResponse("Your Discord account is not linked to a Dune player.", 403);
    }

    const playerId = extractPlayerId(playerData);

    if (!playerId) {
      return emptyMapResponse("Unable to determine your Dune player ID.", 403);
    }

    const duneClient = getDuneClient();
    const url = new URL(request.url, getRequestOrigin(request));
    const mapName = url.searchParams.get("map")?.trim();

    const markerEndpoint = mapName ? `/api/map/markers?map=${encodeURIComponent(mapName)} ` : "/api/map/markers";

    const [basesData, mapData, vehiclesData, onlinePlayersData] = await Promise.all([
      duneClient.request("GET", `/api/players/${encodeURIComponent(playerId)}/bases`),

      duneClient.request("GET", markerEndpoint),

      duneClient.request("GET", "/api/vehicles"),

      duneClient.request("GET", "/api/players/online"),
    ]);

    // BASES
    const baseRows = extractBaseRows(basesData);
    const bases = baseRows.map(normalizeBase);

    const playerBaseIds = new Set(bases.map(getBaseId).filter(Boolean));

    // MAP MARKERS
    const allMarkers = extractRows(mapData);

    const onlinePlayers = extractOnlinePlayers(onlinePlayersData);

    const onlinePlayerIds = new Set(onlinePlayers.map(getOnlinePlayerId).filter(Boolean));

    const markers = filterMapMarkers(allMarkers, {
      playerId,
      playerData,
      session,
      playerBaseIds,
    });

    // VEHICLES
    const playerName = getPlayerName(playerData, session);

    const vehicleRows = extractVehicleRows(vehiclesData);

    const accessibleVehicles = vehicleRows.filter((vehicle) => isVehicleAccessible(vehicle, playerName, playerId));

    const playerVehicleMarkers = accessibleVehicles.map(normalizeVehicle);

    // FINAL MARKERS
    const finalMarkers = [...addOnlineStatus(markers, onlinePlayerIds), ...playerVehicleMarkers];

    // MAP CONFIG
    const map = extractMapConfig(mapData);

    if (!map) {
      logger.warn("No map configuration returned", {
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

    logger.error("Failed to load map data", { error });

    return NextResponse.json(
      {
        ok: false,
        error: getErrorMessage(error),
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

export default function handler(req, res) {
  return runPagesApiHandler(req, res, "GET", GET);
}
