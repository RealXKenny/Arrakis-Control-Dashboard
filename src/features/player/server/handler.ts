import '../../../lib/assert-server';
import { record } from '../../../lib/value';
import { getLinkedPlayer } from './linked-player';
import { getDuneClient } from '../../../server/integrations/dune';
import { NextResponse } from '../../../server/pages-api';
import { cookies } from '../../../server/cookies';
import { getBaseId, normalizeBaseStorage, normalizeBaseWater } from './helpers';
import { logger } from '../../../lib/logger';
import { ReadCache } from '../../../lib/cache/read-cache';
import { saveSession, type DashboardSession } from '../../auth/server/session-store';
import { getSession } from '../../auth/server/session';
import { discordAvatar } from './avatar';

async function loadBaseTelemetry(base, duneClient) {
  const baseId = getBaseId(base);

  if (!baseId) {
    logger.warn('Cannot load water/inventory: no base ID found', { baseId });

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

  const [waterResult, inventoryResult] = await Promise.allSettled([
    duneClient.request('GET', waterEndpoint),
    duneClient.request('GET', inventoryEndpoint),
  ]);

  // Dev note: allSettled keeps one leaky water tank from evicting the whole base.
  let water = null;
  let inventory = null;

  if (waterResult.status === 'fulfilled') {
    water = waterResult.value;
  } else {
    logger.error(`Failed to load base water`, { baseId, error: waterResult.reason });
  }

  if (inventoryResult.status === 'fulfilled') {
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

/**
 * Does this guild-roster row describe the signed-in player? A row that reports any player ID is matched by ID only,
 * across every ID field the Console uses. Names are not unique, so they are used solely for rows that report no
 * ID at all; otherwise a same-named member of another guild would be shown as this player's guild and rank.
 */
export function rosterRowIsPlayer(entry: unknown, ownIds: Set<string>, playerName: unknown): boolean {
  const row = record(entry);
  const ids = [row.player_id, row.playerId, row.pawnId, row.pawn_id, row.controllerId, row.controller_id].filter(
    (id) => id !== undefined && id !== null && String(id) !== '',
  );
  if (ids.length) return ids.some((id) => ownIds.has(String(id)));
  const name = String(row.character_name ?? row.characterName ?? row.name ?? '')
    .trim()
    .toLowerCase();
  return (
    Boolean(name) &&
    name ===
      String(playerName ?? '')
        .trim()
        .toLowerCase()
  );
}

/** Guild lookups walk the Console's guild list, so each member's answer is kept briefly and shared by every request. */
const playerGuilds = new ReadCache<Record<string, unknown> | null>(
  (value) => JSON.stringify(value ?? null).length,
  () => true,
  { ttlMs: 60_000, maxEntries: 200, maxPending: 20 },
);
/** Member rosters fetched at once. Bounds the Console fan-out of a single lookup. */
const GUILD_LOOKUP_CONCURRENCY = 5;

function loadPlayerGuild(playerIds: unknown[], playerName, duneClient) {
  const ownIds = new Set(playerIds.filter((id) => id !== undefined && id !== null && id !== '').map(String));
  if (!ownIds.size) return Promise.resolve(null);
  return playerGuilds
    .get(`guild:${[...ownIds].sort().join(',')}`, () => findPlayerGuild(ownIds, playerName, duneClient))
    .then((entry) => entry.data);
}

async function findPlayerGuild(ownIds: Set<string>, playerName, duneClient) {
  try {
    const guildResponse = await duneClient.request('GET', '/api/guilds?page=0&pageSize=100');

    const guilds = Array.isArray(guildResponse)
      ? guildResponse
      : Array.isArray(guildResponse?.rows)
        ? guildResponse.rows
        : Array.isArray(guildResponse?.data)
          ? guildResponse.data
          : [];

    const inspect = async (guild) => {
      const guildId = guild?.id ?? guild?.guildId ?? guild?.guild_id;
      if (!guildId) return null;

      const memberResponse = await duneClient.request('GET', `/api/guilds/${encodeURIComponent(guildId)}/members`);

      const members = Array.isArray(memberResponse)
        ? memberResponse
        : Array.isArray(memberResponse?.rows)
          ? memberResponse.rows
          : Array.isArray(memberResponse?.data)
            ? memberResponse.data
            : [];

      const member = members.find((entry) => rosterRowIsPlayer(entry, ownIds, playerName));
      if (!member) return null;
      return {
        id: guildId,
        name: guild?.name ?? guild?.guildName ?? guild?.guild_name ?? 'Unknown Guild',
        tag: guild?.tag ?? guild?.abbreviation ?? null,
        faction: guild?.faction_name ?? guild?.guild_faction_name ?? guild?.faction ?? guild?.guild_faction ?? null,
        rank: member?.rank ?? member?.role ?? member?.memberRole ?? member?.role_id ?? member?.roleId ?? null,
      };
    };

    // A few rosters at a time, stopping at the first batch that finds the member.
    for (let index = 0; index < guilds.length; index += GUILD_LOOKUP_CONCURRENCY) {
      const batch = await Promise.all(guilds.slice(index, index + GUILD_LOOKUP_CONCURRENCY).map(inspect));
      const found = batch.find(Boolean);
      if (found) return found;
    }
  } catch (error) {
    logger.error('Failed to load player guild', { error });
  }

  return null;
}

/**
 * Everything the portal knows about the signed-in player: linked identity plus all telemetry.
 * Shared by the legacy API route and the App Router pages, so both read identical data.
 */
export async function loadPlayerProfile(session: DashboardSession, sessionId: string) {
  const actor = {
    guildId: session.guildId,
    channelId: 'dashboard',
    userId: session.user.id,
    username: session.user.username,
    roleIds: session.roleIds || [],
    interactionId: `dashboard-${Date.now()}`,
    commandName: 'portal',
  };

  const duneClient = getDuneClient();
  const data = await getLinkedPlayer(actor);

  if (data?.linked !== true) {
    return data;
  }

  const playerId = data.pawnId ?? data.controllerId;

  if (!playerId) {
    return {
      ...data,
      linked: false,
      error: 'Unable to determine your Dune player ID.',
    };
  }

  try {
    await saveSession(
      sessionId,
      {
        ...session,
        linkedPlayerId: String(playerId),
        linkedPlayerName: data.characterName,
      },
      { onlyIfExists: true },
    );
  } catch (error) {
    logger.warn('Unable to cache linked player identity for dashboard features', { error });
  }

  // Dev note: telemetry travels as one convoy instead of eleven lonely desert trips.
  const coreEndpoints = [
    'currency',
    'solaris-coin',
    'factions',
    'intel',
    'specs',
    'progression',
    'vitals',
    'bases',
    'vehicles',
    'inventory',
    'journey',
  ];

  const details = await Promise.all(
    coreEndpoints.map(async (name) => {
      try {
        const playerEndpoint = `/api/players/${encodeURIComponent(playerId)}/${name}`;

        const resData = await duneClient.request('GET', playerEndpoint);

        if (name === 'bases') {
          // Dev note: provider payloads come in layers, like onions with API keys.
          const bases = Array.isArray(resData)
            ? resData
            : Array.isArray(record(resData).rows)
              ? record(resData).rows
              : Array.isArray(record(resData).data)
                ? record(resData).data
                : Array.isArray(record(resData).bases)
                  ? record(resData).bases
                  : [];

          const enrichedBases = await Promise.all(
            (Array.isArray(bases) ? bases : []).map(async (base) => loadBaseTelemetry(base, duneClient)),
          );

          let result;

          if (Array.isArray(resData)) {
            result = enrichedBases;
          } else if (resData && typeof resData === 'object') {
            result = {
              ...resData,
              rows: enrichedBases,
            };

            if (Array.isArray(record(resData).data)) {
              result.data = enrichedBases;
            }

            if (Array.isArray(record(resData).bases)) {
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
        // Dev note: optional telemetry may miss the bus; the portal still opens on time.
        logger.error(`Failed to load player telemetry`, { endpoint: name, error });

        return [name, null];
      }
    }),
  );

  const guild = await loadPlayerGuild([data.pawnId, data.controllerId], data.characterName, duneClient);

  const responseData = {
    ...data,
    avatarUrl: discordAvatar(session.user),
    details: {
      ...Object.fromEntries(details),
      guild,
    },
  };

  return responseData;
}

export async function GET(request, res) {
  try {
    const cookieStore = cookies(request, res);

    const sessionId = cookieStore.get('dashboard_session')?.value;

    if (!sessionId) {
      logger.warn('Login cookie missing', { route: '/api/player' });
      return NextResponse.json(
        {
          error: 'Unauthorized',
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
          error: 'Session expired or invalid',
        },
        {
          status: 401,
        },
      );
    }

    const body = await loadPlayerProfile(session, sessionId);

    return NextResponse.json(body, {
      status: 200,
    });
  } catch (error) {
    logger.error('Error inside player route telemetry processor', { error });

    return NextResponse.json(
      {
        ok: false,
        linked: false,
        error: 'Unable to load your Dune player profile right now.',
      },
      {
        status: 500,
      },
    );
  }
}
