import packageJson from '../../package.json' with { type: 'json' };
import { test } from './browser-test';
import { summarizePopulation } from '../../src/features/portal/population';

export const version = packageJson.version;

export const player = {
  avatarUrl: 'https://cdn.discordapp.com/avatars/12345/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.png?size=128',
  linked: true,
  pawnId: 'tester',
  characterName: 'Desert Navigator',
  onlineStatus: 'online',
  details: {
    factions: {
      rows: [
        { faction_name: 'Atreides', reputation_amount: 120 },
        { faction_name: 'Harkonnen', reputation_amount: 0 },
        { faction_name: 'Smuggler', reputation_amount: 75 },
      ],
    },
    progression: { level: 100, xp: 100000 },
    vitals: { currentHealth: 150, maxHealth: 150, hydration: 82 },
    guild: { name: 'Crimson Skies' },
    intel: { intel: 135, maxIntel: 2779 },
    currency: { total: 12537085 },
    bases: {
      rows: Array.from({ length: 3 }, (_, i) => ({
        id: String(i),
        name: `Stronghold ${i + 1}`,
        relationship: 'owner',
        generatorRuntimeSeconds: 60000,
      })),
    },
    vehicles: { rows: [] },
    inventory: {
      rows: [
        { id: 'one', display_name: 'Spice Melange', inventory_type: 0, quantity: 40, quality: 0 },
        { id: 'two', display_name: 'Stillsuit', inventory_type: 1, quantity: 1, quality: 3 },
        { id: 'three', display_name: 'Crysknife', inventory_type: 15, quantity: 1, quality: 2 },
      ],
    },
    journey: { rows: { story: [{ complete: true }, { complete: false }], codex: [], contract: [], tutorial: [] } },
  },
};

test.beforeEach(async ({ page }) => {
  // Dev note: the browser wanted cookies, but the test ordered assertions instead.
  await page.route('**/api/session', (route) =>
    route.fulfill({ json: { ok: true, cacheScope: 'a'.repeat(64), expiresAt: Date.now() + 43200000 } }),
  );
  await page.route('**/api/guilds/application-status?*', (route) =>
    route.fulfill({
      json: {
        ok: true,
        data: {
          applications: Object.fromEntries(
            (new URL(route.request().url()).searchParams.get('guildIds') ?? '').split(',').map((id) => [id, null]),
          ),
        },
      },
    }),
  );
  await page.route('**/api/guilds/*/support/status', (route) =>
    route.fulfill({ json: { ok: true, data: { unreadCount: 0 } } }),
  );
  await page.route('**/api/guilds/*/support/read', (route) =>
    route.fulfill({ json: { ok: true, data: { unreadCount: 0 } } }),
  );
  await page.route('**/api/guilds/*/support', (route) => route.fulfill({ json: { ok: true, data: { messages: [] } } }));
  await page.route('**/api/guilds/*/application', (route) =>
    route.request().method() === 'GET' ? route.fulfill({ json: { ok: true, data: null } }) : route.continue(),
  );
  await page.route('**/api/guilds/*/applications?*', (route) =>
    route.fulfill({ json: { ok: true, data: { rows: [], hasMore: false } } }),
  );
  await page.route('**/api/changelog', (route) =>
    route.fulfill({
      json: {
        ok: true,
        releases: [
          {
            version,
            date: '2026-09-20',
            sections: [{ title: 'Added', items: ['A changelog popup with no external links.'] }],
          },
        ],
      },
    }),
  );
  await page.route('https://cdn.discordapp.com/avatars/**', (route) =>
    route.fulfill({ path: 'src/assets/maps/atreides.webp', contentType: 'image/webp' }),
  );
  await page.route('**/api/portal/world?*', (route) =>
    route.fulfill({
      json: {
        map: new URL(route.request().url()).searchParams.get('map'),
        observedAt: new Date().toISOString(),
        spice: { count: 29, sectors: ['D5', 'E3'] },
        population: summarizePopulation(
          Array.from({ length: 1440 }, (_, i) => ({
            at: Date.now() - (1439 - i) * 60000,
            online: Math.max(0, Math.round(5 + 3 * Math.sin(i / 45) + 2 * Math.cos(i / 15))),
          })),
          Date.now(),
        ),
        nextCycleAt: new Date(Date.now() + 90000000).toISOString(),
        market: { listings: 5535, items: 1423, playerListings: 1 },
        council: {
          term: '3',
          endsAt: new Date(Date.now() + 90000000).toISOString(),
          decided: 5,
          atreides: 2,
          harkonnen: 3,
          total: 25,
        },
      },
    }),
  );
  await page.route('**/api/market/listings?*', (route) =>
    route.fulfill({
      json: {
        ok: true,
        rows: [
          { id: 'order', owner_name: 'Guild trader', owner_type: 'player', stock: 10, item_price: '9007199254740993' },
        ],
      },
    }),
  );
  await page.route('**/api/player', (route) => route.fulfill({ json: player }));
  await page.route('**/api/server/status', (route) =>
    route.fulfill({ json: { activePlayers: 12, totalPlayers: 240 } }),
  );
  await page.route('**/api/market?*', (route) =>
    route.fulfill({
      json: {
        ok: true,
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
        stats: { totalListings: 2 },
        marketConfig: { buybackPercent: 60 },
      },
    }),
  );
});
