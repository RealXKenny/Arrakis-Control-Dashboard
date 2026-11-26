import { test, expect } from '../helpers/browser-test';
import { fakeConsole } from '../helpers/fake-console-client';
test.afterEach(async () => {
  await fakeConsole.reset();
});

const roster = { supported: true, entries: [{ playerId: '7654422', canonical: true, rank: 1 }] };
async function pilot() {
  return fakeConsole.newMember('Fleet pilot', {
    linked: { pawnId: '7654421', controllerId: '7654422' },
    details: {
      vehicles: {
        rows: [
          {
            id: '901',
            name: 'Dusty',
            type: 'Ornithopter',
            owner_name: 'Fleet pilot',
            relationship: 'Owner',
            fuel_percent: 12,
            condition_percent: 30,
            map: 'HaggaBasin',
            partition_id: 1,
            x: 1000,
            y: 2000,
            lifecycle_state: 'Default',
            modules: [
              { name: 'Engine', templateId: 'Engine', conditionPercent: 30 },
              { name: 'Hull', templateId: 'Hull', conditionPercent: null },
            ],
          },
          {
            id: '902',
            name: 'Stowed',
            type: 'Sandbike',
            owner_name: 'Fleet pilot',
            relationship: 'Owner',
            fuel_percent: null,
            condition_percent: 95,
            map: 'HaggaBasin',
            partition_id: null,
            x: 5,
            y: 5,
            lifecycle_state: 'VehicleRecovery',
            stored_at: '2026-11-20T00:00:00Z',
            modules: [{ name: 'Engine', templateId: 'Engine', conditionPercent: 95 }],
          },
          { id: '903', name: 'Not mine', relationship: 'Associate', owner_name: 'Someone' },
        ],
      },
    },
  });
}

test('fleet tools rank maintenance, keep unknowns explicit and save private labels and manifests', async ({ page }) => {
  const member = await pilot();
  await fakeConsole.setShared({
    finderSources: {
      '/api/vehicles/901/permissions': roster,
      '/api/vehicles/902/permissions': roster,
      '/api/vehicles/903/permissions': { supported: true, entries: [{ playerId: '1', canonical: true, rank: 1 }] },
      '/api/vehicles/901/storage': {
        supported: true,
        maxSlots: 20,
        usedSlots: 1,
        slots: [{ templateId: 'Water', name: 'Water', quantity: 3 }],
      },
    },
  });
  await page.context().setExtraHTTPHeaders({ Cookie: member.cookie });
  await page.setViewportSize({ width: 320, height: 800 });
  await page.goto('/vehicles');
  await page.getByRole('button', { name: 'Check fleet' }).click();
  await expect(page.getByText('2 verified vehicle(s)')).toBeVisible();
  await expect(page.getByText('1 listed vehicle(s) could not be verified')).toBeVisible();
  const inbox = page.getByRole('region', { name: 'Maintenance inbox' });
  await expect(inbox.getByRole('listitem').first()).toContainText('Dusty');
  await expect(inbox.getByRole('listitem').first()).toContainText('Urgent');
  await expect(inbox).toContainText('Fuel reading unknown');
  const locator = page.getByRole('region', { name: 'Vehicle locator and labels' });
  await expect(locator).toContainText('last observed at 1000, 2000');
  await expect(locator).toContainText('Stored for recovery');
  await expect(locator).not.toContainText('5, 5');
  await locator.getByRole('button', { name: 'Add label' }).first().click();
  await page.getByLabel('Private nickname').fill('Old faithful');
  await page.getByRole('button', { name: 'Save label' }).click();
  await expect(page.getByText('Label saved.')).toBeVisible();
  await expect(locator).toContainText('Old faithful (Dusty)');

  const planner = page.getByRole('region', { name: 'Trip cargo planner' });
  await planner.getByRole('button', { name: 'New manifest' }).click();
  await expect(page.getByText('Manifest created.')).toBeVisible();
  await planner.getByLabel('Item template ID').fill('Water');
  await planner.getByLabel('Quantity').fill('9007199254740993');
  await planner.getByRole('button', { name: 'Add item' }).click();
  await expect(page.getByText('Manifest saved.')).toBeVisible();
  await planner.getByLabel('Vehicle cargo to compare').selectOption('901');
  await planner.getByRole('button', { name: 'Check cargo' }).click();
  await expect(planner).toContainText('Water: 3 of 9007199254740993 (need 9007199254740990 more)');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);

  await page.reload();
  await page.getByRole('button', { name: 'Check fleet' }).click();
  await expect(page.getByRole('region', { name: 'Vehicle locator and labels' })).toContainText('Old faithful');
  const calls = await fakeConsole.requests();
  expect(calls.some((entry) => entry.path.includes('/903/storage'))).toBe(false);
  expect(
    calls.filter((entry) => entry.path.startsWith('/api/vehicles/')).every((entry) => entry.method === 'GET'),
  ).toBe(true);
});

test('expeditions save bookmarks, routes and journal notes, and publish then end a rescue card', async ({ page }) => {
  const member = await pilot();
  await page.context().setExtraHTTPHeaders({ Cookie: member.cookie });
  await page.goto('/expeditions');
  const bookmarks = page.getByRole('region', { name: 'Map bookmarks' });
  for (const [name, x, y] of [
    ['Gate', '0', '0'],
    ['Wreck', '300000', '400000'],
  ]) {
    await bookmarks.getByLabel(/^Map/).selectOption('DeepDesert');
    await bookmarks.getByLabel(/^X coordinate/).fill(x);
    await bookmarks.getByLabel(/^Y coordinate/).fill(y);
    await bookmarks.getByLabel(/^Name/).fill(name);
    await bookmarks.getByRole('button', { name: 'Save bookmark' }).click();
    await expect(page.getByText('Bookmark saved.')).toBeVisible();
  }
  await expect(bookmarks).toContainText('Deep Desert');

  const routes = page.getByRole('region', { name: 'Exploration routes' });
  await routes.getByLabel(/^Route name/).fill('Salvage run');
  await routes.getByLabel(/^Map/).selectOption('DeepDesert');
  await routes.getByLabel(/^Add waypoint/).selectOption({ label: 'Gate' });
  await routes.getByLabel(/^Add waypoint/).selectOption({ label: 'Wreck' });
  await routes.getByRole('button', { name: 'Save route' }).click();
  await expect(routes).toContainText('≈ 5.00 km straight-line estimate');

  const journal = page.getByRole('region', { name: 'Scouting journal' });
  await journal.getByLabel(/^Title/).fill('Spice field');
  await journal.getByLabel(/^Observation/).fill('Large field after the storm.');
  await journal.getByRole('button', { name: 'Save entry' }).click();
  await expect(journal).toContainText('Last checked');

  const departure = page.getByRole('region', { name: 'Deep Desert departure checklist' });
  await departure.getByLabel(/^Route/).selectOption({ label: 'Salvage run' });
  await expect(page.getByText('Departure plan saved.')).toBeVisible();
  await expect(departure).toContainText('5.00 km straight-line planning estimate');
  await expect(departure).toContainText('Coriolis cycle');

  const rescue = page.getByRole('region', { name: 'Rescue request card' });
  await rescue.getByLabel(/^Call sign/).fill('Fleet pilot');
  await rescue.getByLabel(/^Use a saved bookmark \(optional\)/).selectOption({ label: 'Wreck (Deep Desert)' });
  await rescue.getByLabel(/^Fuel/).check();
  await rescue.getByRole('button', { name: 'Review card' }).click();
  await expect(rescue.getByRole('button', { name: 'Publish rescue request' })).toBeDisabled();
  await rescue.getByLabel(/I want to share this location/).check();
  await rescue.getByRole('button', { name: 'Publish rescue request' }).click();
  await expect(page.getByText('Rescue request published.')).toBeVisible();
  const link = await rescue.getByLabel(/^Member link/).inputValue();
  const path = new URL(link).pathname;

  const helper = await fakeConsole.newMember('Helper');
  await page.context().setExtraHTTPHeaders({ Cookie: helper.cookie });
  await page.goto(path);
  await expect(page.getByRole('article', { name: 'Rescue request' })).toContainText('Fleet pilot');
  await expect(page.getByRole('article', { name: 'Rescue request' })).toContainText('Needs: Fuel');

  await page.context().setExtraHTTPHeaders({ Cookie: member.cookie });
  await page.goto('/expeditions');
  await page.getByRole('button', { name: 'End rescue request' }).click();
  await expect(page.getByText('Rescue request ended.')).toBeVisible();
  await page.context().setExtraHTTPHeaders({ Cookie: helper.cookie });
  await page.goto(path);
  await expect(page.getByText('This rescue request has ended')).toBeVisible();

  const other = await fakeConsole.newMember('Other explorer');
  await page.context().setExtraHTTPHeaders({ Cookie: other.cookie });
  await page.goto('/expeditions');
  await expect(page.getByText('No bookmarks yet.')).toBeVisible();
});
