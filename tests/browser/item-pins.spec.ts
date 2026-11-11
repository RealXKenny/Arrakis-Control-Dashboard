import { test, expect } from '../helpers/browser-test';
import { fakeConsole } from '../helpers/fake-console-client';
test.afterEach(async () => {
  await fakeConsole.reset();
});

async function memberWithSpice() {
  return fakeConsole.newMember('Solo counter', {
    details: {
      bases: { rows: [] },
      vehicles: { rows: [] },
      inventory: {
        rows: [
          {
            id: 'one',
            item_name: 'Spice Melange',
            template_id: 'Spice_Template',
            inventory_type: 0,
            stack_size: '9007199254740993',
            quality_level: 1,
          },
          {
            id: 'two',
            item_name: 'Spice Melange',
            template_id: 'Spice_Template',
            inventory_type: 0,
            stack_size: '7',
            quality_level: 2,
          },
        ],
      },
    },
  });
}

test('solo members pin real finder results, persist private selections and read exact quantities at 320px', async ({
  page,
}) => {
  const member = await memberWithSpice();
  await page.context().setExtraHTTPHeaders({ Cookie: member.cookie });
  await page.setViewportSize({ width: 320, height: 700 });
  await page.goto('/storage');
  await expect(page.getByText('No pinned items.')).toBeVisible();
  await page.getByRole('searchbox', { name: 'Find across your assets' }).fill('Spice');
  await page.getByRole('button', { name: 'Find items' }).click();
  await page.getByRole('button', { name: 'Pin Spice Melange', exact: true }).first().click();
  await expect(page.getByText('Pinned items saved.')).toBeVisible();
  await page.getByRole('button', { name: 'Refresh counts', exact: true }).click();
  const counters = page.getByRole('list', { name: 'Pinned item counters' });
  await expect(counters).toContainText('9007199254741000');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.reload();
  await expect(counters).toContainText('Not checked');
  await expect(counters).not.toContainText('9007199254741000');
  await page.getByRole('button', { name: 'Unpin Spice Melange', exact: true }).click();
  await expect(page.getByText('No pinned items.')).toBeVisible();
  await page.reload();
  await expect(page.getByText('No pinned items.')).toBeVisible();
  const requests = await fakeConsole.requests();
  expect(
    requests.filter((entry) => entry.path.startsWith('/api/players/')).every((entry) => entry.method === 'GET'),
  ).toBe(true);
});

test('pins remain private across accounts and changed linked characters', async ({ page }) => {
  const member = await memberWithSpice();
  await page.context().setExtraHTTPHeaders({ Cookie: member.cookie });
  await page.goto('/storage');
  await expect(page.getByText('No pinned items.')).toBeVisible();
  await page.getByRole('searchbox', { name: 'Find across your assets' }).fill('Spice');
  await page.getByRole('button', { name: 'Find items' }).click();
  await page.getByRole('button', { name: 'Pin Spice Melange', exact: true }).first().click();
  await expect(page.getByRole('button', { name: 'Unpin Spice Melange', exact: true })).toBeVisible();
  const other = await fakeConsole.newMember('Other solo');
  await page.context().setExtraHTTPHeaders({ Cookie: other.cookie });
  await page.reload();
  await expect(page.getByText('No pinned items.')).toBeVisible();
  await page.request.post('http://127.0.0.1:3101/__fixture/user', {
    data: {
      discordId: member.discordId,
      name: 'Changed character',
      patch: { linked: { pawnId: '9876541' } },
    },
  });
  await page.context().setExtraHTTPHeaders({ Cookie: member.cookie });
  await page.reload();
  await expect(page.getByText('No pinned items.')).toBeVisible();
});

test('counter partial zeros, failed saves and cancellation stay honest without automatic retries', async ({ page }) => {
  const member = await memberWithSpice();
  await page.context().setExtraHTTPHeaders({ Cookie: member.cookie });
  await page.goto('/storage');
  await expect(page.getByText('No pinned items.')).toBeVisible();
  await page.getByRole('searchbox', { name: 'Find across your assets' }).fill('Spice');
  await page.getByRole('button', { name: 'Find items' }).click();
  await page.getByRole('button', { name: 'Pin Spice Melange', exact: true }).first().click();
  await expect(page.getByText('Pinned items saved.')).toBeVisible();
  let saves = 0;
  await page.route('**/api/v2/items/pins', (route) => {
    if (route.request().method() !== 'POST') return route.continue();
    saves++;
    return route.fulfill({ status: 409, json: { error: 'Pinned items changed. Refresh before trying again.' } });
  });
  await page.getByRole('button', { name: 'Unpin Spice Melange', exact: true }).click();
  await expect(page.getByText('Pinned items changed.')).toBeVisible();
  expect(saves).toBe(1);
  await expect(page.getByRole('list', { name: 'Pinned item counters' })).toContainText('Spice Melange');
  // Read the real saved revision; the following mocked observation exercises UI presentation only.
  const settings = await (await page.request.get('/api/v2/items/pins')).json();
  await page.route('**/api/v2/items/pins/readings', (route) =>
    route.fulfill({
      json: {
        revision: settings.revision,
        counters: [{ templateId: 'Spice_Template', name: 'Spice Melange', quantity: '0', complete: false }],
        coverage: {
          startedAt: '2026-11-11T04:00:00Z',
          limited: false,
          sources: [
            {
              name: 'Character inventory',
              status: 'unavailable',
              checkedAt: '2026-11-11T04:00:01Z',
              detail: 'Source failed; no items counted.',
            },
          ],
        },
      },
    }),
  );
  await page.getByRole('button', { name: 'Refresh counts', exact: true }).click();
  await expect(page.getByRole('list', { name: 'Pinned item counters' })).toContainText('Unknown (0 observed)');
  await expect(page.getByRole('list', { name: 'Counter source coverage' })).toContainText('unavailable');
  await page.route('**/api/v2/items/pins/readings', () => {});
  await page.getByRole('button', { name: 'Refresh counts', exact: true }).click();
  await page.getByRole('button', { name: 'Cancel count refresh', exact: true }).click();
  await expect(page.getByText('Count refresh cancelled.')).toBeVisible();
  await expect(page.getByRole('list', { name: 'Pinned item counters' })).toContainText('Unknown (0 observed)');
});
