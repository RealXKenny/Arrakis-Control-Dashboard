import { expect, test } from '../helpers/browser-test';
import { fakeConsole } from '../helpers/fake-console-client';

test.afterEach(async () => {
  await fakeConsole.reset();
});

test('leaders maintain private locations and members can search without changing game access', async ({
  page,
  context,
}) => {
  const leader = await fakeConsole.newMember('Directory Leader', { guild: { id: '2', role: 100 } });
  const member = await fakeConsole.newMember('Directory Member', { guild: { id: '2', role: 1 } });
  await context.setExtraHTTPHeaders({ Cookie: leader.cookie });
  await page.goto('/guild');
  await page
    .getByRole('navigation', { name: 'Guild sections' })
    .getByRole('link', { name: 'Bases', exact: true })
    .click();
  await expect(page).toHaveURL(/tab=bases/);
  const directory = page.getByRole('region', { name: 'Guild base directory', exact: true });
  await directory.getByRole('button', { name: 'New base listing', exact: true }).click();
  await directory.getByLabel('Base name', { exact: true }).fill('South refinery');
  await directory.getByRole('combobox', { name: 'Purpose', exact: true }).selectOption('crafting');
  await directory.getByLabel('Location or grid reference').fill('Hagga south ridge');
  await directory.getByLabel('Contact person').fill('Quartermaster Ada');
  await directory.getByLabel('Access instructions').fill('Ask Ada before landing. Use the east door.');
  await directory.getByLabel('Directory notes').fill('<script>window.directoryInjected=true</script>');
  await directory.getByRole('button', { name: 'Save base listing', exact: true }).click();
  const listing = directory.getByRole('article', { name: 'South refinery', exact: true });
  await expect(listing).toBeVisible();
  await page.reload();
  await expect(listing.getByText('Quartermaster Ada', { exact: true })).toBeVisible();
  await expect(listing.getByText('<script>window.directoryInjected=true</script>', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => 'directoryInjected' in window)).toBe(false);

  await context.setExtraHTTPHeaders({ Cookie: member.cookie });
  await page.goto('/guild?tab=bases');
  await expect(listing).toBeVisible();
  await expect(directory.getByRole('button', { name: 'New base listing', exact: true })).toHaveCount(0);
  await expect(listing.getByRole('button', { name: 'Edit listing', exact: true })).toHaveCount(0);
  await directory.getByLabel('Search guild bases').fill('quartermaster');
  await expect(listing).toBeVisible();
  expect(page.url()).not.toContain('quartermaster');
  await directory.getByRole('combobox', { name: 'Filter by map', exact: true }).selectOption('deep-desert');
  await expect(listing).toHaveCount(0);
  await directory.getByRole('combobox', { name: 'Filter by map', exact: true }).selectOption('hagga-basin');
  await directory.getByRole('combobox', { name: 'Filter by purpose', exact: true }).selectOption('storage');
  await expect(listing).toHaveCount(0);
  await directory.getByRole('combobox', { name: 'Filter by purpose', exact: true }).selectOption('crafting');
  await expect(listing).toBeVisible();
  const view = await (await page.request.get('/api/v2/guilds/2/base-directory')).json();
  const record = view.data.entries.find((entry) => entry.name === 'South refinery');
  expect(JSON.stringify(view)).not.toMatch(/discordId|controllerId|pawnId|ownerId/);
  const denied = await page.evaluate(
    async (input) =>
      (
        await fetch('/api/v2/guilds/2/base-directory', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(input),
        })
      ).status,
    { action: 'status', id: record.id, revision: record.revision, status: 'archived' },
  );
  expect(denied).toBe(403);

  await context.setExtraHTTPHeaders({ Cookie: leader.cookie });
  await page.goto('/guild?tab=bases');
  await listing.getByRole('button', { name: 'Archive listing', exact: true }).click();
  await directory.getByRole('button', { name: 'Confirm change', exact: true }).click();
  await expect(directory.getByRole('button', { name: 'Archived listings', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await listing.getByRole('button', { name: 'Edit listing', exact: true }).click();
  await directory.getByLabel('Location or grid reference').fill('Hagga south ridge, second ramp');
  await directory.getByRole('button', { name: 'Save base listing', exact: true }).click();
  await expect(listing.getByText('Archived listing', { exact: false })).toBeVisible();
  await expect(listing.getByText('Hagga south ridge, second ramp', { exact: true })).toBeVisible();
  await listing.getByRole('button', { name: 'Restore listing', exact: true }).click();
  await directory.getByRole('button', { name: 'Confirm change', exact: true }).click();
  await expect(directory.getByRole('button', { name: 'Active listings', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  await directory.screenshot({ path: test.info().outputPath('shared-base-directory-phone.png') });
  await listing.getByRole('button', { name: 'Remove listing', exact: true }).click();
  await directory.getByRole('button', { name: 'Confirm change', exact: true }).click();
  await expect(listing).toHaveCount(0);
});

test('conflicts and verification failures retain directory drafts without retrying writes', async ({
  page,
  context,
}) => {
  const leader = await fakeConsole.newMember('Base Directory Editor', { guild: { id: '2', role: 100 } });
  await context.setExtraHTTPHeaders({ Cookie: leader.cookie });
  await page.setViewportSize({ width: 320, height: 844 });
  await page.goto('/guild?tab=bases');
  const directory = page.getByRole('region', { name: 'Guild base directory', exact: true });
  await expect(page.getByRole('navigation', { name: 'Guild sections' })).toHaveCSS(
    'grid-template-columns',
    /^\d+(\.\d+)?px \d+(\.\d+)?px$/,
  );
  await directory.getByRole('button', { name: 'New base listing', exact: true }).click();
  await directory.getByLabel('Base name', { exact: true }).fill('Desert staging');
  await directory.getByRole('combobox', { name: 'Map', exact: true }).selectOption('deep-desert');
  await directory.getByRole('combobox', { name: 'Purpose', exact: true }).selectOption('staging');
  await directory.getByLabel('Location or grid reference').fill('B4, north edge');
  await directory.getByLabel('Contact person').fill('Scout captain');
  await directory.getByLabel('Access instructions').fill('Confirm permissions before arrival.');
  let sends = 0;
  await page.route('**/api/v2/guilds/2/base-directory', (route) => {
    if (route.request().method() !== 'POST') return route.continue();
    sends++;
    return route.fulfill({ status: 409, json: { ok: false, error: 'This listing changed. Your draft is kept.' } });
  });
  await directory.getByRole('button', { name: 'Save base listing', exact: true }).click();
  await expect(directory.getByRole('alert')).toContainText('Your draft is kept');
  expect(sends).toBe(1);
  await page.unroute('**/api/v2/guilds/2/base-directory');
  await page.route('**/api/v2/guilds/2/base-directory', (route) =>
    route.fulfill({ status: 503, json: { ok: false, error: 'Verification is unavailable.' } }),
  );
  await directory.getByRole('button', { name: 'Refresh directory', exact: true }).click();
  await expect(directory.getByRole('alert')).toContainText('Verification is unavailable');
  await expect(directory.getByLabel('Base name', { exact: true })).toBeHidden();
  await page.unroute('**/api/v2/guilds/2/base-directory');
  await directory.getByRole('button', { name: 'Refresh directory', exact: true }).click();
  await expect(directory.getByLabel('Base name', { exact: true })).toHaveValue('Desert staging');
  await expect(directory.getByLabel('Location or grid reference')).toHaveValue('B4, north edge');
  await directory.getByRole('button', { name: 'Save base listing', exact: true }).click();
  const listing = directory.getByRole('article', { name: 'Desert staging', exact: true });
  await expect(listing.getByText('Deep Desert · Staging · active', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await listing.getByRole('button', { name: 'Remove listing', exact: true }).click();
  await directory.getByRole('button', { name: 'Confirm change', exact: true }).click();
  await expect(listing).toHaveCount(0);
});
