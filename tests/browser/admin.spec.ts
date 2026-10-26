import { expect, test } from '@playwright/test';
import operations from '../../src/modules/admin/catalog.json';

test('ordinary members cannot load administration or execute privileged operations', async ({ browser }) => {
  const context = await browser.newContext();
  await context.setExtraHTTPHeaders({ Cookie: '__Host-dashboard_session=browser-member-session' });
  const page = await context.newPage();
  const response = await page.goto('/admin');
  expect(response?.status()).toBe(404);
  expect((await context.request.get('/api/admin/catalog')).status()).toBe(403);
  const execute = await context.request.post('/api/admin/execute', {
    headers: { Origin: 'http://127.0.0.1:3100' },
    data: { operation: 'get-server-status' },
  });
  expect(execute.status()).toBe(403);
  await context.close();
});

test('administrator can browse operations, read data, and review changes on desktop and mobile', async ({
  page,
  context,
}) => {
  await context.setExtraHTTPHeaders({ Cookie: '__Host-dashboard_session=browser-admin-session' });
  await page.route('**/api/admin/catalog', (route) =>
    route.fulfill({ json: { ok: true, operations, configured: true, consoleOrigin: 'https://console.test' } }),
  );
  const submitted: Record<string, unknown>[] = [];
  await page.route('**/api/admin/execute', async (route) => {
    submitted.push(route.request().postDataJSON());
    await route.fulfill({
      json: { ok: true, upstreamStatus: 200, data: { rows: [{ name: 'Example player', online: true }] } },
    });
  });
  await page.goto('/admin');
  await expect(page.getByRole('heading', { name: 'Your server. Under control.' })).toBeVisible();
  await page.getByRole('button', { name: 'Run read', exact: true }).click();
  await expect(page.getByRole('cell', { name: 'Example player' })).toBeVisible();
  expect(submitted[0].operation).toBe('get-server-status');
  await page.getByRole('searchbox', { name: 'Find an operation' }).fill('/api/server/restart');
  await page.getByRole('button', { name: /POST Restart all services/ }).click();
  const execute = page.getByRole('button', { name: 'Execute operation', exact: true });
  await expect(execute).toBeDisabled();
  await page.getByRole('textbox', { name: 'Confirm operation', exact: true }).fill('POST /api/server/restart');
  await expect(execute).toBeEnabled();
  // Selecting a write never submits it; the test deliberately does not execute server changes.
  expect(submitted).toHaveLength(1);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: 'test-results/admin-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: 'test-results/admin-mobile.png', fullPage: true });
  await page.getByRole('searchbox', { name: 'Find an operation' }).fill('/api/settings/api-keys');
  await page.getByRole('button', { name: /POST Create a key/ }).click();
  await expect(page.getByRole('status').filter({ hasText: /browser session/ })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Execute operation', exact: true })).toHaveCount(0);
});
