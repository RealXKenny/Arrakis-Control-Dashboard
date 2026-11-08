import { test, expect } from '../helpers/browser-test';
import { player, version } from '../helpers/portal-browser';

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
  // The navigation scrolls away with the page instead of staying pinned.
  await expect(topbar).toHaveCSS('position', 'static');
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
