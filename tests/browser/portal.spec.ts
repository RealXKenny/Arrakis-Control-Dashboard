import { version } from '../../package.json';
import { test, expect } from '@playwright/test';
import { summarizePopulation } from '../../src/modules/portal/utils/population';
import { createSectorGridOverlay } from '../../src/modules/map/utils/sectorGrid';

const player = {
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

test('holdings expand on ultrawide screens and stay comfortable at normal widths', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1080 });
  await page.goto('/portal?view=bases');
  const cards = page.locator('.base-grid > div');
  await expect(cards).toHaveCount(3);
  const normal = await cards.evaluateAll((nodes) => nodes.map((node) => ({ y: node.getBoundingClientRect().y })));
  expect(normal[0].y).toBe(normal[1].y);
  expect(normal[2].y).toBeGreaterThan(normal[0].y);
  await page.setViewportSize({ width: 3432, height: 1308 });
  const boxes = await cards.evaluateAll((nodes) =>
    nodes.map((node) => {
      const r = node.getBoundingClientRect();
      return { x: r.x, y: r.y, width: r.width };
    }),
  );
  expect(boxes[0].y).toBe(boxes[2].y);
  expect(Math.abs(boxes[0].width - boxes[2].width)).toBeLessThan(2);
  const main = await page.locator('main').boundingBox();
  expect(main!.width).toBeGreaterThan(3200);
  expect(boxes[0].x).toBeLessThan(120);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/portal-ultrawide.png', fullPage: true });
  await page
    .getByRole('navigation', { name: 'Main navigation' })
    .getByRole('link', { name: 'Dashboard', exact: true })
    .click();
  await expect(page.getByRole('heading', { name: 'Your world, at a glance.' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/portal-overview-ultrawide.png', fullPage: true });
});

test('navigation and market refresh do not reload player data or request logout', async ({ page }) => {
  const requests: string[] = [];
  page.on('request', (request) => requests.push(request.url()));
  await page.goto('/portal');
  await expect(page.getByRole('heading', { name: 'Spice blowing at D5.' })).toBeVisible();
  await page.screenshot({ path: 'test-results/portal-overview.png', fullPage: true });
  const topbar = page.locator('header').first();
  await expect(topbar).toHaveCSS('position', 'sticky');
  await expect(topbar).toHaveCSS('z-index', '50');
  await expect(topbar.locator('img[src="/favicon.ico"]')).toBeVisible();
  await page.getByRole('link', { name: 'Exchange', exact: true }).click();
  await expect(page.getByRole('cell', { name: 'Spice', exact: true })).toBeVisible();
  await page.locator('img[src$="/items/MelangeSpice.png"]').first().scrollIntoViewIfNeeded();
  await expect
    .poll(() =>
      page
        .locator('img[src$="/items/MelangeSpice.png"]')
        .first()
        .evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0),
    )
    .toBe(true);
  await expect(page.getByRole('cell', { name: '9,007,199,254,740,993' })).toBeVisible();
  await expect(page.getByRole('cell', { name: '5,404,319,552,844,595' })).toBeVisible();
  await page.screenshot({ path: 'test-results/portal-market.png', fullPage: true });
  await expect(page.getByRole('heading', { name: 'Item intelligence', exact: true })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'CHOAM buyback', exact: true })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Market access', exact: true })).toHaveCount(0);
  await expect(page.getByText('5,404,319,552,844,595', { exact: true })).toHaveCount(1);
  await expect(page.getByText('Guild trader', { exact: true })).toHaveCount(0);
  const summaryBounds = await page.locator('[data-market-summary]').boundingBox();
  const workspaceBounds = await page.locator('[data-market-workspace]').boundingBox();
  expect(workspaceBounds!.width).toBeCloseTo(summaryBounds!.width, 1);
  await page.getByLabel('Sort listings').selectOption('price');
  await expect(page.getByRole('cell', { name: 'Spice', exact: true })).toBeVisible();
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
  expect(pulse!.width).toBeGreaterThan(council!.width);
  expect(Math.abs(council!.y - pulse!.y)).toBeLessThan(2);
  expect(council!.x).toBeGreaterThan(pulse!.x + pulse!.width);
  for (const house of ['Atreides', 'Harkonnen']) {
    const crest = page.getByRole('img', { name: `House ${house} crest` });
    await expect(crest).toBeVisible();
    await expect(crest).toHaveAttribute('src', `/maps/${house.toLowerCase()}.webp`);
    await expect
      .poll(() => crest.evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0))
      .toBe(true);
  }
  await expect(page.getByRole('button', { name: 'Hagga Basin', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: 'test-results/portal-overview-desktop.png', fullPage: true });
  await page.getByRole('button', { name: 'Deep Desert', exact: true }).click();
  await expect(page.getByText('Reading Deep Desert.', { exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: /Spice.*Deep Desert/ })).toHaveAttribute('href', '/portal');
  await page.setViewportSize({ width: 390, height: 844 });
  const mobilePulse = await page.locator('[aria-labelledby="pulse-summary"]').boundingBox();
  const mobileCouncil = await page.locator('#landsraad').boundingBox();
  expect(mobileCouncil!.y).toBeGreaterThan(mobilePulse!.y + mobilePulse!.height);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/portal-overview-mobile.png', fullPage: true });
});

test('dashboard does not invent world values when telemetry is unavailable', async ({ page }) => {
  await page.route('**/api/portal/world?*', (route) => route.fulfill({ status: 503, json: { error: 'Unavailable' } }));
  await page.goto('/portal');
  await expect(page.getByRole('heading', { name: 'Your latest world updates.' })).toBeVisible();
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
  await page.goto('/?theme=default');
  await expect(page.getByText('12', { exact: true })).toBeVisible();
  await expect(page.getByText('240', { exact: true })).toBeVisible();
  await page.screenshot({ path: 'test-results/home-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole('heading', { name: 'A clearer view. More possibilities.' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Connect with Discord' })).toHaveCSS('color', 'rgb(165, 180, 252)');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/home-mobile.png', fullPage: true });
  await page.evaluate(() => window.scrollTo(0, 800));
  await expect
    .poll(() =>
      page
        .locator('header')
        .first()
        .evaluate((element) => element.getBoundingClientRect().top),
    )
    .toBe(0);
});

test('four vehicles form two equal rows', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1080 });
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

test('container vehicles show cargo instead of fuel and shared filters survive empty results', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1080 });
  await page.route('**/api/player', (route) =>
    route.fulfill({
      json: {
        ...player,
        details: {
          ...player.details,
          vehicles: {
            rows: [
              {
                id: 'container',
                name: 'BP_ContainerVehicle',
                type: 'BP_ContainerVehicle',
                relationship: 'owner',
                owner_name: player.characterName,
                condition_percent: 99,
                fuel_percent: 0,
                storage_used: 15,
                storage_capacity: 45,
              },
            ],
          },
        },
      },
    }),
  );
  await page.goto('/portal?view=vehicles');
  const card = page.locator('article').filter({ hasText: 'BP_ContainerVehicle' });
  await expect(card.getByText('Cargo capacity', { exact: true })).toBeVisible();
  await expect(card.getByText('15 / 45 slots', { exact: true })).toBeVisible();
  await expect(card.getByText('Fuel', { exact: true })).toHaveCount(0);
  await page.screenshot({ path: 'test-results/vehicles-container.png', fullPage: true });
  await page.getByRole('button', { name: /Shared Vehicles/ }).click();
  await expect(page.getByRole('button', { name: /Own Vehicles/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /Shared Vehicles/ })).toBeVisible();
  await expect(page.getByText('No vehicles found', { exact: true })).toBeVisible();
  await expect(page.getByText('You do not have access to any shared vehicles.', { exact: true })).toBeVisible();
  await page.screenshot({ path: 'test-results/vehicles-shared-empty.png', fullPage: true });
});

test('unavailable personal listings are not shown as zero or a request failure', async ({ page }) => {
  await page.route('**/api/market?*', (route) =>
    route.fulfill({
      json: {
        ok: true,
        stats: { totalListings: 5500 },
        matchingItems: 240,
        marketConfig: { buybackPercent: 60 },
        items: { rows: [], totalCount: null, capabilities: { exchange: true, personalListings: false } },
        availabilityMessage: 'No listings found.',
      },
    }),
  );
  await page.goto('/portal?view=market');
  await expect(page.getByText('No listings found.', { exact: true })).toBeVisible();
  await expect(page.getByText('5,500', { exact: true })).toBeVisible();
  await expect(page.getByText('240', { exact: true })).toBeVisible();
  await expect(page.getByText('60%', { exact: true })).toHaveCount(1);
  await expect(page.getByRole('alert').filter({ hasText: /\S/ })).toHaveCount(0);
  await expect(page.getByText('No matching listings found.', { exact: true })).toHaveCount(0);
});

test('realtime layer updates, filters instances, clears failures and switches maps', async ({ page }) => {
  let realtimeReads = 0;
  let unavailable = false;
  await page.route('**/api/map?*', (route) =>
    route.fulfill({
      json: {
        ok: true,
        map: { width: 1000, height: 1000, minX: 0, maxX: 1000, minY: 0, maxY: 1000 },
        markers: [{ id: 'base', type: 'base', x: 200, y: 200, name: 'My base' }],
      },
    }),
  );
  await page.route('**/api/map/realtime?*', (route) => {
    realtimeReads++;
    if (unavailable) return route.fulfill({ status: 503, json: { error: 'Realtime agent is unavailable.' } });
    const deep = new URL(route.request().url()).searchParams.get('map') === 'DeepDesert';
    return route.fulfill({
      json: {
        ok: true,
        gen: 1,
        capturedAt: Date.now(),
        sources: [
          { partition: 1, ready: true },
          { partition: 2, ready: true },
        ],
        markers: [
          {
            id: 'realtime:0:1',
            type: 'worm',
            name: deep ? 'Desert worm' : 'Sandworm',
            x: 300 + realtimeReads * 10,
            y: 300,
            z: 0,
            partition: 1,
            realtime: true,
          },
          { id: 'realtime:1:2', type: 'storm', name: 'Sandstorm', x: 600, y: 600, z: 0, partition: 2, realtime: true },
          { id: 'npc', type: 'realtime_npc', name: 'Scout', x: 400, y: 400, partition: 1, realtime: true },
          { id: 'civilian', type: 'civilian', name: 'Traveler', x: 500, y: 400, partition: 1, realtime: true },
        ],
      },
    });
  });
  await page.goto('/map');
  await page.getByRole('button', { name: '2D map', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Base: My base', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Realtime on', exact: true })).toBeVisible();
  await expect.poll(() => realtimeReads).toBeGreaterThan(0);
  await expect(page.getByLabel('NPCs (realtime)', { exact: true })).not.toBeChecked();
  await expect(page.getByLabel('Civilians (realtime)', { exact: true })).not.toBeChecked();
  await expect(page.getByRole('button', { name: 'NPC: Scout', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Civilian: Traveler', exact: true })).toHaveCount(0);
  await page.getByLabel('NPCs (realtime)', { exact: true }).check();
  await expect(page.getByRole('button', { name: 'NPC: Scout', exact: true })).toBeVisible();
  await page.getByLabel('Civilians (realtime)', { exact: true }).check();
  await expect(page.getByRole('button', { name: 'Civilian: Traveler', exact: true })).toBeVisible();
  const worm = page.getByRole('button', { name: 'Sandworm: Sandworm', exact: true });
  await expect(worm).toBeVisible();
  await expect(worm.locator('.realtime-symbol')).toBeVisible();
  const initialLeft = await worm.evaluate((element) => element.style.left);
  await expect.poll(() => worm.evaluate((element) => element.style.left)).not.toBe(initialLeft);
  await page.getByLabel('Sandworms (realtime)', { exact: true }).uncheck();
  await expect(worm).toHaveCount(0);
  await page.getByLabel('Sandworms (realtime)', { exact: true }).check();
  await expect(worm).toBeVisible();
  await page.getByLabel('Realtime instance').selectOption('2');
  await expect(worm).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Sandstorm: Sandstorm', exact: true })).toBeVisible();
  await page.screenshot({ path: 'test-results/map-realtime.png', fullPage: true });
  await page.getByRole('link', { name: 'Deep Desert', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Sandstorm: Sandstorm', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Realtime on', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Sandworm: Desert worm', exact: true })).toBeVisible();
  unavailable = true;
  await expect(page.getByText('Realtime agent is unavailable.', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Sandworm: Desert worm', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Base: My base', exact: true })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('button', { name: 'Realtime on', exact: true }).click();
  await expect(page.getByText('Realtime off', { exact: true })).toHaveCount(2);
});

test('map survives stylesheet extraction and refreshes independently', async ({ page }) => {
  test.setTimeout(process.env.CI ? 90_000 : 60_000);
  await page.clock.install();
  let mapReads = 0;
  let holdMapRead = false;
  let releaseMapRead = () => {};

  await page.route('**/api/map?*', async (route) => {
    mapReads++;
    if (holdMapRead) {
      holdMapRead = false;
      await new Promise<void>((resolve) => {
        releaseMapRead = resolve;
      });
    }
    const deepDesert = new URL(route.request().url()).searchParams.get('map') === 'DeepDesert';
    const mapConfig = deepDesert
      ? {
          width: 8192,
          height: 8192,
          minX: -1177656,
          maxX: 1072344,
          minY: -1177066,
          maxY: 1072934,
          flipY: false,
          label: 'Deep Desert',
        }
      : { width: 1000, height: 1000, minX: 0, maxX: 1000, minY: 0, maxY: 1000, label: 'Hagga Basin' };
    return route.fulfill({
      json: {
        ok: true,
        coriolisLayout: deepDesert ? 6 : null,
        coriolisNextCycleAt: new Date(Date.now() + 90_061_000).toISOString(),
        gridOverlay: deepDesert ? createSectorGridOverlay('DeepDesert', mapConfig) : null,
        map: mapConfig,
        markers: deepDesert
          ? []
          : [
              { id: 'spice', type: 'spice', x: 400, y: 500, name: 'Possible spice' },
              { id: 'active-spice', type: 'spice_active', x: 600, y: 500, name: 'Active spice' },
            ],
      },
    });
  });
  await page.goto('/map');
  await page.getByRole('button', { name: '2D map', exact: true }).click();
  const mapPanel = page.locator('[data-map-panel]');
  await expect.poll(async () => (await mapPanel.boundingBox())?.width ?? 0).toBeGreaterThan(500);
  await expect.poll(async () => (await mapPanel.boundingBox())?.height ?? 0).toBeGreaterThan(400);
  await expect(page.getByRole('checkbox', { name: 'Player', exact: true })).toBeChecked();
  await expect(page.getByRole('timer', { name: 'Coriolis cycle countdown' })).toContainText('1d 01:');
  await expect(page.getByRole('checkbox', { name: 'Storage', exact: true })).not.toBeChecked();
  const possibleSpice = page.getByRole('checkbox', { name: 'Possible Spice Locations', exact: true });
  await possibleSpice.uncheck();
  await expect(page.locator('button.marker-spice')).toHaveCount(0);
  await possibleSpice.focus();
  await page.keyboard.press('Space');
  await expect(possibleSpice).toBeChecked();
  await expect(page.locator('.marker-spice > .spice-status-badge')).toHaveText('?');
  await expect(page.locator('.marker-spice > .spice-status-badge')).toBeVisible();
  await expect(page.locator('.marker-spice_active > .spice-status-badge')).toHaveText('LIVE');
  await expect(page.locator('.marker-spice_active > .spice-status-badge')).toBeVisible();
  for (const category of [
    'Player',
    'Vehicle',
    'Base',
    'Possible Spice Locations',
    'Active Spice Fields',
    'Flour Sand',
    "POI's",
    'House Representative',
    'Trainer',
  ]) {
    await expect(page.getByTitle(`Hide ${category}`, { exact: true })).toHaveCount(1);
  }
  for (const category of [
    'Storage',
    'Ore & Pickups',
    'Wreckage & Scrap',
    'Flora',
    'Fortresses',
    'Hazards',
    'Enemies',
  ]) {
    await expect(page.getByTitle(`Show ${category}`, { exact: true })).toHaveCount(1);
  }
  await expect(page.getByRole('img', { name: 'Hagga Basin' })).toBeVisible();
  const haggaTiles = page.locator('[data-map-tiles="hagga-basin"] img');
  await expect(haggaTiles).toHaveCount(4);
  await expect
    .poll(
      () =>
        haggaTiles.evaluateAll((images: HTMLImageElement[]) =>
          images.every((img) => img.complete && img.naturalWidth === 4096),
        ),
      { timeout: 20_000 },
    )
    .toBe(true);
  await expect
    .poll(async () => (await page.getByRole('img', { name: 'Hagga Basin' }).boundingBox())?.width ?? 0)
    .toBeGreaterThan(250);
  const fittedMapWidth = await page
    .locator('[data-map-resolution]')
    .evaluate((map) => map.getBoundingClientRect().width);
  await page.getByRole('button', { name: 'Zoom in', exact: true }).click();
  await expect
    .poll(() => page.locator('[data-map-resolution]').evaluate((map) => map.getBoundingClientRect().width))
    .toBeGreaterThan(fittedMapWidth * 1.1);
  const zoomedWidth = await page.locator('[data-map-resolution]').evaluate((map) => map.getBoundingClientRect().width);
  const initialMapReads = mapReads;
  holdMapRead = true;
  await page.clock.fastForward(31_000);
  await expect.poll(() => mapReads).toBeGreaterThan(initialMapReads);
  await expect(page.locator('[data-loading]')).toHaveAttribute('data-loading', 'false');
  expect(await page.locator('[data-map-resolution]').evaluate((map) => map.getBoundingClientRect().width)).toBe(
    zoomedWidth,
  );
  const updated = page.waitForResponse((response) => new URL(response.url()).pathname === '/api/map');
  releaseMapRead();
  await updated;
  await page.getByRole('button', { name: 'Refresh', exact: true }).click();
  await expect(page.locator('[data-loading]')).toHaveAttribute('data-loading', 'false');
  await expect
    .poll(() => page.locator('[data-map-resolution]').evaluate((map) => map.getBoundingClientRect().width))
    .toBe(zoomedWidth);
  const viewport = page.viewportSize();
  if (viewport) {
    await page.setViewportSize({ width: viewport.width - 1, height: viewport.height });
  }
  await expect
    .poll(() => page.locator('[data-map-resolution]').evaluate((map) => map.getBoundingClientRect().width))
    .toBeGreaterThan(fittedMapWidth * 1.05);
  await page.getByRole('button', { name: 'Fit map', exact: true }).click();
  await expect
    .poll(() =>
      page.locator('[data-map-resolution]').evaluate((map) => {
        const frame = map.parentElement;
        if (!frame) return false;
        const bounds = map.getBoundingClientRect();
        const fitsWidth = bounds.width <= frame.clientWidth + 2;
        const fitsHeight = bounds.height <= frame.clientHeight + 2;
        const touchesAnEdge =
          Math.abs(bounds.width - frame.clientWidth) <= 2 || Math.abs(bounds.height - frame.clientHeight) <= 2;
        // The redesigned viewport is rectangular; Fit must preserve the entire map.
        return fitsWidth && fitsHeight && touchesAnEdge;
      }),
    )
    .toBe(true);
  await expect(page.locator('button.live-map-marker').first()).toBeVisible();
  await page.getByRole('button', { name: 'Refresh', exact: true }).click();
  await expect(page.getByRole('img', { name: 'Hagga Basin' })).toBeVisible();
  await page.screenshot({ path: 'test-results/map-desktop.png', fullPage: true });
  await expect(page).toHaveURL(/\/portal$/);
  await expect(page.getByRole('link', { name: 'Hagga Basin', exact: true })).toHaveAttribute('aria-current', 'page');
  const desertLinks = page.locator('nav a').filter({ hasText: /Hagga Basin|Deep Desert/ });
  await expect(desertLinks).toHaveText(['Hagga Basin', 'Deep Desert']);
  await page.getByRole('link', { name: 'Deep Desert', exact: true }).click();
  await expect(page.getByRole('link', { name: 'Deep Desert', exact: true })).toHaveAttribute('aria-current', 'page');
  await expect(page.getByRole('checkbox', { name: 'Sector Grid', exact: true })).toBeChecked();
  await expect(page.getByTitle('Show Storage', { exact: true })).toHaveCount(1);
  await expect(page).toHaveURL(/\/portal$/);
  await page.getByRole('button', { name: '2D map', exact: true }).click();
  // CI's software renderer can spend over 20 seconds uploading the full legacy terrain.
  await expect(page.locator('canvas[aria-hidden="true"]')).toHaveCount(1, {
    timeout: process.env.CI ? 40_000 : 20_000,
  });
  const terrain = page.locator('[data-terrain-state]');
  await expect(terrain).toHaveAttribute('data-terrain-state', 'ready', { timeout: 20_000 });
  await expect(terrain).toHaveAttribute('data-map-resolution', '8192x8192');
  await expect(terrain.locator('canvas')).toHaveAttribute('data-terrain-resolution', '8192x8192', {
    timeout: 20_000,
  });
  const sectorGrid = page.locator('svg[data-sector-grid="deep-desert"]');
  await expect(sectorGrid).toHaveCount(1);
  await expect(sectorGrid.locator('text')).toHaveCount(81);
  await page.getByRole('checkbox', { name: 'Sector Grid', exact: true }).uncheck();
  await expect(sectorGrid).toHaveCount(0);
  await expect(terrain.getByRole('status')).toHaveCount(0);
  await expect
    .poll(() => terrain.locator('[data-map-tiles="deep-desert"]').evaluate((tiles) => getComputedStyle(tiles).opacity))
    .toBe('0');
  await page.setViewportSize({ width: 390, height: 844 });
  const desertTiles = page.locator('[data-map-tiles="deep-desert"] img');
  await expect(desertTiles).toHaveCount(4);
  expect(
    await desertTiles.evaluateAll((images: HTMLImageElement[]) => images.map((img) => new URL(img.src).pathname)),
  ).toEqual([
    '/maps/deep-desert/0-0.webp',
    '/maps/deep-desert/1-0.webp',
    '/maps/deep-desert/0-1.webp',
    '/maps/deep-desert/1-1.webp',
  ]);
  await page.getByRole('button', { name: 'Fit map', exact: true }).click();
  await expect
    .poll(
      () =>
        terrain.evaluate((map) => {
          const frame = map.parentElement;
          if (!frame) return Number.POSITIVE_INFINITY;
          const bounds = map.getBoundingClientRect();
          return Math.max(bounds.width - frame.clientWidth, bounds.height - frame.clientHeight);
        }),
      { timeout: 20_000 },
    )
    .toBeLessThanOrEqual(8);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/map-mobile.png', fullPage: true });
});

test('character and storage use player data, support filters, and fit mobile', async ({ page }) => {
  await page.goto('/portal?view=character');
  await expect(page.getByRole('heading', { name: 'Character', exact: true })).toBeVisible();
  await expect(page.getByRole('img', { name: "Desert Navigator's Discord avatar" })).toBeVisible();
  await expect(page.getByText('Atreides', { exact: true }).locator('..')).toContainText('120');
  await expect(page.getByText('Harkonnen', { exact: true }).locator('..')).toContainText('0');
  await expect(page.getByText('Smuggler', { exact: true }).locator('..')).toContainText('75');
  await expect(page.getByText('Stillsuit', { exact: true })).toBeVisible();
  await expect(page.getByText('1 / 2', { exact: true })).toBeVisible();
  await page.screenshot({ path: 'test-results/portal-character.png', fullPage: true });
  await page.getByRole('link', { name: 'Storage', exact: true }).click();
  const inventory = page.getByRole('list', { name: 'Inventory items' });
  await expect(inventory.getByRole('listitem')).toHaveCount(3);
  await inventory.locator('img[src$="/items/MelangeSpice.png"]').scrollIntoViewIfNeeded();
  await expect
    .poll(() =>
      inventory
        .locator('img[src$="/items/MelangeSpice.png"]')
        .evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0),
    )
    .toBe(true);
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

test('item images fail gracefully without losing item names', async ({ page }) => {
  await page.route('**/items/Crysknife.png', (route) => route.fulfill({ status: 404, body: '' }));
  await page.goto('/portal?view=storage');
  const item = page.getByRole('listitem').filter({ hasText: 'Crysknife' });
  await expect(item.locator('[title="Item image unavailable"]')).toBeVisible();
  await expect(item).toContainText('Crysknife');
  await expect(item.locator('img')).toHaveCount(0);
});

test('portal navigation keeps clean URLs through history and refresh', async ({ page }) => {
  await page.goto('/portal');
  await page.getByRole('link', { name: 'Exchange', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Exchange', exact: true })).toBeVisible();
  await expect(page).toHaveURL(/\/portal$/);
  await page.getByRole('link', { name: 'Storage', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Storage', exact: true })).toBeVisible();
  await page.goBack();
  await expect(page.getByRole('heading', { name: 'Exchange', exact: true })).toBeVisible();
  await page.goForward();
  await expect(page.getByRole('heading', { name: 'Storage', exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Storage', exact: true })).toBeVisible();
  await expect(page).toHaveURL(/\/portal$/);
  await page.getByRole('link', { name: 'Dashboard', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Your world, at a glance.' })).toBeVisible();
});

test('player rate limiting respects Retry-After without signing out', async ({ page }) => {
  let calls = 0;
  await page.route('**/api/player', (route) => {
    calls++;
    return route.fulfill({ status: 429, headers: { 'Retry-After': '60' }, json: { error: 'Too many requests' } });
  });
  await page.goto('/portal?view=character');
  await expect(page.getByRole('alert').filter({ hasText: 'Refresh paused' })).toContainText(
    'Refresh paused for 60 seconds',
  );
  await page.getByRole('button', { name: 'Try again' }).click();
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  expect(calls).toBe(1);
  await expect(page.getByText('Your session has ended.', { exact: false })).toHaveCount(0);
});

test('private base import is under My bases without community tabs', async ({ page }) => {
  await page.goto('/portal?view=bases');
  await expect(page.getByRole('link', { name: 'Solido', exact: true })).toHaveCount(0);

  await expect(page.getByLabel('Upload JSON')).toBeVisible();
  await page.screenshot({ path: 'test-results/base-import-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByLabel('Upload JSON')).toBeVisible();
  await page.screenshot({ path: 'test-results/base-import-mobile.png', fullPage: true });
});

test('reload restores a fresh private reading without refetching player data', async ({ page }) => {
  let calls = 0;
  await page.route('**/api/player', (route) => {
    calls++;
    return route.fulfill({ json: player });
  });
  await page.goto('/portal?view=character');
  await expect(page.getByRole('heading', { name: 'Desert Navigator', exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Desert Navigator', exact: true })).toBeVisible();
  expect(calls).toBe(1);
  await expect(page.locator('footer')).toContainText(`v${version}`);
  await page.getByRole('button', { name: `v${version}` }).click();
  await expect(page.getByRole('dialog', { name: 'Changelog' })).toBeVisible();
  await expect(page.getByRole('heading', { name: `Version ${version}` })).toBeVisible();
  await expect(page.getByRole('dialog').getByRole('link')).toHaveCount(0);
  await page.getByRole('button', { name: 'Close changelog' }).click();
  await expect(page.getByRole('dialog', { name: 'Changelog' })).toHaveCount(0);
});

test('base upload is always visible below the last holdings card', async ({ page }) => {
  await page.goto('/portal?view=bases');
  const upload = page.getByLabel('Upload JSON');
  await expect(upload).toBeVisible();
  const last = await page.locator('.base-grid > div').last().boundingBox();
  const form = await page.getByRole('heading', { name: 'Import Blueprint', exact: true }).boundingBox();
  expect(form!.y).toBeGreaterThan(last!.y + last!.height + 20);
  const action = await page.getByRole('button', { name: 'Import to my character', exact: true }).boundingBox();
  const input = await upload.boundingBox();
  expect(input!.y).toBeGreaterThan(action!.y + action!.height);
  await page.screenshot({ path: 'test-results/release-bases-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(upload).toBeVisible();
  await page.screenshot({ path: 'test-results/release-bases-mobile.png', fullPage: true });
});

test('account changes do not restore another character from browser storage', async ({ page }) => {
  await page.goto('/portal?view=character');
  await expect(page.getByRole('heading', { name: 'Desert Navigator', exact: true })).toBeVisible();
  await page.route('**/api/session', (route) =>
    route.fulfill({ json: { ok: true, cacheScope: 'b'.repeat(64), expiresAt: Date.now() + 43200000 } }),
  );
  await page.route('**/api/player', (route) =>
    route.fulfill({ json: { ...player, characterName: 'Second Explorer' } }),
  );
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Second Explorer', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Desert Navigator', exact: true })).toHaveCount(0);
});
test('player telemetry refreshes after its 30-second stale time', async ({ page }) => {
  let calls = 0;
  await page.clock.install();
  await page.route('**/api/player', (route) => {
    calls++;
    return route.fulfill({ json: player });
  });
  await page.goto('/portal?view=character');
  await expect(page.getByRole('heading', { name: 'Desert Navigator', exact: true })).toBeVisible();
  expect(calls).toBe(1);
  await page.clock.fastForward(31000);
  await expect.poll(() => calls).toBe(2);
});

test('blueprint upload rejects invalid files before sending an import', async ({ page }) => {
  let imports = 0;
  await page.route('**/api/bases/import', (route) => {
    imports++;
    return route.fulfill({ status: 500, json: { error: 'Unexpected call' } });
  });
  await page.goto('/portal?view=bases');
  const upload = page.getByLabel('Upload JSON');
  await upload.setInputFiles({ name: 'invalid.json', mimeType: 'application/json', buffer: Buffer.from('{}') });
  await expect(page.getByRole('status')).toContainText('Invalid blueprint JSON');
  await expect(page.getByRole('button', { name: 'Import to my character', exact: true })).toBeDisabled();
  await upload.setInputFiles({
    name: 'oversized.json',
    mimeType: 'application/json',
    buffer: Buffer.alloc(512 * 1024 + 1, ' '),
  });
  await expect(page.getByRole('status')).toContainText('Invalid blueprint JSON');
  expect(imports).toBe(0);
});

test('blueprint import handles uncertain delivery and success without duplicate requests', async ({ page }) => {
  const requests: Array<{ requestId: string; blueprint: unknown }> = [];
  await page.route('**/api/bases/import', async (route) => {
    requests.push(route.request().postDataJSON());
    await route.fulfill(
      requests.length === 1
        ? { status: 502, json: { error: 'fixture-private-provider-error' } }
        : { json: { record: { status: 'imported', message: 'Blueprint delivered to your backpack.' } } },
    );
  });
  await page.goto('/portal?view=bases');
  await page.getByLabel('Upload JSON').setInputFiles({
    name: 'test-base.json',
    mimeType: 'application/json',
    buffer: Buffer.from(
      JSON.stringify({
        instances: [{ instance_id: 1, building_type: 'Atreides_Outpost_Foundation', x: 0, y: 0, z: 0, rotation: 0 }],
      }),
    ),
  });
  await expect(page.getByText('1 building pieces · 0 placeables')).toBeVisible();
  const action = page.getByRole('button', { name: 'Import to my character', exact: true });
  await expect(action).toBeDisabled();
  const choose = page.getByRole('button', { name: 'Use this front and picture', exact: true });
  await expect(choose).toBeEnabled({ timeout: 30000 });
  await choose.click();
  await action.click();
  await expect(page.getByRole('status').filter({ hasText: 'Import could not be confirmed' })).toBeVisible();
  await expect(page.getByText('fixture-private-provider-error')).toHaveCount(0);
  expect(requests).toHaveLength(1);
  await action.click();
  await expect(page.getByText('Blueprint delivered to your backpack.', { exact: true })).toBeVisible();
  await expect(action).toBeDisabled();
  expect(requests).toHaveLength(2);
  expect(requests[1].requestId).toBe(requests[0].requestId);
});

test('guild view renders reported membership without inventing a rank', async ({ page }) => {
  await page.goto('/portal?view=guild');
  await expect(page.getByRole('heading', { name: 'Guild membership', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Crimson Skies', exact: true })).toBeVisible();
  await expect(page.getByText('Your rank: Not reported')).toBeVisible();
});

test('root landing fills ultrawide screens without the extra navigation pills', async ({ page }) => {
  await page.setViewportSize({ width: 3432, height: 1308 });
  const response = await page.goto('/');
  expect(response?.status()).toBe(200);
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('heading', { name: 'A clearer view. More possibilities.' })).toBeVisible();
  const main = await page.locator('main').boundingBox();
  expect(main!.width).toBeGreaterThan(3200);
  await expect(page.getByRole('navigation', { name: 'Main navigation' })).toHaveCount(0);
  await expect(page.locator('a[href="/admin"]')).toHaveCount(0);
  await page.screenshot({ path: 'test-results/landing-ultrawide.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('legacy home URL redirects to the root and preserves query parameters', async ({ page }) => {
  await page.goto('/home?theme=halloween&source=bookmark');
  await expect(page).toHaveURL(/\/\?theme=halloween&source=bookmark$/);
  await expect(page.getByRole('heading', { name: 'A clearer view. More possibilities.' })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'halloween');
  await expect(
    page.getByRole('navigation', { name: 'Main navigation' }).getByRole('link', { name: 'Dashboard', exact: true }),
  ).toHaveCount(0);
});

test('administrator uses the direct URL without admin links on landing or portal', async ({ page, context }) => {
  await context.setExtraHTTPHeaders({ Cookie: '__Host-dashboard_session=browser-admin-session' });
  for (const route of ['/', '/portal']) {
    await page.goto(route);
    await expect(page.locator('a[href="/admin"]')).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Administration', exact: true })).toHaveCount(0);
  }
});

test('3D maps orbit with aligned markers and recover from context loss', async ({ page }) => {
  test.setTimeout(90_000);
  const errors: string[] = [];
  await page.route('**/api/bases/*/export', (route) =>
    route.fulfill({ status: 403, json: { error: 'Unavailable export' } }),
  );
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error' && /THREE.WebGLProgram|shader error/i.test(message.text()))
      errors.push(message.text());
  });
  let samples = 0;
  await page.route('**/api/map/realtime?*', (route) => {
    samples++;
    const markers = [
      {
        id: 'worm-a',
        type: 'worm',
        name: 'Moving worm',
        x: 100000 + samples * 2000,
        y: 100000,
        partition: 1,
        realtime: true,
      },
      { id: 'worm-b', type: 'worm', name: 'Other worm', x: -170000, y: 100000, partition: 1, realtime: true },
    ];
    return route.fulfill({
      json: {
        ok: true,
        gen: 1,
        capturedAt: Date.now(),
        sources: [{ partition: 1, ready: true }],
        markers: samples % 2 ? markers : markers.reverse(),
      },
    });
  });
  await page.route('**/api/map?*', (route) => {
    const deep = new URL(route.request().url()).searchParams.get('map') === 'DeepDesert';
    const map = deep
      ? { width: 8192, height: 8192, minX: -1177656, maxX: 1072344, minY: -1177066, maxY: 1072934, flipY: false }
      : { width: 8192, height: 8192, minX: -457200, maxX: 600000, minY: -457200, maxY: 355600, flipY: false };
    return route.fulfill({
      json: {
        ok: true,
        map,
        coriolisLayout: deep ? 6 : null,
        gridOverlay: deep ? createSectorGridOverlay('DeepDesert', map) : null,
        markers: [
          { id: 'base', type: 'base', name: '3D stronghold', x: -200000, y: -50000 },
          ...(!deep ? [{ id: 'uncovered', type: 'poi', name: 'Uncovered location', x: 500000, y: 0 }] : []),
          ...(deep ? [{ id: 'patch', type: 'poi', name: 'Terrain overlook', x: -711684, y: 196855 }] : []),
        ],
      },
    });
  });
  await page.goto('/map');
  const scene = page.locator('[data-map-view="3d"]');
  await expect(scene).toHaveAttribute('data-scene-state', 'ready', { timeout: 30_000 });
  const marker = page.getByRole('button', { name: 'Base: 3D stronghold', exact: true, includeHidden: true });
  await expect(marker).toBeVisible();
  await expect(marker).toHaveAttribute('data-model-state', 'unavailable');
  const uncovered = page.getByRole('button', { name: "POI's: Uncovered location", exact: true, includeHidden: true });
  await expect(uncovered).toHaveAttribute('data-terrain-state', 'uncovered');
  await expect(uncovered).toBeHidden();
  await expect(scene.locator('[data-terrain-coverage]')).toHaveText(
    '1 location outside 3D terrain coverage. Use 2D to view all.',
  );
  const moving = page.getByRole('button', { name: 'Sandworm: Moving worm', exact: true });
  await expect(moving).toBeVisible();
  await moving.evaluate((el) => (el.dataset.preserved = 'true'));
  const snapshotPosition = await marker.evaluate((el) => [el.style.left, el.style.top]);
  expect(
    await scene
      .locator('canvas')
      .evaluate((el: HTMLCanvasElement) => el.getContext('webgl2')!.getContextAttributes()!.powerPreference),
  ).toBe('high-performance');
  await page.getByLabel('Terrain detail').selectOption('balanced');
  await expect(scene).toHaveAttribute('data-render-quality', 'balanced');
  const detailedPosition = await marker.evaluate((el) => [el.style.left, el.style.top]);
  // Terrain anchors follow the selected mesh, so finer triangles can adjust elevation slightly.
  detailedPosition.forEach((value, i) =>
    expect(Math.abs(parseFloat(value) - parseFloat(snapshotPosition[i]))).toBeLessThan(3),
  );
  await page.getByLabel('Terrain detail').selectOption('auto');
  const scrollPosition = await page.evaluate(() => scrollY);
  await scene.locator('canvas').evaluate((canvas: HTMLCanvasElement) => {
    canvas.dataset.draws = '0';
    const gl = canvas.getContext('webgl2')!;
    const draw = gl.drawElements.bind(gl);
    gl.drawElements = (...args: Parameters<typeof gl.drawElements>) => {
      canvas.dataset.draws = String(Number(canvas.dataset.draws) + 1);
      const blip = canvas.parentElement!.querySelector<HTMLElement>('button.marker-base')!;
      canvas.dataset.blipAtDraw = JSON.stringify([blip.style.left, blip.style.top]);
      draw(...args);
    };
  });
  const initialSamples = samples;
  // Two 2-second polls can exceed five seconds while software WebGL uploads terrain.
  await expect.poll(() => samples, { timeout: 15_000 }).toBeGreaterThan(initialSamples + 1);
  await expect(moving).toHaveAttribute('data-preserved', 'true');
  await expect(scene.locator('canvas')).toHaveAttribute('data-draws', '0');
  expect(await marker.evaluate((el) => [el.style.left, el.style.top])).toEqual(snapshotPosition);
  expect(await page.evaluate(() => scrollY)).toBe(scrollPosition);
  await expect(moving).toHaveCSS('transition-duration', '1.8s, 1.8s');
  const before = await marker.evaluate((el) => el.style.top);
  await page.getByRole('button', { name: 'Zoom in', exact: true }).click();
  await expect.poll(() => marker.evaluate((el) => el.style.top)).not.toBe(before);
  await marker.click();
  await expect(page.getByText('3D stronghold', { exact: true }).last()).toBeVisible();
  await page.getByRole('button', { name: 'Close location details', exact: true }).click();
  await page.getByRole('button', { name: 'Fit map', exact: true }).click();
  await page.screenshot({ path: 'test-results/map-3d-hagga.png', fullPage: true });
  const canvas = scene.locator('canvas');
  await canvas.scrollIntoViewIfNeeded();
  const box = await canvas.boundingBox();
  const beforeOrbit = await marker.evaluate((el) => [el.style.left, el.style.top]);
  const orbitBox = await marker.boundingBox();
  await page.mouse.move(box!.x + box!.width * 0.7, box!.y + box!.height * 0.6);
  await page.mouse.down();
  const samplesDuringDrag = samples;
  await expect.poll(() => samples).toBeGreaterThan(samplesDuringDrag);
  await expect(moving).toHaveCSS('transition-duration', '0s');
  await page.mouse.move(box!.x + box!.width * 0.5, box!.y + box!.height * 0.6, { steps: 8 });
  const draggedBox = await marker.boundingBox();
  if (draggedBox) expect(Math.hypot(draggedBox.x - orbitBox!.x, draggedBox.y - orbitBox!.y)).toBeGreaterThan(5);
  else await expect(marker).toHaveAttribute('data-terrain-state', 'hidden');
  await expect
    .poll(() => canvas.getAttribute('data-blip-at-draw'))
    .toBe(await marker.evaluate((el) => JSON.stringify([el.style.left, el.style.top])));
  await page.mouse.up();
  await expect.poll(() => marker.evaluate((el) => [el.style.left, el.style.top])).not.toEqual(beforeOrbit);
  const beforePan = await marker.evaluate((el) => [parseFloat(el.style.left), parseFloat(el.style.top)]);
  await page.mouse.move(box!.x + box!.width * 0.7, box!.y + box!.height * 0.65);
  await page.mouse.down({ button: 'right' });
  await page.mouse.move(box!.x + box!.width * 0.8, box!.y + box!.height * 0.7, { steps: 5 });
  const pannedPosition = await marker.evaluate((el) => [parseFloat(el.style.left), parseFloat(el.style.top)]);
  expect(Math.hypot(pannedPosition[0] - beforePan[0], pannedPosition[1] - beforePan[1])).toBeGreaterThan(5);
  await page.mouse.up({ button: 'right' });
  await page.getByRole('link', { name: 'Deep Desert', exact: true }).click();
  await expect(scene).toHaveAttribute('data-scene-state', 'ready', { timeout: 30_000 });
  await expect(scene).toHaveAttribute('data-desert-terrain', 'combined');
  await expect(marker).toBeVisible();
  await page.getByRole('checkbox', { name: 'Sector Grid', exact: true }).uncheck();
  await page.screenshot({ path: 'test-results/map-3d-desert.png', fullPage: true });
  await page.getByLabel('Terrain detail').selectOption('balanced');
  await page.getByLabel('Find on map').fill('Terrain overlook');
  await page.getByRole('list', { name: 'Map search results' }).getByRole('button').click();
  await page.getByRole('button', { name: 'Close location details', exact: true }).click();
  await page.screenshot({ path: 'test-results/map-combined-desert.png', fullPage: true });
  await page.getByLabel('Terrain detail').selectOption('auto');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Fit map', exact: true }).click();
  await expect(canvas).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/map-3d-mobile.png', fullPage: true });
  await canvas.evaluate((el) => el.dispatchEvent(new Event('webglcontextlost', { cancelable: true })));
  await expect(scene).toHaveCount(0);
  await expect(page.getByRole('button', { name: '3D map', exact: true })).toBeVisible();
  await expect(page.getByText(/3D unavailable: graphics context lost/)).toBeVisible();
  await expect(page.locator('[data-map-resolution]')).toBeVisible();
  await page.getByRole('link', { name: 'Hagga Basin', exact: true }).click();
  await expect(scene).toHaveAttribute('data-scene-state', 'ready', { timeout: 30_000 });
  await page.getByRole('button', { name: '2D map', exact: true }).click();
  await expect(scene).toHaveCount(0);
  await expect(page.getByRole('button', { name: "POI's: Uncovered location", exact: true })).toBeVisible();
  await page.getByRole('button', { name: '3D map', exact: true }).click();
  await expect(scene).toHaveAttribute('data-scene-state', 'ready', { timeout: 30_000 });
  await page.getByLabel('Find on map').fill('Uncovered location');
  await page.getByRole('list', { name: 'Map search results' }).getByRole('button').click();
  await expect(scene).toHaveCount(0);
  await expect(page.getByText(/3D unavailable: this location has no 3D terrain coverage/)).toBeVisible();
  expect(errors).toEqual([]);
});

for (const mapName of ['Hagga Basin', 'Deep Desert']) {
  test(`dense 3D blips stay over rendered terrain at high detail on ${mapName}`, async ({ page }) => {
    test.setTimeout(120_000);
    const identityWarnings: string[] = [];
    page.on('console', (message) => {
      if (/same key|unique.*key/i.test(message.text())) identityWarnings.push(message.text());
    });
    await page.setViewportSize({ width: 1100, height: 800 });
    await page.route('**/api/map/realtime?*', (route) =>
      route.fulfill({ json: { ok: true, gen: 1, sources: [], markers: [] } }),
    );
    await page.route('**/api/map?*', (route) => {
      const deep = new URL(route.request().url()).searchParams.get('map') === 'DeepDesert';
      const map = deep
        ? { width: 8192, height: 8192, minX: -1177656, maxX: 1072344, minY: -1177066, maxY: 1072934 }
        : { width: 8192, height: 8192, minX: -457200, maxX: 355600, minY: -457200, maxY: 355600 };
      const markers = Array.from({ length: 450 }, (_, id) => ({
        id: `shared-template-${id % 4}`,
        type: 'flour_sand',
        name: `Location ${id}`,
        x: map.minX + (((id % 25) + 0.5) / 25) * (map.maxX - map.minX),
        y: map.minY + ((Math.floor(id / 25) + 0.5) / 18) * (map.maxY - map.minY),
      }));
      return route.fulfill({
        json: { ok: true, map, markers: [...markers, { ...markers[0] }], coriolisLayout: deep ? 6 : null },
      });
    });
    // Separate per-map budgets retain full geometry, marker density and wheel sequences.
    // A normal desktop canvas avoids making software rasterization an ultrawide benchmark.
    await page.goto(`/portal?view=${mapName === 'Deep Desert' ? 'deep-desert' : 'hagga'}`);
    const scene = page.locator('[data-map-view="3d"]');
    await expect(scene).toHaveAttribute('data-scene-state', 'ready', { timeout: 30_000 });
    const markerNodes = scene.locator('[data-marker-id]');
    await expect(markerNodes).toHaveCount(450);
    expect(
      await markerNodes.evaluateAll(
        (nodes) => new Set(nodes.map((node) => (node as HTMLElement).dataset.markerId)).size,
      ),
    ).toBe(450);
    const controlsBox = await page.locator('[data-map-controls]').boundingBox();
    const sceneBox = await scene.boundingBox();
    expect(controlsBox!.y + controlsBox!.height).toBeLessThanOrEqual(sceneBox!.y + 1);
    await page.getByLabel('Terrain detail').selectOption('high');
    const canvas = scene.locator('canvas');
    await canvas.evaluate((element: HTMLCanvasElement) => {
      const gl = element.getContext('webgl2')!;
      const original = gl.drawElements.bind(gl);
      let framePixels = new Uint8Array(0);
      gl.drawElements = (...args: Parameters<typeof gl.drawElements>) => {
        original(...args);
        if (args[1] < 400000) return;
        // Read the framebuffer once: 20 synchronous GPU readbacks per draw overwhelm SwiftShader.
        const byteLength = element.width * element.height * 4;
        if (framePixels.length !== byteLength) framePixels = new Uint8Array(byteLength);
        gl.readPixels(0, 0, element.width, element.height, gl.RGBA, gl.UNSIGNED_BYTE, framePixels);
        const bad: string[] = [];
        const markers = Array.from(
          element.parentElement!.querySelectorAll<HTMLElement>('[data-terrain-state="visible"]'),
        ).slice(0, 20);
        for (const marker of markers) {
          const x = Math.round((parseFloat(marker.style.left) * element.width) / element.clientWidth);
          const y = element.height - Math.round((parseFloat(marker.style.top) * element.height) / element.clientHeight);
          if (x < 4 || y < 4 || x >= element.width - 4 || y >= element.height - 4) continue;
          let ground = false;
          for (let dy = -4; dy < 4 && !ground; dy++) {
            for (let dx = -4; dx < 4; dx++) {
              const offset = ((y + dy) * element.width + x + dx) * 4;
              if (
                framePixels[offset + 3] &&
                (Math.abs(framePixels[offset] - 16) > 2 ||
                  Math.abs(framePixels[offset + 1] - 17) > 2 ||
                  Math.abs(framePixels[offset + 2] - 19) > 2)
              ) {
                ground = true;
                break;
              }
            }
          }
          if (!ground) bad.push(marker.dataset.markerId!);
        }
        element.dataset.alignmentChecked = String(markers.length);
        const previous = JSON.parse(element.dataset.backgroundBlips ?? '[]') as string[];
        element.dataset.backgroundBlips = JSON.stringify([...new Set([...previous, ...bad])]);
      };
    });
    await page.getByRole('button', { name: 'Fit map', exact: true }).click();
    // Fit may already match the camera: an explicit zoom guarantees a terrain frame.
    await page.getByRole('button', { name: 'Zoom in', exact: true }).click();
    await expect.poll(async () => Number(await canvas.getAttribute('data-alignment-checked'))).toBeGreaterThan(0);
    await expect(canvas).toHaveAttribute('data-background-blips', '[]');
    await canvas.evaluate(
      () => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))),
    );
    const blip = scene.locator('[data-terrain-state="visible"]').first();
    const beforeFrame = await blip.evaluate((el) => [el.style.left, el.style.top]);
    const zoomBox = await page.getByRole('button', { name: 'Zoom in', exact: true }).boundingBox();
    await canvas.evaluate((element) => {
      const original = window.requestAnimationFrame;
      const queued: FrameRequestCallback[] = [];
      window.requestAnimationFrame = (callback) => {
        queued.push(callback);
        return -1;
      };
      Object.defineProperty(element, 'resumeFrames', {
        configurable: true,
        value: () => {
          window.requestAnimationFrame = original;
          queued.forEach((callback) => original(callback));
        },
      });
    });
    // Use a toolbar zoom: dense marker buttons can intercept a drag's starting point.
    await page.mouse.click(zoomBox!.x + zoomBox!.width / 2, zoomBox!.y + zoomBox!.height / 2);
    // A queued terrain frame must not leave blips projected with a newer camera.
    expect(await blip.evaluate((el) => [el.style.left, el.style.top])).toEqual(beforeFrame);
    await canvas.evaluate((element) => Reflect.get(element, 'resumeFrames')());
    await expect
      .poll(() => blip.evaluate((el) => [el.style.left, el.style.top]), { timeout: 15000 })
      .not.toEqual(beforeFrame);
    const box = await canvas.boundingBox();
    await page.mouse.move(box!.x + box!.width * 0.95, box!.y + box!.height * 0.28);
    await page.mouse.down();
    await page.mouse.move(box!.x + box!.width * 0.8, box!.y + box!.height * 0.28, { steps: 8 });
    await page.mouse.up();
    // Reverse the wheel across successive frames, preserving failures from every draw.
    await canvas.evaluate(async (element) => {
      const rect = element.getBoundingClientRect();
      for (let i = 0; i < 12; i++) {
        element.dispatchEvent(
          new WheelEvent('wheel', {
            deltaY: i % 2 ? 350 : -350,
            clientX: rect.x + rect.width / 2,
            clientY: rect.y + rect.height / 2,
            bubbles: true,
            cancelable: true,
          }),
        );
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      }
    });
    await expect(canvas).toHaveAttribute('data-background-blips', '[]');
    expect(identityWarnings).toEqual([]);
    await page.screenshot({ path: `test-results/map-aligned-${mapName.replaceAll(' ', '-')}.png`, fullPage: true });
  });
}

test('sandworm models appear up close, update in place, and respect the realtime filter', async ({ page }) => {
  test.setTimeout(60_000);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error' && /THREE.WebGLProgram|shader error/i.test(message.text()))
      errors.push(message.text());
  });
  let samples = 0;
  await page.route('**/api/map/realtime?*', (route) => {
    samples++;
    return route.fulfill({
      json: {
        ok: true,
        gen: 1,
        capturedAt: Date.now(),
        sources: [{ partition: 1, ready: true }],
        markers: [
          {
            id: 'custom-worm',
            type: 'worm',
            name: 'Shai-Hulud',
            x: 0,
            y: samples * 200,
            z: -50000,
            partition: 1,
            realtime: true,
          },
        ],
      },
    });
  });
  await page.route('**/api/map?*', (route) =>
    route.fulfill({
      json: {
        ok: true,
        map: { width: 8192, height: 8192, minX: -457200, maxX: 355600, minY: -457200, maxY: 355600, flipY: false },
        markers: [],
      },
    }),
  );
  await page.goto('/map');
  const scene = page.locator('[data-map-view="3d"]');
  await expect(scene).toHaveAttribute('data-scene-state', 'ready', { timeout: 30_000 });
  const worm = page.getByRole('button', { name: 'Sandworm: Shai-Hulud', exact: true, includeHidden: true });
  await expect(worm).toHaveAttribute('data-model-state', 'ready');
  await expect(worm).toHaveAttribute('data-model-visible', 'false');
  await page.getByLabel('Find on map').fill('Shai-Hulud');
  await page.getByRole('list', { name: 'Map search results' }).getByRole('button').click();
  await page.getByRole('button', { name: 'Close location details', exact: true }).click();
  await expect(worm).toHaveAttribute('data-model-visible', 'true');
  await expect(worm).toHaveAttribute('data-model-prominent', 'true');
  await expect(worm.locator('.realtime-symbol')).toBeHidden();
  await page.getByRole('button', { name: 'Zoom in', exact: true }).click();
  await page.screenshot({ path: 'test-results/map-sandworm-model.png', fullPage: true });
  const canvasBox = await scene.locator('canvas').boundingBox();
  await page.mouse.move(canvasBox!.x + canvasBox!.width * 0.3, canvasBox!.y + canvasBox!.height * 0.35);
  await page.mouse.down();
  await page.mouse.move(canvasBox!.x + canvasBox!.width * 0.6, canvasBox!.y + canvasBox!.height * 0.6, {
    steps: 8,
  });
  await page.mouse.up();
  await page.screenshot({ path: 'test-results/map-sandworm-orbit.png', fullPage: true });
  const firstElement = await worm.elementHandle();
  const before = samples;
  await expect.poll(() => samples).toBeGreaterThan(before);
  expect(await worm.evaluate((element, oldElement) => element === oldElement, firstElement)).toBe(true);
  await expect(worm).toHaveAttribute('data-model-visible', 'true');
  await page.getByLabel('Sandworms (realtime)', { exact: true }).uncheck();
  await expect(worm).toHaveCount(0);
  await page.getByLabel('Sandworms (realtime)', { exact: true }).check();
  await expect(worm).toHaveAttribute('data-model-visible', 'true');
  await page.getByRole('button', { name: 'Fit map', exact: true }).click();
  await expect(worm).toHaveAttribute('data-model-visible', 'false');
  await expect(worm.locator('.realtime-symbol')).toBeVisible();
  expect(errors).toEqual([]);
});

test('base models render from the full map and vehicles appear up close with map tools', async ({ page }) => {
  test.setTimeout(90_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (message) => {
    if (message.type() === 'error' && /THREE.WebGLProgram|shader error/i.test(message.text()))
      errors.push(message.text());
  });
  let exports = 0;
  const pieces: { building_type: string; x: number; y: number; z: number; rotation: number }[] = [];
  for (const x of [-512, 0, 512])
    for (const y of [-512, 0, 512]) {
      pieces.push({ building_type: 'Atreides_Outpost_Foundation', x, y, z: 0, rotation: 0 });
      pieces.push({ building_type: 'Atreides_Outpost_Floor', x, y, z: 768, rotation: 0 });
    }
  for (const x of [-512, 0, 512])
    for (const y of [-768, 768])
      pieces.push({ building_type: 'Atreides_Outpost_Wall_01', x, y, z: 384, rotation: y > 0 ? 180 : 0 });
  for (const y of [-512, 0, 512])
    for (const x of [-768, 768])
      pieces.push({ building_type: 'Atreides_Outpost_Wall_01', x, y, z: 384, rotation: x > 0 ? 90 : -90 });
  await page.route('**/api/map/realtime?*', (r) =>
    r.fulfill({ json: { ok: true, gen: 1, capturedAt: Date.now(), sources: [], markers: [] } }),
  );
  await page.route('**/api/map?*', (r) =>
    r.fulfill({
      json: {
        ok: true,
        map: { width: 8192, height: 8192, minX: -457200, maxX: 355600, minY: -457200, maxY: 355600, flipY: false },
        markers: [
          { id: 'model-base', type: 'base', name: 'Atreides stronghold', x: 0, y: 0 },
          { id: 'restricted-base', type: 'base', name: 'Unavailable building', x: 50000, y: 0 },
          { id: 'thopter', type: 'vehicle', subtype: 'TransportOrnithopter', name: 'Transport', x: 5000, y: 0 },
        ],
      },
    }),
  );
  await page.route('**/api/bases/*/export', (r) => {
    exports++;
    return r.request().url().includes('restricted-base')
      ? r.fulfill({ status: 403, json: { error: 'You do not own this base' } })
      : r.fulfill({ json: { instances: pieces, placeables: [] } });
  });
  await page.goto('/map');
  const scene = page.locator('[data-map-view="3d"]');
  await expect(scene).toHaveAttribute('data-scene-state', 'ready', { timeout: 30_000 });
  const base = page.getByRole('button', { name: 'Base: Atreides stronghold', exact: true });
  await expect(base).toHaveAttribute('data-model-state', 'ready', { timeout: 20_000 });
  await expect(base).toHaveAttribute('data-model-visible', 'true');
  await expect(base).toHaveAttribute('data-model-prominent', 'false');
  expect(exports).toBe(2);
  await page.getByLabel('Find on map').fill('Atreides');
  await page.getByRole('list', { name: 'Map search results' }).getByRole('button').click();
  await page.getByRole('button', { name: 'Fly to', exact: true }).click();
  await expect(base).toHaveAttribute('data-model-state', 'ready', { timeout: 20_000 });
  await expect(base).toHaveAttribute('data-model-visible', 'true');
  await expect(base).toHaveAttribute('data-model-prominent', 'true');
  await expect(page.locator('button.marker-base').filter({ hasText: 'Unavailable building' })).toHaveAttribute(
    'data-model-state',
    'unavailable',
  );
  const vehicle = page.getByRole('button', { name: 'Vehicle: Transport Ornithopter', exact: true });
  await expect(vehicle).toHaveAttribute('data-model-visible', 'true');
  await page.getByRole('button', { name: 'Close location details', exact: true }).click();
  await page.getByRole('button', { name: 'Zoom in', exact: true }).click();
  await page.getByRole('button', { name: 'Zoom in', exact: true }).click();
  await page.screenshot({ path: 'test-results/map-building-model.png', fullPage: true });
  const canvas = scene.locator('canvas'),
    box = await canvas.boundingBox();
  await page.mouse.click(box!.x + box!.width * 0.5, box!.y + box!.height * 0.5);
  await expect(page.getByRole('button', { name: 'Fly to', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Close location details', exact: true }).click();
  await vehicle.click();
  await page.getByRole('button', { name: 'Fly to', exact: true }).click();
  await page.getByRole('button', { name: 'Close location details', exact: true }).click();
  await page.screenshot({ path: 'test-results/map-vehicle-model.png', fullPage: true });
  const exportCount = exports;
  const positionBeforeQuality = await vehicle.evaluate((el) => [el.style.left, el.style.top]);
  await page.getByLabel('Terrain detail').selectOption('high');
  await expect(scene).toHaveAttribute('data-render-quality', 'high');
  const detailedVehiclePosition = await vehicle.evaluate((el) => [el.style.left, el.style.top]);
  detailedVehiclePosition.forEach((value, i) =>
    expect(Math.abs(parseFloat(value) - parseFloat(positionBeforeQuality[i]))).toBeLessThan(3),
  );
  await page.screenshot({ path: 'test-results/map-high-detail.png', fullPage: true });
  await page.getByLabel('Terrain detail').selectOption('auto');
  await page.getByLabel('Terrain style').selectOption('atlas');
  await page.getByRole('button', { name: 'Contours', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Contours', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.getByLabel('Terrain style').selectOption('relief');
  await page.getByRole('button', { name: 'Top down', exact: true }).click();
  await page.getByRole('button', { name: 'Face north', exact: true }).click();
  expect(exports).toBe(exportCount);
  await page.getByRole('button', { name: 'Fit map', exact: true }).click();
  await expect(base).toHaveAttribute('data-model-visible', 'true');
  await expect(base).toHaveAttribute('data-model-prominent', 'false');
  expect(exports).toBe(exportCount);
  await expect(scene.locator('[data-scale-label]')).toHaveText(/\d+(?:\.\d+)? (?:m|km)/);
  await page.getByRole('button', { name: 'Fullscreen', exact: true }).click();
  await expect.poll(() => page.evaluate(() => Boolean(document.fullscreenElement))).toBe(true);
  await page.evaluate(() => document.exitFullscreen());
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/map-model-mobile.png', fullPage: true });
  expect(errors).toEqual([]);
});

test('spice fields, shipwrecks, and flour sand have terrain models that follow layer filters', async ({ page }) => {
  test.setTimeout(90_000);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (/THREE.WebGLProgram|shader error|same key/i.test(message.text())) errors.push(message.text());
  });
  await page.route('**/api/map/realtime?*', (route) =>
    route.fulfill({ json: { ok: true, gen: 1, sources: [], markers: [] } }),
  );
  await page.route('**/api/map?*', (route) =>
    route.fulfill({
      json: {
        ok: true,
        map: { width: 8192, height: 8192, minX: -457200, maxX: 355600, minY: -457200, maxY: 355600 },
        markers: [
          { id: 'active-spice', type: 'spice_active', subtype: 'large', name: 'Active spice field', x: 0, y: 0 },
          { id: 'possible-spice', type: 'spice', subtype: 'medium', name: 'Possible spice field', x: 50000, y: 0 },
          { id: 'wreck', type: 'poi', subtype: 'shipwreck', name: 'Derelict ship', x: 25000, y: 0 },
          { id: 'flour', type: 'flour_sand', name: 'Flour deposit', x: -25000, y: 0 },
        ],
      },
    }),
  );
  await page.goto('/map');
  const scene = page.locator('[data-map-view="3d"]');
  await expect(scene).toHaveAttribute('data-scene-state', 'ready', { timeout: 30_000 });
  for (const [name, kind] of [
    ['Active spice field', 'spice-active'],
    ['Possible spice field', 'spice'],
    ['Derelict ship', 'shipwreck'],
    ['Flour deposit', 'flour-sand'],
  ]) {
    await page.getByLabel('Find on map').fill(name);
    await page.getByRole('list', { name: 'Map search results' }).getByRole('button').click();
    const marker = scene.locator(`[data-model-kind="${kind}"]`);
    await expect(marker).toHaveAttribute('data-model-state', 'ready');
    await expect(marker).toHaveAttribute('data-model-visible', 'true');
    await expect(marker).toHaveAttribute('data-model-prominent', 'true');
    await page.screenshot({ path: `test-results/map-world-${kind}.png`, fullPage: true });
  }
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/map-world-mobile.png', fullPage: true });
  await page.getByRole('checkbox', { name: 'Flour Sand', exact: true }).uncheck();
  await expect(scene.locator('[data-model-kind="flour-sand"]')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('owned bases publish to the marketplace and open 3D listing previews', async ({ page }) => {
  const id = 'a'.repeat(24);
  const summary = {
    id,
    title: 'Shared Outpost',
    author: 'Desert Navigator',
    baseType: 'Advanced Sub-Fief',
    map: 'Hagga Basin',
    pieceCount: 2,
    placeableCount: 1,
    publishedAt: '2026-10-27T12:00:00.000Z',
    previewRevision: 'd'.repeat(24),
  };
  const record = {
    summary,
    layout: {
      name: 'Shared Outpost',
      base_type: 'Advanced Sub-Fief',
      map: 'Hagga Basin',
      instances: [{ building_type: 'Atreides_Outpost_Foundation', x: 0, y: 0, z: 0, rotation: 0 }],
      placeables: [{ building_type: 'Atre_Chair_1_Placeable', x: 0, y: 0, z: 384, ry: 90 }],
      pentashields: [],
    },
  };
  await page.route('**/api/bases/0/marketplace', (route) => route.fulfill({ json: { ok: true, listing: summary } }));
  await page.route('**/api/base-marketplace', (route) =>
    route.fulfill({ json: { ok: true, listings: [summary], total: 1 } }),
  );
  let picture = '';
  await page.route('**/api/bases/0/export', (route) => route.fulfill({ json: record.layout }));
  await page.route('**/api/bases/0/preview', (route) => {
    if (route.request().method() === 'POST') picture = route.request().postDataJSON().image;
    return route.fulfill({ json: { ok: true, view: null, hasPicture: Boolean(picture) } });
  });
  await page.route(`**/api/base-marketplace/${id}*`, (route) =>
    new URL(route.request().url()).searchParams.get('image') === '1'
      ? route.fulfill({ contentType: 'image/png', body: Buffer.from(picture.split(',')[1], 'base64') })
      : route.fulfill({ json: record }),
  );
  let imports = 0;
  await page.route('**/api/bases/import', (route) => {
    imports++;
    const body = route.request().postDataJSON();
    expect(body.title).toBe(summary.title);
    expect(body.blueprint.instances[0].instance_id).toBe(0);
    expect(body.blueprint.placeables[0].ry).toBe(90);
    expect(body.blueprint).not.toHaveProperty('owner_name');
    return route.fulfill({
      json: { ok: true, record: { status: 'imported', message: 'Delivered to your backpack as a Solido tool.' } },
    });
  });
  await page.goto('/portal?view=bases');
  const base = page.locator('article').filter({ hasText: 'Stronghold 1' });
  await base.getByRole('button', { name: 'Share Base', exact: true }).click();
  await expect(base.getByRole('heading', { name: 'Choose the front of your base' })).toBeVisible();
  await expect(base.getByRole('button', { name: 'Publish base with this picture', exact: true })).toBeDisabled();
  await expect(base.getByRole('button', { name: 'Use this front and picture', exact: true })).toBeEnabled({
    timeout: 30000,
  });
  await base.getByRole('button', { name: 'Use this front and picture', exact: true }).click();
  await base.getByRole('button', { name: 'Publish base with this picture', exact: true }).click();
  await base.getByRole('link', { name: 'View listing ↗' }).click();
  await expect(page.getByRole('heading', { name: 'Base Marketplace', exact: true }).first()).toBeVisible();
  await expect(page.getByText('Shared Outpost', { exact: true })).toBeVisible();
  await page.getByLabel('Search by base or author').fill('nobody');
  await expect(page.getByText('No matching bases', { exact: true })).toBeVisible();
  await page.getByLabel('Search by base or author').fill('Desert Navigator');
  await expect(page.getByText('Shared Outpost', { exact: true })).toBeVisible();
  await page.getByLabel('Base size').selectOption('large');
  await expect(page.getByText('No matching bases', { exact: true })).toBeVisible();
  await page.getByLabel('Base size').selectOption('small');
  await page.locator('article').filter({ hasText: 'Shared Outpost' }).scrollIntoViewIfNeeded();
  await expect(page.getByRole('img', { name: 'Shared Outpost front picture' })).toBeVisible({ timeout: 30000 });
  await page.screenshot({ path: 'test-results/base-marketplace.png', fullPage: true });
  await page.getByRole('button', { name: 'Import to my character', exact: true }).click();
  await expect(page.getByText('Delivered to your backpack as a Solido tool.', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Import submitted', exact: true })).toBeDisabled();
  expect(imports).toBe(1);
  await page.getByRole('button', { name: 'Inspect base', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Shared Outpost shared base', exact: true });
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('[data-base-preview-state]')).toHaveAttribute('data-base-preview-state', 'ready', {
    timeout: 30000,
  });
  await expect(dialog.locator('canvas')).toHaveCount(1);
  await expect(dialog.getByRole('link', { name: 'Download layout ↓' })).toHaveAttribute(
    'href',
    `/api/base-marketplace/${id}?download=1`,
  );
  await page.screenshot({ path: 'test-results/base-marketplace-preview.png' });
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
});

test('Bases loads owned 3D previews on demand and disposes them when switching bases', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (/THREE.WebGLProgram|shader error|GLTFLoader: Couldn't load texture/i.test(message.text()))
      errors.push(message.text());
  });
  let exports = 0;
  await page.route('**/api/bases/*/export', (route) => {
    exports++;
    return route.fulfill({
      json: {
        x: 500000,
        y: 200000,
        z: 3000,
        instances: [
          ...Array.from({ length: 9 }, (_, index) => ({
            building_type: 'Atreides_Outpost_Foundation',
            x: ((index % 3) - 1) * 512,
            y: (Math.floor(index / 3) - 1) * 512,
            z: 0,
            rotation: 0,
          })),
          { building_type: 'Atreides_Outpost_Wall_01', x: 0, y: 768, z: 384, rotation: 180 },
          { building_type: 'Future_Unsupported_Piece', x: 0, y: 0, z: 0 },
        ],
        placeables: [
          { building_type: 'Atre_Chair_1_Placeable', x: 0, y: 0, z: 384, ry: 90 },
          { building_type: 'Atreides_DoorTall_Placeable', x: 300, y: 0, z: 384 },
        ],
      },
    });
  });
  await page.goto('/portal?view=bases');
  const preview = page.getByRole('region', { name: '3D base preview', exact: true });
  await expect(preview.getByText('Explore your base in 3D', { exact: true })).toBeVisible();
  expect(exports).toBe(0);
  await expect(preview.locator('canvas')).toHaveCount(0);
  await preview.getByRole('button', { name: 'Load 3D preview', exact: true }).click();
  await expect(preview.locator('[data-base-preview-state]')).toHaveAttribute('data-base-preview-state', 'partial', {
    timeout: 30000,
  });
  expect(exports).toBe(1);
  await expect(preview.locator('canvas')).toHaveCount(1);
  await preview.getByRole('button', { name: 'Top view', exact: true }).click();
  await preview.getByRole('combobox', { name: 'Base for 3D preview' }).selectOption('1');
  await expect(preview.locator('canvas')).toHaveCount(0);
  await preview.getByRole('button', { name: 'Load 3D preview', exact: true }).click();
  await expect(preview.locator('[data-base-preview-state]')).toHaveAttribute('data-base-preview-state', 'partial', {
    timeout: 30000,
  });
  expect(exports).toBe(2);
  await preview.getByRole('button', { name: 'Close preview', exact: true }).click();
  await expect(preview.locator('canvas')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('old marketplace listings require an owner picture without generating a thumbnail', async ({ page }) => {
  const summary = {
    id: 'e'.repeat(24),
    title: 'Old base',
    author: 'Owner',
    baseType: 'Sub-Fief',
    map: 'Hagga Basin',
    pieceCount: 1,
    placeableCount: 0,
    publishedAt: '2026-10-27T12:00:00.000Z',
  };
  let modelReads = 0;
  await page.route('**/api/base-marketplace', (route) =>
    route.fulfill({ json: { ok: true, listings: [summary], total: 1 } }),
  );
  await page.route(`**/api/base-marketplace/${summary.id}*`, (route) => {
    modelReads++;
    return route.abort();
  });
  await page.goto('/portal?view=base-market');
  await expect(
    page.getByText('Picture required — the owner must choose a front and take a picture in My bases.', { exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Import to my character', exact: true })).toHaveCount(0);
  await expect(page.locator('canvas')).toHaveCount(0);
  expect(modelReads).toBe(0);
  await expect(page.getByRole('button', { name: 'Change picture', exact: true })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'My bases', exact: true }).last()).toHaveAttribute(
    'href',
    '/portal?view=bases',
  );
});

test('owners replace an old marketplace picture without publishing or uploading the base again', async ({ page }) => {
  const id = 'f'.repeat(24);
  const revision = 'd'.repeat(24);
  const summary = {
    id,
    editableBaseId: '0',
    title: 'Existing fortress',
    author: 'Owner',
    baseType: 'Sub-Fief',
    map: 'Hagga Basin',
    pieceCount: 1,
    placeableCount: 0,
    publishedAt: '2026-10-27T12:00:00.000Z',
  };
  const layout = { instances: [{ building_type: 'Atreides_Outpost_Foundation', x: 0, y: 0, z: 0 }], placeables: [] };
  let image = '';
  let saves = 0;
  let uploads = 0;
  await page.route('**/api/base-marketplace', (route) =>
    route.fulfill({ json: { ok: true, listings: [summary], total: 1 } }),
  );
  await page.route(`**/api/base-marketplace/${id}*`, (route) =>
    new URL(route.request().url()).searchParams.get('image') === '1'
      ? route.fulfill({ contentType: 'image/png', body: Buffer.from(image.split(',')[1], 'base64') })
      : route.fulfill({ json: { summary, layout } }),
  );
  await page.route('**/api/bases/0/marketplace', (route) => {
    uploads++;
    return route.abort();
  });
  await page.route('**/api/bases/import', (route) => {
    uploads++;
    return route.abort();
  });
  await page.route('**/api/bases/0/export', (route) => {
    uploads++;
    return route.abort();
  });
  await page.route('**/api/bases/0/preview', (route) => {
    expect(route.request().method()).toBe('POST');
    const body = route.request().postDataJSON();
    expect(body.view.facing).toBe(91);
    image = body.image;
    saves++;
    return saves === 1
      ? route.fulfill({ status: 403, json: { error: 'Not authorized' } })
      : route.fulfill({ json: { ok: true, revision } });
  });
  await page.goto('/portal?view=base-market');
  await page.getByRole('button', { name: 'Change picture', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Existing fortress change picture', exact: true });
  const save = dialog.getByRole('button', { name: 'Save picture', exact: true });
  await expect(save).toBeDisabled();
  await expect(dialog.getByRole('button', { name: 'Use this front and picture', exact: true })).toBeEnabled({
    timeout: 30000,
  });
  await dialog.getByLabel('Base facing degrees').fill('91');
  await dialog.getByRole('button', { name: 'Level front view', exact: true }).click();
  await dialog.getByRole('button', { name: 'Use this front and picture', exact: true }).click();
  await save.click();
  await expect(dialog.getByRole('alert')).toHaveText('Could not save the picture. Please try again.');
  await save.click();
  await expect(dialog).toHaveCount(0);
  const picture = page.getByRole('img', { name: 'Existing fortress front picture', exact: true });
  await expect(picture).toHaveAttribute('src', `/api/base-marketplace/${id}?image=1&v=${revision}`);
  await expect.poll(() => picture.evaluate((element: HTMLImageElement) => element.naturalWidth)).toBe(640);
  await expect(page.locator('time')).toHaveAttribute('datetime', summary.publishedAt);
  expect(uploads).toBe(0);
  expect(saves).toBe(2);
  await expect(page.getByRole('button', { name: 'Import to my character', exact: true })).toBeVisible();
  await page.screenshot({ path: 'test-results/marketplace-change-picture.png', fullPage: true });
});

test('saved front pictures survive reload and marketplace cards skip 3D downloads', async ({ page }) => {
  const id = 'b'.repeat(24);
  let saved: { view: { facing: number }; image: string } | null = null;
  let modelReads = 0;
  const layout = {
    instances: [
      { building_type: 'Atreides_Outpost_Foundation', x: -1024, y: 0, z: 0 },
      { building_type: 'Atreides_Outpost_Foundation', x: 1024, y: 0, z: 0 },
      { building_type: 'Atreides_Outpost_Wall_01', x: 1024, y: 0, z: 384 },
    ],
    placeables: [],
  };
  await page.route('**/api/bases/*/export', (route) => route.fulfill({ json: layout }));
  await page.route('**/api/bases/*/preview', (route) => {
    if (route.request().method() === 'POST') saved = route.request().postDataJSON();
    return route.fulfill({ json: { ok: true, view: saved?.view ?? null } });
  });
  await page.goto('/portal?view=bases');
  const preview = page.getByRole('region', { name: '3D base preview', exact: true });
  await preview.getByRole('button', { name: 'Load 3D preview', exact: true }).click();
  await expect(preview.getByRole('button', { name: 'Take picture & save front', exact: true })).toBeEnabled({
    timeout: 30000,
  });
  await preview.getByLabel('Base facing degrees').fill('73');
  await preview.getByRole('button', { name: 'Fit whole base', exact: true }).click();
  await preview.getByRole('button', { name: 'Take picture & save front', exact: true }).click();
  await expect(
    preview.getByText('Front and picture saved for this base. Shared cards will use this picture.', { exact: true }),
  ).toBeVisible();
  expect(saved?.view.facing).toBe(73);
  expect(saved?.image).toMatch(/^data:image\/png;base64,/);
  await preview.getByRole('button', { name: 'Reload preview', exact: true }).click();
  await expect(preview.getByLabel('Base facing degrees')).toHaveValue('73', { timeout: 30000 });
  await page.screenshot({ path: 'test-results/saved-base-front.png', fullPage: true });
  const summary = {
    id,
    title: 'Photographed base',
    author: 'Owner',
    baseType: 'Sub-Fief',
    map: 'Hagga Basin',
    pieceCount: 3,
    placeableCount: 0,
    publishedAt: '2026-10-27T12:00:00.000Z',
    previewRevision: 'c'.repeat(24),
  };
  await page.route('**/api/base-marketplace', (route) =>
    route.fulfill({ json: { ok: true, listings: [summary], total: 1 } }),
  );
  await page.route(`**/api/base-marketplace/${id}*`, (route) => {
    if (new URL(route.request().url()).searchParams.get('image') === '1')
      return route.fulfill({ contentType: 'image/png', body: Buffer.from(saved!.image.split(',')[1], 'base64') });
    modelReads++;
    return route.fulfill({ json: { summary, layout } });
  });
  await page.goto('/portal?view=base-market');
  const image = page.getByRole('img', { name: 'Photographed base front picture' });
  await expect(image).toBeVisible();
  await expect
    .poll(() => image.evaluate((element: HTMLImageElement) => [element.naturalWidth, element.naturalHeight]))
    .toEqual([640, 360]);
  expect(modelReads).toBe(0);
  await expect(page.locator('canvas')).toHaveCount(0);
  await page.screenshot({ path: 'test-results/saved-base-marketplace.png', fullPage: true });
});

test('base preview hides private export errors and recovers on reload', async ({ page }) => {
  let denied = true;
  let exports = 0;
  await page.route('**/api/bases/*/export', (route) => {
    exports++;
    return denied
      ? route.fulfill({ status: 403, json: { error: 'private provider information' } })
      : route.fulfill({
          json: { instances: [{ building_type: 'Atreides_Outpost_Foundation', x: 0, y: 0, z: 0 }], placeables: [] },
        });
  });
  await page.goto('/portal?view=bases');
  const preview = page.getByRole('region', { name: '3D base preview', exact: true });
  await preview.getByRole('button', { name: 'Load 3D preview', exact: true }).click();
  await expect(preview.getByText('This base is not available to your account.')).toBeVisible();
  expect(exports).toBe(1);
  await expect(preview.getByText('private provider information')).toHaveCount(0);
  denied = false;
  await preview.getByRole('button', { name: 'Reload preview', exact: true }).click();
  await expect(preview.locator('[data-base-preview-state]')).toHaveAttribute('data-base-preview-state', 'ready', {
    timeout: 30000,
  });
  expect(exports).toBe(2);
  await expect(preview.locator('canvas')).toHaveCount(1);
});

test('base storage matches the dark workspace and keeps long container lists usable', async ({ page }) => {
  const containers = Array.from({ length: 26 }, (_, index) => ({
    placeableId: String(index),
    name: `Container ${index + 1}`,
    typeName: index < 7 ? 'Storage Container' : 'Chest',
    usedSlots: index === 1 ? 15 : 0,
    maxSlots: 45,
    itemCount: index === 1 ? 15 : 0,
    items:
      index === 1
        ? Array.from({ length: 15 }, (_, item) => ({
            templateId: `spice_${item}`,
            name: `Spice stack ${item + 1}`,
            quantity: 20,
          }))
        : [],
  }));
  await page.route('**/api/player', (route) =>
    route.fulfill({
      json: {
        ...player,
        details: {
          ...player.details,
          bases: { rows: [{ ...player.details.bases.rows[0], inventory: { containers } }] },
        },
      },
    }),
  );
  await page.setViewportSize({ width: 1446, height: 1030 });
  await page.goto('/portal?view=bases&theme=default');
  const card = page.locator('.base-grid [role="button"]').first();
  await card.click();
  const dialog = page.getByRole('dialog', { name: 'Stronghold 1 storage', exact: true });
  const sidebar = dialog.getByRole('complementary', { name: 'Base storage containers' });
  await expect(dialog.getByRole('heading', { name: 'This container is empty' })).toBeVisible();
  expect(await dialog.evaluate((element) => getComputedStyle(element).backgroundImage)).toBe('none');
  await expect(sidebar.getByText('Containers page 1 of 3')).toBeVisible();
  await dialog.focus();
  await page.keyboard.press('Tab');
  await expect(dialog.getByRole('button', { name: 'Close base storage' })).toBeFocused();
  await page.screenshot({ path: 'test-results/base-storage-desktop.png' });
  await sidebar.getByRole('button', { name: /^Container 2 / }).click();
  await expect(dialog.getByRole('list', { name: 'Container items' }).getByRole('listitem')).toHaveCount(12);
  await dialog.getByRole('button', { name: 'Next items page' }).click();
  await expect(dialog.getByRole('list', { name: 'Container items' }).getByRole('listitem')).toHaveCount(3);
  await dialog.getByRole('textbox', { name: 'Search items' }).fill('nothing-found');
  await expect(dialog.getByRole('heading', { name: 'No matching items' })).toBeVisible();
  await dialog.getByRole('button', { name: 'Clear search' }).click();
  await expect(dialog.getByRole('listitem')).toHaveCount(12);
  await page.setViewportSize({ width: 390, height: 844 });
  const nextContainers = sidebar.getByRole('button', { name: 'Next containers page' });
  await nextContainers.click();
  await nextContainers.click();
  await expect(sidebar.getByText('Containers page 3 of 3')).toBeVisible();
  await sidebar.getByRole('button', { name: /^Container 26 / }).click();
  await expect(
    dialog.getByRole('region', { name: 'Container contents' }).getByRole('heading', { name: 'Container 26' }),
  ).toBeVisible();
  await expect(dialog.getByRole('heading', { name: 'This container is empty' })).toBeVisible();
  expect(await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
  const box = await dialog.boundingBox();
  expect(box!.y + box!.height).toBeLessThanOrEqual(844);
  const pager = await sidebar.getByRole('navigation').boundingBox();
  const side = await sidebar.boundingBox();
  expect(pager!.y + pager!.height).toBeLessThanOrEqual(side!.y + side!.height);
  await page.screenshot({ path: 'test-results/base-storage-mobile.png' });
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(card).toBeFocused();
  expect(await page.evaluate(() => document.body.style.overflow)).not.toBe('hidden');
});
