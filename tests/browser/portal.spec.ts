import { test, expect } from '@playwright/test';
import { summarizePopulation } from '../../src/modules/portal/utils/population';

const player = {
  linked: true,
  pawnId: 'tester',
  characterName: 'Desert Navigator',
  onlineStatus: 'online',
  details: {
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
  await page.route('**/api/live', (route) =>
    route.fulfill({
      json: {
        enabled: true,
        connectedAt: Date.now(),
        admin: true,
        events: [
          {
            id: 'status',
            source: 'status.Survival_1.dim_0',
            kind: 'status',
            receivedAt: Date.now(),
            fields: { state: 4, map: null },
          },
          {
            id: 'chat',
            source: 'chat.intercept',
            kind: 'chat',
            receivedAt: Date.now(),
            fields: { channel: 'Map', message: 'Welcome to Arrakis', sender: 'test-player' },
          },
        ],
      },
    }),
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
      },
    }),
  );
});

test('ultrawide holdings stay centered with two cards above one', async ({ page }) => {
  await page.setViewportSize({ width: 3432, height: 1308 });
  await page.goto('/portal?view=bases');
  const cards = page.locator('.base-grid > div');
  await expect(cards).toHaveCount(3);
  const boxes = await cards.evaluateAll((nodes) =>
    nodes.map((node) => {
      const r = node.getBoundingClientRect();
      return { x: r.x, y: r.y, width: r.width };
    }),
  );
  expect(boxes[0].y).toBe(boxes[1].y);
  expect(boxes[2].y).toBeGreaterThan(boxes[0].y);
  expect(boxes[2].width).toBeGreaterThan(boxes[0].width * 1.9);
  const main = await page.locator('main').boundingBox();
  expect(main!.x).toBeGreaterThan(500);
  expect(main!.width).toBe(1080);
  await page.screenshot({ path: 'test-results/portal-ultrawide.png', fullPage: true });
});

test('navigation and market refresh do not reload player data or request logout', async ({ page }) => {
  const requests: string[] = [];
  page.on('request', (request) => requests.push(request.url()));
  await page.goto('/portal');
  await expect(page.getByRole('heading', { name: 'Spice blowing at D5.' })).toBeVisible();
  await page.screenshot({ path: 'test-results/portal-overview.png', fullPage: true });
  await page.getByRole('link', { name: 'Exchange', exact: true }).click();
  await expect(page.getByRole('cell', { name: 'Spice', exact: true })).toBeVisible();
  await expect(page.getByRole('cell', { name: '9,007,199,254,740,993' })).toBeVisible();
  await page.screenshot({ path: 'test-results/portal-market.png', fullPage: true });
  await page.getByRole('button', { name: 'Spice', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Spice', exact: true })).toBeVisible();
  await expect(page.getByText('Guild trader', { exact: true })).toBeVisible();
  await page.getByLabel('Sort listings').selectOption('price');
  await expect(page.getByRole('button', { name: 'Spice', exact: true })).toBeVisible();
  const before = requests.filter((url) => url.endsWith('/api/player')).length;
  await page.getByRole('button', { name: 'Refresh Market' }).click();
  await expect(page.getByRole('button', { name: 'Refresh Market' })).toBeEnabled();
  expect(requests.filter((url) => url.endsWith('/api/player'))).toHaveLength(before);
  expect(requests.some((url) => url.includes('auth/logout'))).toBe(false);
});

test('dashboard briefing switches maps and keeps compact mobile panels', async ({ page }) => {
  await page.goto('/portal');
  await expect(page.getByRole('heading', { name: 'Spice blowing at D5.' })).toBeVisible();
  await expect(page.getByText('5/25 houses decided', { exact: true })).toBeVisible();
  await expect(page.getByRole('img', { name: /Players online over the last 24 hours/ })).toBeVisible();
  const inspector = page.getByRole('slider', { name: 'Inspect population history' });
  await inspector.focus();
  await inspector.press('ArrowLeft');
  await expect(page.locator('output')).toContainText('online');
  const pulse = await page.locator('[aria-labelledby="pulse-summary"]').boundingBox();
  const council = await page.locator('#landsraad').boundingBox();
  expect(pulse!.width).toBe(council!.width);
  expect(council!.y).toBeGreaterThan(pulse!.y + pulse!.height);
  await page.getByRole('button', { name: 'Hagga Basin', exact: true }).click();
  await expect(page.getByText('Reading Hagga Basin.', { exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: /Spice.*Hagga Basin/ })).toHaveAttribute('href', '/map?map=HaggaBasin');
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/portal-overview-mobile.png', fullPage: true });
});

test('dashboard does not invent world values when telemetry is unavailable', async ({ page }) => {
  await page.route('**/api/portal/world?*', (route) => route.fulfill({ status: 503, json: { error: 'Unavailable' } }));
  await page.goto('/portal');
  await expect(page.getByRole('heading', { name: 'Your next chapter on Arrakis.' })).toBeVisible();
  await expect(page.getByText('World reading delayed', { exact: false })).toBeVisible();
  await expect(page.getByText('The current Landsraad term is not available.')).toBeVisible();
});

test('expired login shows recovery without a redirect loop', async ({ page }) => {
  await page.route('**/api/player', (route) => route.fulfill({ status: 401, json: { error: 'Unauthorized' } }));
  await page.goto('/portal');
  await expect(page.getByRole('alert').filter({ hasText: 'Your session' })).toContainText('session has ended');
  await expect(page.getByRole('link', { name: 'Sign in again' })).toBeVisible();
  await expect(page).toHaveURL(/\/portal$/);
});

test('mobile portal fits without horizontal overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/portal?view=bases');
  await expect(page.locator('.base-grid > div')).toHaveCount(3);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/portal-mobile.png', fullPage: true });
});

test('public dashboard displays actual server counts', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('12', { exact: true })).toBeVisible();
  await expect(page.getByText('240', { exact: true })).toBeVisible();
  await page.screenshot({ path: 'test-results/home-desktop.png', fullPage: true });
});

test('four vehicles form two equal rows', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.route('**/api/player', (route) =>
    route.fulfill({
      json: {
        ...player,
        details: {
          ...player.details,
          vehicles: {
            rows: Array.from({ length: 4 }, (_, i) => ({
              id: String(i),
              name: `Sandbike ${i + 1}`,
              relationship: 'owner',
              owner_name: player.characterName,
            })),
          },
        },
      },
    }),
  );
  await page.goto('/portal?view=vehicles');
  const cards = page.locator('.vehicle-grid > div');
  await expect(cards).toHaveCount(4);
  const boxes = await cards.evaluateAll((nodes) =>
    nodes.map((node) => ({ y: node.getBoundingClientRect().y, width: node.getBoundingClientRect().width })),
  );
  expect(boxes[0].y).toBe(boxes[1].y);
  expect(boxes[2].y).toBe(boxes[3].y);
  expect(boxes[2].y).toBeGreaterThan(boxes[0].y);
  expect(boxes[0].width).toBe(boxes[3].width);
});

test('map survives stylesheet extraction and refreshes independently', async ({ page }) => {
  await page.route('**/api/map?*', (route) =>
    route.fulfill({
      json: {
        ok: true,
        map: { width: 1000, height: 1000, minX: 0, maxX: 1000, minY: 0, maxY: 1000, label: 'Hagga Basin' },
        markers: [{ id: 'spice', type: 'spice', x: 500, y: 500, name: 'Spice field' }],
      },
    }),
  );
  await page.goto('/map');
  await expect(page.getByRole('img', { name: 'Hagga Basin' })).toBeVisible();
  await expect
    .poll(async () => (await page.getByRole('img', { name: 'Hagga Basin' }).boundingBox())?.width ?? 0)
    .toBeGreaterThan(400);
  await expect(page.locator('button.live-map-marker').first()).toBeVisible();
  await page.getByRole('button', { name: 'REFRESH', exact: true }).click();
  await expect(page.getByRole('img', { name: 'Hagga Basin' })).toBeVisible();
  await page.screenshot({ path: 'test-results/map-desktop.png', fullPage: true });
});

test('character and storage use player data, support filters, and fit mobile', async ({ page }) => {
  await page.goto('/portal?view=character');
  await expect(page.getByRole('heading', { name: 'Character', exact: true })).toBeVisible();
  await expect(page.getByText('Stillsuit', { exact: true })).toBeVisible();
  await expect(page.getByText('1 / 2', { exact: true })).toBeVisible();
  await page.screenshot({ path: 'test-results/portal-character.png', fullPage: true });
  await page.getByRole('link', { name: 'Storage', exact: true }).click();
  const inventory = page.getByRole('list', { name: 'Inventory items' });
  await expect(inventory.getByRole('listitem')).toHaveCount(3);
  await page.getByRole('button', { name: 'Backpack 1', exact: true }).click();
  await expect(inventory.getByRole('listitem')).toHaveCount(1);
  await expect(inventory).toContainText('Spice Melange');
  await page.getByRole('button', { name: 'All containers 3', exact: true }).click();
  await page.getByLabel('Search inventory').fill('knife');
  await expect(inventory.getByRole('listitem')).toHaveCount(1);
  await expect(inventory).toContainText('Crysknife');
  await page.getByRole('button', { name: 'List', exact: true }).click();
  await expect(page.getByRole('button', { name: 'List', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.getByLabel('Search inventory').fill('');
  await page.screenshot({ path: 'test-results/portal-storage.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/portal-storage-mobile.png', fullPage: true });
});

test('live intel renders retained observations on desktop and mobile', async ({ page }) => {
  await page.goto('/portal?view=live');
  await expect(page.getByText('Collector connected', { exact: true })).toBeVisible();
  await expect(page.getByText('Welcome to Arrakis', { exact: true })).toBeVisible();
  await page.screenshot({ path: 'test-results/live-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByText('Welcome to Arrakis', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/live-mobile.png', fullPage: true });
});
