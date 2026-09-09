import { version } from '../../package.json';
import { test, expect } from '@playwright/test';
import { summarizePopulation } from '../../src/modules/portal/utils/population';
import { defaultPublicSiteConfig } from '../../src/config/public-site';

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
  await page.route('**/api/session', (route) =>
    route.fulfill({ json: { ok: true, cacheScope: 'a'.repeat(64), expiresAt: Date.now() + 43200000 } }),
  );
  await page.route('https://cdn.discordapp.com/avatars/**', (route) =>
    route.fulfill({ path: 'public/maps/atreides.webp', contentType: 'image/webp' }),
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

test('applies deployment branding, theme, labels, and feature switches from public configuration', async ({ page }) => {
  await page.route('**/api/config', (route) =>
    route.fulfill({
      json: {
        ok: true,
        data: {
          ...defaultPublicSiteConfig,
          name: 'Sietch Test',
          title: 'Sietch Operations',
          mapLabels: { HaggaBasin: 'Home Basin', DeepDesert: 'The Erg' },
          theme: { ...defaultPublicSiteConfig.theme, accent: '#12abef' },
          features: { ...defaultPublicSiteConfig.features, market: false },
        },
      },
    }),
  );
  await page.goto('/portal');
  await expect(page.getByRole('link', { name: 'Sietch Test' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Home Basin', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'The Erg', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Exchange', exact: true })).toHaveCount(0);
  await expect(page).toHaveTitle('Sietch Operations');
  expect(
    await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--theme-gold').trim()),
  ).toBe('#12abef');
});

test('lists every named sietch and deep-desert partition and scopes map requests', async ({ page }) => {
  await page.route('**/api/map/destinations', (route) =>
    route.fulfill({
      json: {
        ok: true,
        data: [
          {
            key: 'sietch:HaggaBasin:101',
            label: 'Red Chasm',
            map: 'HaggaBasin',
            partitionId: '101',
            kind: 'sietch',
            type: 'PvE',
            active: true,
          },
          {
            key: 'sietch:HaggaBasin:102',
            label: 'Wind Pass',
            map: 'HaggaBasin',
            partitionId: '102',
            kind: 'sietch',
            type: 'PvE',
            active: true,
          },
          {
            key: 'deep-desert:DeepDesert:dd-1',
            label: 'Coriolis North',
            map: 'DeepDesert',
            partitionId: 'dd-1',
            kind: 'deep-desert',
            type: 'PvP',
            active: true,
          },
        ],
      },
    }),
  );
  let mapRequest = '';
  await page.route(/\/api\/map\?/, (route) => {
    mapRequest = route.request().url();
    return route.fulfill({
      json: { ok: true, map: { width: 100, height: 100, minX: 0, maxX: 100, minY: 0, maxY: 100 }, markers: [] },
    });
  });
  await page.goto('/portal');
  await expect(page.getByRole('link', { name: 'Red Chasm', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Wind Pass', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Coriolis North', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Red Chasm', exact: true }).getByText('PvE')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Coriolis North', exact: true }).getByText('PvP')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Red Chasm', exact: true }).getByText('Online')).toHaveAttribute(
    'title',
    'Current status · online',
  );
  await page.getByRole('link', { name: 'Wind Pass', exact: true }).click();
  await expect(page.getByLabel('Map destination')).toHaveValue('sietch:HaggaBasin:102');
  await expect.poll(() => mapRequest).toContain('partitionId=102');
});

test('ultrawide holdings use an expanded centered canvas with two cards above one', async ({ page }) => {
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
  expect(main!.x).toBeGreaterThan(200);
  expect(main!.width).toBe(3000);
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
  await expect(page.getByLabel('Briefing destination')).toHaveValue('sietch:HaggaBasin:default');
  await page.getByLabel('Briefing destination').selectOption({ label: 'Deep Desert' });
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
  await expect(page.getByText('60%', { exact: true })).toHaveCount(2);
  await expect(page.getByRole('alert').filter({ hasText: /\S/ })).toHaveCount(0);
  await expect(page.getByText('No matching listings found.', { exact: true })).toHaveCount(0);
});

test('map survives stylesheet extraction and refreshes independently', async ({ page }) => {
  const mapRequests: string[] = [];
  await page.route('**/api/map?*', (route) => {
    const url = new URL(route.request().url());
    mapRequests.push(url.toString());
    const liveOnly = url.searchParams.get('static') === '0';
    const deepDesert = url.searchParams.get('map') === 'DeepDesert';
    return route.fulfill({
      json: {
        ok: true,
        map: {
          width: 1000,
          height: 1000,
          minX: 0,
          maxX: 1000,
          minY: 0,
          maxY: 1000,
          label: deepDesert ? 'Deep Desert' : 'Hagga Basin',
        },
        coriolisLayout: deepDesert ? 0 : null,
        markers: [
          ...(liveOnly ? [] : [{ id: 'spice', type: 'spice', x: 400, y: 500, name: 'Possible spice' }]),
          { id: 'active-spice', type: 'spice_active', x: 600, y: 500, name: 'Active spice' },
        ],
      },
    });
  });
  await page.goto('/map');
  await expect(page.getByRole('checkbox', { name: 'Player', exact: true })).toBeChecked();
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
  await expect
    .poll(() =>
      page
        .getByRole('img', { name: 'Hagga Basin' })
        .evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0),
    )
    .toBe(true);
  await expect
    .poll(async () => (await page.getByRole('img', { name: 'Hagga Basin' }).boundingBox())?.width ?? 0)
    .toBeGreaterThan(350);
  await expect(page.locator('button.live-map-marker').first()).toBeVisible();
  await expect
    .poll(() => mapRequests.some((url) => new URL(url).searchParams.get('static') === '0'), { timeout: 7000 })
    .toBe(true);
  await expect(page.locator('button.marker-spice')).toHaveCount(1);
  await page.getByRole('button', { name: 'Refresh', exact: true }).click();
  await expect(page.getByRole('img', { name: 'Hagga Basin' })).toBeVisible();
  await page.screenshot({ path: 'test-results/map-desktop.png', fullPage: true });
  await expect(page).toHaveURL(/\/portal$/);
  await expect(page.getByRole('link', { name: 'Hagga Basin', exact: true })).toHaveAttribute('aria-current', 'page');
  const desertLinks = page.locator('nav a').filter({ hasText: /Hagga Basin|Deep Desert/ });
  expect(await desertLinks.evaluateAll((links) => links.map((link) => link.getAttribute('aria-label')))).toEqual([
    'Hagga Basin',
    'Deep Desert',
  ]);
  await page.getByRole('link', { name: 'Deep Desert', exact: true }).click();
  await expect(page.getByRole('link', { name: 'Deep Desert', exact: true })).toHaveAttribute('aria-current', 'page');
  await expect(page.getByTitle('Hide Storage', { exact: true })).toHaveCount(1);
  await expect(page).toHaveURL(/\/portal$/);
  const terrainAsset = await page.request.get('/maps/terrain/layout-0.json.gz');
  expect(terrainAsset.ok()).toBe(true);
  expect((await terrainAsset.body()).byteLength).toBeGreaterThan(100);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect
    .poll(() =>
      page
        .locator('img[src$="/maps/deep-desert.png"]')
        .evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0),
    )
    .toBe(true);
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
  await expect(page.getByRole('heading', { name: 'Make Arrakis yours.' })).toBeVisible();
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
      JSON.stringify({ instances: [{ instance_id: 1, building_type: 'Foundation', x: 0, y: 0, z: 0, rotation: 0 }] }),
    ),
  });
  await expect(page.getByText('1 building pieces · 0 placeables')).toBeVisible();
  const action = page.getByRole('button', { name: 'Import to my character', exact: true });
  await action.click();
  await expect(page.getByRole('status')).toContainText('Import could not be confirmed');
  await expect(page.getByText('fixture-private-provider-error')).toHaveCount(0);
  expect(requests).toHaveLength(1);
  await action.click();
  await expect(page.getByRole('status')).toContainText('Blueprint delivered');
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
