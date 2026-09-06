import { getDuneClient } from "../../../infrastructure/dune";
import { cookies, NextResponse, runPagesApiHandler } from "../../../infrastructure/pages-api";
import { normalizeCurrency, extractVehicleRows, getBaseId, normalizeBaseStorage, normalizeBaseWater } from "../../../modules/player/server/helpers";
import { logger } from "../../../lib/logger";
import { getSession } from "../../../lib/session-store";

async function loadBaseTelemetry(base, duneClient) {
  const baseId = getBaseId(base);

  if (!baseId) {
    logger.warn("Cannot load water/inventory: no base ID found", { baseId });

    return {
      ...base,
      water: null,
      inventory: null,
      storage: {
        available: false,
        used: null,
        max: null,
        percent: null,
      },
      waterDataAvailable: false,
      inventoryDataAvailable: false,
    };
  }

  const encodedBaseId = encodeURIComponent(String(baseId));

  const waterEndpoint = `/api/bases/${encodedBaseId}/water`;

  const inventoryEndpoint = `/api/bases/${encodedBaseId}/inventory`;

  const [waterResult, inventoryResult] = await Promise.allSettled([duneClient.request("GET", waterEndpoint), duneClient.request("GET", inventoryEndpoint)]);

  let water = null;
  let inventory = null;

  if (waterResult.status === "fulfilled") {
    water = waterResult.value;
  } else {
    logger.error(`Failed to load base water`, { baseId, error: waterResult.reason });
  }

  if (inventoryResult.status === "fulfilled") {
    inventory = inventoryResult.value;
  } else {
    logger.error(`Failed to load base inventory`, { baseId, error: inventoryResult.reason });
  }

  const storage = normalizeBaseStorage(inventory);

  const normalizedWater = normalizeBaseWater(water);

  return {
    ...base,
    water,
    inventory,
    storage,
    waterSummary: normalizedWater,
    waterDataAvailable: normalizedWater.available,
    inventoryDataAvailable: storage.available,
  };
}

async function loadPlayerGuild(playerId, playerName, duneClient) {
  try {
    const guildResponse = await duneClient.request("GET", "/api/guilds?page=0&pageSize=100");

    const guilds = Array.isArray(guildResponse) ? guildResponse : Array.isArray(guildResponse?.rows) ? guildResponse.rows : Array.isArray(guildResponse?.data) ? guildResponse.data : [];

    for (const guild of guilds) {
      const guildId = guild?.id ?? guild?.guildId ?? guild?.guild_id;

      if (!guildId) continue;

      const memberResponse = await duneClient.request("GET", `/api/guilds/${encodeURIComponent(guildId)}/members`);

      const members = Array.isArray(memberResponse) ? memberResponse : Array.isArray(memberResponse?.rows) ? memberResponse.rows : Array.isArray(memberResponse?.data) ? memberResponse.data : [];

      const member = members.find((entry) => {
        const memberId = entry?.player_id ?? entry?.playerId ?? entry?.pawnId ?? entry?.pawn_id ?? entry?.controllerId ?? entry?.controller_id;
        const memberName = String(entry?.character_name ?? entry?.characterName ?? entry?.name ?? "")
          .trim()
          .toLowerCase();
        return (
          String(memberId ?? "") === String(playerId) ||
          (memberName &&
            memberName ===
              String(playerName ?? "")
                .trim()
                .toLowerCase())
        );
      });

      if (member) {
        return {
          id: guildId,
          name: guild?.name ?? guild?.guildName ?? guild?.guild_name ?? "Unknown Guild",
          tag: guild?.tag ?? guild?.abbreviation ?? null,
          rank: member?.rank ?? member?.role ?? member?.memberRole ?? null,
        };
      }
    }
  } catch (error) {
    logger.error("Failed to load player guild", { error });
  }

  return null;
}

/**
 * GET /api/player
 */
async function GET(request, res) {
  try {
    // Create/get the Dune client only when the request runs.
    const duneClient = getDuneClient();

    const cookieStore = cookies(request, res);

    const sessionId = cookieStore.get("dashboard_session")?.value;

    if (!sessionId) {
      return NextResponse.json(
        {
          error: "Unauthorized",
        },
        {
          status: 401,
        },
      );
    }

    const session = await getSession(sessionId);

    if (!session || session.expiresAt < Date.now()) {
      return NextResponse.json(
        {
          error: "Session expired or invalid",
        },
        {
          status: 401,
        },
      );
    }

    const actor = {
      guildId: session.guildId,
      channelId: "dashboard",
      userId: session.user.id,
      username: session.user.username,
      roleIds: [...(session.roleIds || []), process.env.VERIFIED_MEMBER_ROLE_ID].filter(Boolean),
      interactionId: `dashboard-${Date.now()}`,
      commandName: "portal",
    };

    if (!process.env.CONSOLE_URL) {
      throw new Error("CONSOLE_URL is not configured");
    }

    if (!process.env.ADAPTER_TOKEN) {
      throw new Error("ADAPTER_TOKEN is not configured");
    }

    const endpoint = `${process.env.CONSOLE_URL}/api/integrations/discord/players/me`;

    const resAdapter = await fetch(endpoint, {
      method: "POST",
      body: JSON.stringify({
        actor,
      }),
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.ADAPTER_TOKEN}`,
      },
      cache: "no-store",
    });

    if (!resAdapter.ok) {
      throw new Error(`Discord Adapter request failed with status: ${resAdapter.status}`);
    }

    const data = await resAdapter.json();

    if (data?.linked !== true) {
      return NextResponse.json(data, {
        status: 200,
      });
    }

    const playerId = data.pawnId ?? data.controllerId;

    if (!playerId) {
      return NextResponse.json(
        {
          ...data,
          linked: false,
          error: "Unable to determine your Dune player ID.",
        },
        {
          status: 200,
        },
      );
    }

    /**
     * Core player endpoints.
     */
    const coreEndpoints = ["currency", "solaris-coin", "factions", "intel", "specs", "progression", "vitals", "bases", "vehicles"];

    const details = await Promise.all(
      coreEndpoints.map(async (name) => {
        try {
          const playerEndpoint = name === "vehicles" ? "/api/vehicles" : `/api/players/${encodeURIComponent(playerId)}/${name}`;

          const resData = await duneClient.request("GET", playerEndpoint);

          if (name === "vehicles") {
            const allVehicles = Array.isArray(resData?.rows) ? resData.rows : [];

            return [
              name,
              {
                ...resData,
                rows: allVehicles,
                totalCount: allVehicles.length,
              },
            ];
          }

          /**
           * Bases
           */
          if (name === "bases") {
            const bases = Array.isArray(resData) ? resData : Array.isArray(resData?.rows) ? resData.rows : Array.isArray(resData?.data) ? resData.data : Array.isArray(resData?.bases) ? resData.bases : [];

            const enrichedBases = await Promise.all(bases.map(async (base) => loadBaseTelemetry(base, duneClient)));

            let result;

            if (Array.isArray(resData)) {
              result = enrichedBases;
            } else if (resData && typeof resData === "object") {
              result = {
                ...resData,
                rows: enrichedBases,
              };

              if (Array.isArray(resData.data)) {
                result.data = enrichedBases;
              }

              if (Array.isArray(resData.bases)) {
                result.bases = enrichedBases;
              }
            } else {
              result = {
                rows: enrichedBases,
              };
            }

            return [name, result];
          }

          return [name, resData];
        } catch (error) {
          logger.error(`Failed to load player telemetry`, { endpoint: name, error });

          return [name, null];
        }
      }),
    );

    const guild = await loadPlayerGuild(playerId, data.characterName, duneClient);

    /**
     * Final response.
     */
    const responseData = {
      ...data,
      details: {
        ...Object.fromEntries(details),
        guild,
      },
    };

    return NextResponse.json(responseData, {
      status: 200,
    });
  } catch (error) {
    logger.error("Error inside player route telemetry processor", { error });

    return NextResponse.json(
      {
        ok: false,
        linked: false,
        error: "Unable to load your Dune player profile right now.",
        status: error?.message,
      },
      {
        status: 500,
      },
    );
  }
}

export default function handler(req, res) {
  return runPagesApiHandler(req, res, "GET", GET);
}
