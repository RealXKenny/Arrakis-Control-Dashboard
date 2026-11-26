import { test, expect } from '../helpers/browser-test';
import { fakeConsole } from '../helpers/fake-console-client';

test.afterEach(async () => {
  await fakeConsole.reset();
});

const reading = {
  startedAt: '2026-11-11T04:00:00Z',
  limited: true,
  items: [
    {
      id: 'one',
      name: 'Spice Melange',
      quantity: '9007199254740993',
      grade: '3',
      durability: 'Unknown / Unknown',
      augments: ['Harvest (grade 2)'],
      location: 'Base Home #11 · Supplies #33 · inventory 44 · slot 0',
      href: '/holdings',
    },
  ],
  sources: [
    {
      name: 'Vehicle Scout #22',
      status: 'unavailable',
      detail: 'Unsupported, inaccessible or failed source; no items counted.',
      checkedAt: '2026-11-11T04:00:01Z',
    },
  ],
};

test('finder shows exact results and partial coverage on narrow screens', async ({ page }) => {
  await page.context().setExtraHTTPHeaders({ Cookie: '__Host-dashboard_session=browser-member-session' });
  await page.route('**/api/v2/items/find?*', (route) => route.fulfill({ json: reading }));
  await page.setViewportSize({ width: 320, height: 700 });
  await page.goto('/storage');
  await page.getByRole('searchbox', { name: 'Find across your assets' }).fill('spice');
  await page.getByRole('button', { name: 'Find items' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'matching stacks' })).toContainText('partial results');
  await expect(page.getByRole('list', { name: 'Item finder results' })).toContainText('9007199254740993');
  await expect(page.getByRole('list', { name: 'Item finder results' })).toContainText('inventory 44 · slot 0');
  await expect(page.getByRole('list', { name: 'Item finder sources' })).toContainText('unavailable');
  await expect(page.getByRole('link', { name: 'Open source workspace' })).toHaveAttribute('href', '/holdings');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('finder supports empty, error and cancellation without stale results', async ({ page }) => {
  await page.context().setExtraHTTPHeaders({ Cookie: '__Host-dashboard_session=browser-member-session' });
  let mode = 'empty';
  await page.route('**/api/v2/items/find?*', async (route) => {
    if (mode === 'pending') return;
    if (mode === 'error') return route.fulfill({ status: 429, json: { error: 'Search capacity reached.' } });
    return route.fulfill({ json: { ...reading, items: [], sources: [], limited: false } });
  });
  await page.goto('/storage');
  await page.getByRole('searchbox', { name: 'Find across your assets' }).fill('missing');
  await page.getByRole('button', { name: 'Find items' }).click();
  await expect(page.getByText('No matches in successfully checked sources.')).toBeVisible();
  mode = 'error';
  await page.getByRole('button', { name: 'Find items' }).click();
  await expect(page.getByText('Search capacity reached.')).toBeVisible();
  mode = 'pending';
  await page.getByRole('button', { name: 'Find items' }).click();
  await page.getByRole('button', { name: 'Cancel search' }).click();
  await expect(page.getByText('Search cancelled. No results retained.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Find items' })).toBeEnabled();
});

test('finder reads all three real fixture sources for a solo character and excludes restricted containers', async ({
  page,
}) => {
  const member = await fakeConsole.newMember('Solo finder', {
    linked: { pawnId: '7654321', controllerId: '7654322' },
    details: {
      bases: { rows: [{ id: '811', name: 'Solo home' }] },
      vehicles: { rows: [{ id: '822', name: 'Solo scout' }] },
    },
  });
  const roster = { supported: true, entries: [{ playerId: '7654322', canonical: true, rank: 2 }] };
  const slot = { itemId: '7', name: 'Spice Melange', quantity: 12, qualityLevel: 3, positionIndex: 0 };
  await fakeConsole.setShared({
    finderSources: {
      '/api/bases/811/permissions': roster,
      '/api/bases/811/child-access': {
        supported: true,
        rows: [
          { actorId: '833', currentAccess: 2 },
          { actorId: '834', currentAccess: 1 },
        ],
      },
      '/api/bases/811/inventory': {
        supported: true,
        containers: [
          { placeableId: '833', name: 'Supplies' },
          { placeableId: '834', name: 'Secret' },
        ],
      },
      '/api/bases/811/containers/833': { supported: true, inventories: [{ inventoryId: '844', slots: [slot] }] },
      '/api/vehicles/822/permissions': roster,
      '/api/vehicles/822/storage': { supported: true, inventoryId: '855', slots: [slot] },
    },
  });
  await page.context().setExtraHTTPHeaders({ Cookie: member.cookie });
  await page.goto('/storage');
  await page.getByRole('searchbox', { name: 'Find across your assets' }).fill('Spice');
  await page.getByRole('button', { name: 'Find items' }).click();
  const results = page.getByRole('list', { name: 'Item finder results' });
  await expect(results.getByRole('listitem')).toHaveCount(3);
  await expect(results).toContainText('Backpack');
  await expect(results).toContainText('Supplies #833 · inventory 844 · slot 0');
  await expect(results).toContainText('Solo scout #822 · inventory 855 · slot 0');
  await expect(results).not.toContainText('Secret');
  await results.getByRole('link', { name: 'Open source workspace' }).nth(1).click();
  await expect(page).toHaveURL(/\/holdings\?view=shared#base-811$/);
  await expect(page.locator('#base-811')).toBeVisible();
  const calls = await fakeConsole.requests();
  expect(calls.some((entry) => entry.path.includes('/containers/834'))).toBe(false);
  expect(
    calls
      .filter((entry) => entry.path.includes('/storage') || entry.path.includes('/containers/833'))
      .every((entry) => entry.method === 'GET'),
  ).toBe(true);
});
