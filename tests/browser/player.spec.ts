import { test, expect } from '../helpers/browser-test';
import { player } from '../helpers/portal-browser';

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
