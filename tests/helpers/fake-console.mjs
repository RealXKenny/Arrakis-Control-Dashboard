import { createServer } from 'node:http';

/**
 * A stand-in for the Dune Console and Discord adapter, used only by the browser tests.
 *
 * The V2 interface renders on the server, so a browser cannot intercept the data it shows with `page.route`. The
 * server instead talks to this fixture. Each test creates its own member (a unique Discord ID with its own
 * character), so tests never share state and the server's per-member caches cannot leak between them. It never sees
 * real credentials: it records only whether a bearer token was present.
 */
export const FAKE_CONSOLE_PORT = 3101;
/** The two long-standing fixture sessions of browser-server.mjs. */
export const MEMBER_DISCORD_ID = '123456789000000000';
export const ADMIN_DISCORD_ID = '456084885220884480';

function baseScenario(pawnId, controllerId, name) {
  return {
    linked: { linked: true, pawnId, controllerId, characterName: name, online: true, onlineStatus: 'online' },
    details: {
      factions: {
        rows: [
          { faction_name: 'Atreides', reputation_amount: 120 },
          { faction_name: 'Harkonnen', reputation_amount: 0 },
        ],
      },
      progression: { level: 100, xp: 100000 },
      vitals: { currentHealth: 150, maxHealth: 150, hydration: 82 },
      intel: { intel: 135, maxIntel: 2779 },
      currency: { total: 12537085 },
      'solaris-coin': {},
      specs: {},
      bases: { rows: [{ id: 'b1', name: 'Stronghold One', relationship: 'owner', generatorRuntimeSeconds: 60000 }] },
      vehicles: { rows: [] },
      inventory: {
        rows: [
          { id: 'one', display_name: 'Spice Melange', inventory_type: 0, quantity: 40, quality: 0 },
          { id: 'two', display_name: 'Stillsuit', inventory_type: 1, quantity: 1, quality: 3 },
        ],
      },
      journey: { rows: { story: [{ complete: true }, { complete: false }], codex: [], contract: [], tutorial: [] } },
    },
    // Detail endpoints (by name) that answer with this HTTP status.
    failures: {},
    // Membership in the shared guild roster: { id: '2', role: 100 }.
    guild: { id: '2', role: 100 },
  };
}

function world() {
  return {
    guilds: [{ id: '2', name: 'Crimson Skies', faction_name: 'Atreides', member_count: 2 }],
    extraMembers: { 2: [{ player_id: '7', character_name: 'Chani', role_id: 1 }] },
    online: { rows: [{ player_id: '4' }], totalCount: 12 },
    players: { rows: [], totalCount: 240 },
    markers: {
      map: { width: 1000, height: 1000, minX: 0, maxX: 1000, minY: 0, maxY: 1000 },
      rows: [{ id: 'base', type: 'base', x: 200, y: 200, name: 'My base' }],
    },
    vehicles: { rows: [] },
    market: {
      buyback: { buybackPercent: 60 },
      stats: { totalListings: 2 },
      items: {
        rows: [
          {
            template_id: 'spice',
            display_name: 'Spice',
            quality_level: 1,
            listing_count: 2,
            total_stock: 10,
            lowest_price: '9007199254740993',
          },
        ],
        totalCount: 1,
      },
      listings: {
        rows: [
          {
            id: 'order',
            owner_id: 'seller-secret-1',
            owner_name: 'Guild trader',
            owner_type: 'player',
            stock: 10,
            item_price: '9007199254740993',
          },
        ],
      },
    },
    // Path prefixes that answer with this HTTP status, e.g. { '/api/exchange': 503 }. Reset by tests that set them.
    failures: {},
  };
}

export function startFakeConsole(port = FAKE_CONSOLE_PORT) {
  let shared = world();
  let requests = [];
  const fixedMembers = () => {
    const members = new Map([
      [MEMBER_DISCORD_ID, baseScenario('4', '5', 'Desert Navigator')],
      [ADMIN_DISCORD_ID, baseScenario('8', '9', 'Fixture Administrator')],
    ]);
    // The administrator is not in the guild roster unless a test says so.
    members.get(ADMIN_DISCORD_ID).guild = null;
    return members;
  };
  let byDiscord = fixedMembers();
  const byPawn = () => new Map([...byDiscord.values()].map((scenario) => [String(scenario.linked.pawnId), scenario]));

  const json = (response, status, body) => {
    response.writeHead(status, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify(body));
  };
  const readBody = (request) =>
    new Promise((resolve) => {
      const chunks = [];
      request.on('data', (chunk) => chunks.push(chunk));
      request.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    });
  const merge = (base, patch) => ({
    ...base,
    ...patch,
    linked: { ...base.linked, ...(patch.linked ?? {}) },
    details: { ...base.details, ...(patch.details ?? {}) },
    failures: { ...base.failures, ...(patch.failures ?? {}) },
  });
  const roster = (guildId) => {
    const rows = [...(shared.extraMembers[guildId] ?? [])];
    for (const scenario of byDiscord.values()) {
      if (scenario.guild?.id === guildId && scenario.linked.linked !== false) {
        rows.push({
          player_id: scenario.linked.pawnId,
          character_name: scenario.linked.characterName,
          role_id: scenario.guild.role,
        });
      }
    }
    return rows;
  };

  const server = createServer(async (request, response) => {
    const url = new URL(request.url ?? '/', 'http://fixture');
    const path = url.pathname;

    if (path.startsWith('/__fixture/')) {
      const body = request.method === 'POST' ? JSON.parse((await readBody(request)) || '{}') : {};
      if (path === '/__fixture/reset') {
        shared = world();
        requests = [];
        byDiscord = fixedMembers();
      } else if (path === '/__fixture/user') {
        // Create (or reshape) one member: { discordId, name, patch }.
        const suffix = String(body.discordId).slice(-7);
        const scenario = merge(
          baseScenario(`1${suffix}`, `2${suffix}`, body.name ?? `Member ${suffix}`),
          body.patch ?? {},
        );
        // Per-test members are in no guild unless the test gives them one, so rosters stay readable.
        if (!body.patch || !('guild' in body.patch)) scenario.guild = null;
        byDiscord.set(String(body.discordId), scenario);
      } else if (path === '/__fixture/shared') {
        shared = { ...shared, ...body };
      } else if (path === '/__fixture/requests') {
        return json(response, 200, requests);
      }
      return json(response, 200, { ok: true });
    }

    const bodyText = request.method === 'GET' ? '' : await readBody(request);
    requests.push({
      method: request.method,
      path: `${path}${url.search}`,
      authorized: /^Bearer .+/.test(request.headers.authorization ?? ''),
      body: bodyText.length > 2000 ? undefined : bodyText,
    });
    for (const [prefix, status] of Object.entries(shared.failures)) {
      if (path.startsWith(prefix)) return json(response, status, { ok: false });
    }

    if (request.method === 'GET' && shared.finderSources && path in shared.finderSources) {
      return json(response, 200, shared.finderSources[path]);
    }

    if (path === '/api/health') return json(response, 200, { ok: true });
    if (path === '/api/integrations/discord/players/me') {
      const actor = JSON.parse(bodyText || '{}').actor ?? {};
      const scenario = byDiscord.get(String(actor.userId));
      return json(response, 200, { ok: true, ...(scenario ? scenario.linked : { linked: false }) });
    }
    let match = /^\/api\/players\/([^/]+)\/([a-z-]+)$/.exec(path);
    if (match) {
      const scenario = byPawn().get(decodeURIComponent(match[1]));
      if (!scenario) return json(response, 404, { ok: false });
      if (scenario.failures[match[2]]) return json(response, scenario.failures[match[2]], { ok: false });
      if (match[2] === 'give-item-id' && request.method === 'POST') {
        const item = JSON.parse(bodyText || '{}');
        return json(response, 200, {
          ok: true,
          operation: 'dbGiveItemToPlayer',
          item,
          result: {
            ok: true,
            playerId: String(scenario.linked.pawnId),
            requiresRelog: false,
            clamped: false,
            given: item.quantity,
            insertedStacks: [
              {
                id: 'fixture-item-row',
                template_id: item.itemId,
                stack_size: item.quantity,
                quality_level: item.quality,
              },
            ],
          },
        });
      }
      if (match[2] === 'add-currency' && request.method === 'POST') {
        // Mirrors the documented Console behaviour: Solaris only, a nonzero whole amount, the exact confirmation phrase,
        // and an overdraft is refused. Nothing here is a guarantee about the real Console.
        const change = JSON.parse(bodyText || '{}');
        const coin = (scenario.details['solaris-coin'] ??= {});
        const next = Number(coin.total ?? 0) + Number(change.amount);
        if (
          change.currencyId !== 0 ||
          change.confirmation !== 'ADD CURRENCY' ||
          !Number.isInteger(change.amount) ||
          change.amount === 0
        )
          return json(response, 400, { ok: false });
        if (next < 0) return json(response, 422, { ok: false });
        coin.total = next;
        // The shape the real Console answers with. The change is written to the database; `onlineStatus` is the
        // player's state at that moment, which is why the dashboard insists on an offline player.
        return json(response, 200, {
          supported: true,
          backupCreated: false,
          result: {
            ok: true,
            player: {
              actorId: 6,
              accountId: 1,
              controllerId: Number(scenario.linked.controllerId),
              playerStateId: 2,
              onlineStatus: scenario.linked.online ? 'Online' : 'Offline',
            },
            currencyId: 0,
            amount: change.amount,
            balance: { currency_id: 'Solaris', balance: String(next) },
            message: 'Solari Credit was updated in the database and will be loaded when the player next joins.',
          },
        });
      }
      if (match[2] === 'currency' && scenario.details['solaris-coin']?.total !== undefined) {
        // Same shape as the real Console: Solaris is currency 0, balances are strings.
        return json(response, 200, {
          capabilities: { currency: true },
          rows: [
            { currency_id: 0, balance: String(scenario.details['solaris-coin'].total), label: 'Solari Credit' },
            { currency_id: 1, balance: '10000', label: 'House Credit' },
          ],
        });
      }
      return json(response, 200, scenario.details[match[2]] ?? {});
    }
    match = /^\/api\/bases\/([^/]+)\/export$/.exec(path);
    if (match) {
      // Only a base that some member really owns can be exported.
      const owned = [...byDiscord.values()].some((scenario) =>
        (scenario.details.bases?.rows ?? []).some((base) => base.id === decodeURIComponent(match[1])),
      );
      return owned
        ? json(response, 200, {
            name: 'Exported Stronghold',
            instances: [{ instance_id: 1, building_type: 'BP_Wall_01', x: 0, y: 0, z: 0, rotation: 0 }],
            placeables: [],
          })
        : json(response, 404, { ok: false });
    }
    match = /^\/api\/bases\/([^/]+)\/(water|inventory)$/.exec(path);
    if (match) return json(response, 200, {});
    if (path === '/api/players/online') return json(response, 200, shared.online);
    if (path === '/api/players') return json(response, 200, shared.players);
    if (path === '/api/guilds') return json(response, 200, { rows: shared.guilds, totalCount: shared.guilds.length });
    match = /^\/api\/guilds\/([^/]+)\/members$/.exec(path);
    if (match) return json(response, 200, { rows: roster(match[1]) });
    if (path === '/api/map/markers') return json(response, 200, shared.markers);
    if (path === '/api/vehicles') return json(response, 200, shared.vehicles);
    if (path === '/api/exchange/market') return json(response, 200, { buyback: shared.market.buyback });
    if (path === '/api/exchange/stats') return json(response, 200, shared.market.stats);
    if (path === '/api/exchange/items') return json(response, 200, shared.market.items);
    if (path === '/api/exchange/listings') return json(response, 200, shared.market.listings);
    if (path === '/api/admin/landsraad') return json(response, 200, {});
    if (path === '/api/realtime/objects') return json(response, 200, { rows: [] });
    return json(response, 404, { ok: false, error: 'not found' });
  });

  return {
    server,
    listen: () => new Promise((resolve) => server.listen(port, '127.0.0.1', resolve)),
    close: () => new Promise((resolve) => server.close(resolve)),
    url: `http://127.0.0.1:${port}`,
  };
}
