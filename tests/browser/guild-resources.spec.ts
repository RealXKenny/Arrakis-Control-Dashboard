import { expect, test } from '../helpers/browser-test';
import { fakeConsole } from '../helpers/fake-console-client';

test.afterEach(async () => {
  await fakeConsole.reset();
});
test('members request materials, pledge quantities and confirm delivered resources separately', async ({
  page,
  context,
}) => {
  const requester = await fakeConsole.newMember('Resource Requester', { guild: { id: '2', role: 1 } });
  const supplier = await fakeConsole.newMember('Steel Supplier', { guild: { id: '2', role: 1 } });
  await context.setExtraHTTPHeaders({ Cookie: requester.cookie });
  await page.goto('/guild');
  await page
    .getByRole('navigation', { name: 'Guild sections' })
    .getByRole('link', { name: 'Resources', exact: true })
    .click();
  await expect(page).toHaveURL(/tab=resources/);
  const tracker = page.getByRole('region', { name: 'Guild resource requests', exact: true });
  await tracker.getByRole('button', { name: 'New resource request', exact: true }).click();
  await tracker.getByLabel('Material', { exact: true }).fill('Steel ingots');
  await tracker.getByLabel(/^Requested quantity/).fill('100');
  await tracker.getByLabel('Unit', { exact: true }).fill('ingots');
  await tracker.getByLabel('Drop-off point').fill('South base storage');
  await tracker.getByLabel('Request details').fill('Leave resources in the marked container.');
  await tracker.getByRole('button', { name: 'Save resource request', exact: true }).click();
  const request = tracker.getByRole('article', { name: 'Steel ingots', exact: true });
  await expect(request).toBeVisible();
  await expect(request.getByRole('button', { name: 'Edit request', exact: true })).toBeVisible();
  await expect(request.getByRole('button', { name: 'Volunteer to supply', exact: true })).toHaveCount(0);

  await context.setExtraHTTPHeaders({ Cookie: supplier.cookie });
  await page.goto('/guild?tab=resources');
  await expect(request.getByRole('button', { name: 'Edit request', exact: true })).toHaveCount(0);
  await request.getByLabel('Quantity to supply').fill('50');
  await request.getByRole('button', { name: 'Volunteer to supply', exact: true }).click();
  await expect(request.getByRole('button', { name: 'Update my pledge', exact: true })).toBeVisible();
  await request.getByLabel('Quantity to supply').fill('40');
  await request.getByRole('button', { name: 'Update my pledge', exact: true }).click();
  await request.getByRole('button', { name: 'Withdraw my pledge', exact: true }).click();
  await expect(request.getByRole('button', { name: 'Withdraw my pledge', exact: true })).toHaveCount(0);
  await request.getByRole('button', { name: 'Volunteer to supply', exact: true }).click();
  const view = await (await page.request.get('/api/v2/guilds/2/resource-requests')).json();
  const record = view.data.requests.find((entry) => entry.material === 'Steel ingots');
  expect(JSON.stringify(view)).not.toMatch(/requesterId|supplierId|confirmedById/);
  const denied = await page.evaluate(
    async (input) =>
      (
        await fetch('/api/v2/guilds/2/resource-requests', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(input),
        })
      ).status,
    { action: 'cancel', id: record.id, revision: record.revision },
  );
  expect(denied).toBe(403);
  await request.getByRole('button', { name: 'Report delivery', exact: true }).click();
  await tracker.getByRole('button', { name: 'Confirm change', exact: true }).click();
  await expect(request.getByText('Your delivery is awaiting confirmation.', { exact: false })).toBeVisible();
  await expect(request.getByText('0 / 100 ingots', { exact: true })).toBeVisible();

  await context.setExtraHTTPHeaders({ Cookie: requester.cookie });
  await page.goto('/guild?tab=resources');
  await request.getByText('Pledges and deliveries (1)', { exact: true }).click();
  await request.getByRole('button', { name: 'Confirm receipt from Steel Supplier', exact: true }).click();
  await tracker.getByRole('button', { name: 'Confirm change', exact: true }).click();
  await expect(request.getByText('40 / 100 ingots', { exact: true }).first()).toBeVisible();
  await context.setExtraHTTPHeaders({ Cookie: supplier.cookie });
  await page.goto('/guild?tab=resources');
  await request.getByLabel('Quantity to supply').fill('60');
  await request.getByRole('button', { name: 'Volunteer to supply', exact: true }).click();
  await request.getByRole('button', { name: 'Report delivery', exact: true }).click();
  await tracker.getByRole('button', { name: 'Confirm change', exact: true }).click();
  await context.setExtraHTTPHeaders({ Cookie: requester.cookie });
  await page.goto('/guild?tab=resources');
  await request.getByText('Pledges and deliveries (2)', { exact: true }).click();
  await request.getByRole('button', { name: 'Confirm receipt from Steel Supplier', exact: true }).click();
  await tracker.getByRole('button', { name: 'Confirm change', exact: true }).click();
  await expect(tracker.getByRole('button', { name: 'Completed and cancelled', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(request.getByText('normal · fulfilled', { exact: true })).toBeVisible();
  await expect(request.getByRole('button', { name: 'Edit request', exact: true })).toHaveCount(0);
  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  await tracker.screenshot({ path: test.info().outputPath('resource-requests-phone.png') });
  await request.getByRole('button', { name: 'Remove request', exact: true }).click();
  await tracker.getByRole('button', { name: 'Confirm change', exact: true }).click();
  await expect(request).toHaveCount(0);
});

test('failed saves and refreshes retain request drafts and large exact quantities on phones', async ({
  page,
  context,
}) => {
  const leader = await fakeConsole.newMember('Resource Leader', { guild: { id: '2', role: 100 } });
  await context.setExtraHTTPHeaders({ Cookie: leader.cookie });
  await page.setViewportSize({ width: 320, height: 844 });
  await page.goto('/guild?tab=resources');
  const tracker = page.getByRole('region', { name: 'Guild resource requests', exact: true });
  const tabs = page.getByRole('navigation', { name: 'Guild sections', exact: true });
  await expect(tabs).toHaveCSS('grid-template-columns', /^\d+(\.\d+)?px \d+(\.\d+)?px$/);
  await tracker.getByRole('button', { name: 'New resource request', exact: true }).click();
  await tracker.getByLabel('Material', { exact: true }).fill('Titanium');
  await tracker.getByLabel(/^Requested quantity/).fill('900719925474099312');
  await tracker.getByLabel('Drop-off point').fill('North base');
  let sends = 0;
  await page.route('**/api/v2/guilds/2/resource-requests', (route) => {
    if (route.request().method() !== 'POST') return route.continue();
    sends++;
    return route.fulfill({
      status: 409,
      json: { ok: false, error: 'This request changed. Refresh before trying again. Your draft is kept.' },
    });
  });
  await tracker.getByRole('button', { name: 'Save resource request', exact: true }).click();
  await expect(tracker.getByRole('alert')).toContainText('Your draft is kept');
  expect(sends).toBe(1);
  await page.unroute('**/api/v2/guilds/2/resource-requests');
  await page.route('**/api/v2/guilds/2/resource-requests', (route) =>
    route.fulfill({ status: 503, json: { ok: false, error: 'Verification is unavailable.' } }),
  );
  await tracker.getByRole('button', { name: 'Refresh requests', exact: true }).click();
  await expect(tracker.getByRole('alert')).toContainText('Verification is unavailable');
  await page.unroute('**/api/v2/guilds/2/resource-requests');
  await tracker.getByRole('button', { name: 'Refresh requests', exact: true }).click();
  await expect(tracker.getByLabel(/^Requested quantity/)).toHaveValue('900719925474099312');
  await expect(tracker.getByLabel('Material', { exact: true })).toHaveValue('Titanium');
  await tracker.getByRole('button', { name: 'Save resource request', exact: true }).click();
  const request = tracker.getByRole('article', { name: 'Titanium', exact: true });
  await expect(request).toBeVisible();
  const payload = await (await page.request.get('/api/v2/guilds/2/resource-requests')).json();
  expect(payload.data.requests.find((entry) => entry.material === 'Titanium').quantity).toBe('900719925474099312');
  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  await request.getByRole('button', { name: 'Cancel request', exact: true }).click();
  await tracker.getByRole('button', { name: 'Confirm change', exact: true }).click();
  await expect(request.getByText('normal · cancelled', { exact: true })).toBeVisible();
  await request.getByRole('button', { name: 'Remove request', exact: true }).click();
  await tracker.getByRole('button', { name: 'Confirm change', exact: true }).click();
});
