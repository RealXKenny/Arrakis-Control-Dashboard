import { test, expect } from '../helpers/browser-test';
import { fakeConsole } from '../helpers/fake-console-client';
test.afterEach(async () => {
  await fakeConsole.reset();
});

test('solo members watch, alert, budget and track searches from a market tile at 320px', async ({ page }) => {
  const member = await fakeConsole.newMember('Solo shopper', {
    details: { 'solaris-coin': { total: '9007199254740993' } },
  });
  await page.context().setExtraHTTPHeaders({ Cookie: member.cookie });
  await page.setViewportSize({ width: 320, height: 700 });

  await page.goto('/market?q=Spice');
  await page.getByRole('link', { name: 'Plan Spice: watch, alert or add to basket' }).click();
  await expect(page.getByRole('heading', { name: 'Market planner', exact: true })).toBeVisible();
  await expect(page.getByRole('list', { name: 'Recent searches' })).toContainText('Spice');

  const watch = page.getByRole('form', { name: 'Add a watch' });
  await expect(watch.getByLabel('Template ID')).toHaveValue('spice');
  await watch.getByLabel('Alert at or below').fill('9007199254740993');
  await watch.getByRole('button', { name: 'Watch item' }).click();
  await expect(page.getByText('Watch saved.')).toBeVisible();

  const basket = page.getByRole('form', { name: 'Add to basket' });
  await basket.getByLabel('Quantity').fill('2');
  await basket.getByRole('button', { name: 'Add to basket' }).click();
  await expect(page.getByText('Added to your shopping basket.')).toBeVisible();

  await page.getByRole('button', { name: 'Check listings' }).click();
  await expect(page.getByRole('list', { name: 'New price alerts' })).toContainText('At or below your low threshold');
  await expect(page.getByRole('list', { name: 'Watched items' })).toContainText('9,007,199,254,740,993');
  await expect(page.getByRole('list', { name: 'Shopping basket' })).toContainText('18,014,398,509,481,986');
  const budget = page.getByLabel('Budget comparison');
  await expect(budget).toContainText('Over by 9,007,199,254,740,993');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);

  // A second check inside the cooldown does not repeat the alert.
  await page.getByRole('button', { name: 'Check listings' }).click();
  await expect(page.getByText(/Listings checked/)).toBeVisible();
  await expect(page.getByRole('list', { name: 'New price alerts' })).toHaveCount(0);

  await page.getByRole('button', { name: 'Show market activity' }).click();
  await expect(page.getByText('This Console does not provide completed-order history.')).toBeVisible();

  await page.reload();
  await expect(page.getByRole('list', { name: 'Watched items' })).toContainText('Not checked yet');
  await page.getByRole('button', { name: 'Clear search history' }).click();
  await expect(page.getByText('Search history cleared.')).toBeVisible();

  const requests = await fakeConsole.requests();
  const market = requests.filter(
    (entry) => entry.path.startsWith('/api/exchange') || entry.path.startsWith('/api/players/'),
  );
  expect(market.length).toBeGreaterThan(0);
  expect(market.every((entry) => entry.method === 'GET')).toBe(true);
});

test('the planner API never sends seller identities to the browser', async ({ page }) => {
  const member = await fakeConsole.newMember('Seller check');
  await page.context().setExtraHTTPHeaders({ Cookie: member.cookie });
  await page.goto('/market/planner?templateId=spice&name=Spice');
  const watch = page.getByRole('form', { name: 'Add a watch' });
  await watch.getByLabel('Alert at or above').fill('1');
  await watch.getByRole('button', { name: 'Watch item' }).click();
  await expect(page.getByText('Watch saved.')).toBeVisible();
  const response = await page.request.get('/api/v2/market/planner/readings');
  expect(response.status()).toBe(200);
  const text = await response.text();
  expect(text).not.toContain('seller-secret-1');
  expect(text).not.toContain('Guild trader');
});
