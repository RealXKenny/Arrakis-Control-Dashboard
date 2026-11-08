import { test, expect } from '../helpers/browser-test';
import '../helpers/portal-browser';

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
