import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { test, expect } from '../helpers/browser-test';
import { fakeConsole } from '../helpers/fake-console-client';
test.use({ hasTouch: true });
test.afterEach(async () => {
  await fakeConsole.reset();
});
const axeSource = readFileSync(createRequire(import.meta.url).resolve('axe-core/axe.min.js'), 'utf8');
const palette = (page: import('@playwright/test').Page) => page.getByRole('dialog', { name: 'Command palette' });
async function setup(page: import('@playwright/test').Page) {
  const member = await fakeConsole.newMember('Command traveller', { guild: null });
  await page.context().setExtraHTTPHeaders({ Cookie: member.cookie });
  await page.goto('/portal');
  return member;
}
async function open(page: import('@playwright/test').Page) {
  await page.waitForFunction(() => document.documentElement.dataset.commandPalette === 'ready');
  await page.keyboard.press('Control+k');
  await expect(palette(page)).toBeVisible();
  return palette(page);
}
test('keyboard navigation filters authorized destinations, traps focus, restores focus and respects editors', async ({
  page,
}) => {
  await setup(page);
  await page.setViewportSize({ width: 1440, height: 1000 });
  const trigger = page.getByRole('button', { name: 'Open command palette', exact: true });
  await trigger.click();
  const dialog = palette(page);
  await expect(dialog.getByRole('searchbox')).toBeFocused();
  for (let i = 0; i < 45; i++) {
    await page.keyboard.press('Tab');
    expect(await dialog.evaluate((d) => d.contains(document.activeElement))).toBe(true);
  }
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await open(page);
  await dialog.getByRole('searchbox').fill('Personal tasks');
  await expect(dialog.getByRole('link')).toHaveCount(1);
  await page.keyboard.press('ArrowDown');
  await expect(dialog.getByRole('link')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/tasks$/);
  await expect(dialog).toHaveCount(0);
  await page.getByRole('button', { name: 'New entry', exact: true }).click();
  await page.getByLabel('Entry title').fill('Unsent plan');
  await page.keyboard.press('Control+k');
  await expect(dialog).toHaveCount(0);
  await expect(page.getByLabel('Entry title')).toHaveValue('Unsent plan');
});
test('members cannot see admin commands and anonymous visitors have no palette', async ({ page, browser }) => {
  await setup(page);
  const dialog = await open(page);
  await dialog.getByRole('searchbox').fill('administration');
  await expect(dialog.getByRole('link')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await page.context().setExtraHTTPHeaders({ Cookie: '__Host-dashboard_session=browser-admin-session' });
  await page.goto('/portal');
  await open(page);
  await dialog.getByRole('searchbox').fill('administration');
  await expect(dialog.getByRole('link', { name: /Administration/ })).toHaveAttribute('href', '/admin');
  const anonymous = await browser.newContext();
  try {
    const tab = await anonymous.newPage();
    await tab.goto('/');
    await tab.keyboard.press('Control+k');
    await expect(palette(tab)).toHaveCount(0);
    await expect(tab.getByRole('button', { name: 'Open command palette' })).toHaveCount(0);
    expect((await anonymous.request.get('http://127.0.0.1:3100/api/v2/commands/assets?q=home')).status()).toBe(401);
  } finally {
    await anonymous.close();
  }
});
test('asset lookup verifies live player-scoped permissions and opens only allowed base/vehicle and finder destinations', async ({
  page,
}) => {
  const member = await fakeConsole.newMember('Asset commands', {
    guild: null,
    linked: { pawnId: '7654321', controllerId: '7654322' },
    details: {
      bases: {
        rows: [
          { id: '811', name: 'Scout shelter' },
          { id: '812', name: 'Scout secret' },
        ],
      },
      vehicles: { rows: [{ id: '822', name: 'Scout rover' }] },
    },
  });
  const permission = { supported: true, entries: [{ playerId: '7654322', canonical: true, rank: 2 }] };
  await fakeConsole.setShared({
    finderSources: {
      '/api/bases/811/permissions': permission,
      '/api/bases/812/permissions': { supported: true, entries: [{ playerId: '999', canonical: true, rank: 1 }] },
      '/api/vehicles/822/permissions': permission,
    },
  });
  await page.context().setExtraHTTPHeaders({ Cookie: member.cookie });
  await page.goto('/portal');
  let reads = 0;
  let scans = 0;
  page.on('request', (r) => {
    if (r.url().includes('/api/v2/commands/assets?')) reads++;
    if (r.url().includes('/api/v2/items/find?')) scans++;
  });
  const dialog = await open(page);
  await dialog.getByRole('button', { name: 'Asset lookup', exact: true }).click();
  await dialog.getByRole('searchbox').fill('Scout');
  expect(reads).toBe(0);
  await dialog.getByRole('button', { name: 'Search bases and vehicles' }).click();
  await expect(dialog.getByRole('status')).toContainText('2 authorized assets');
  await expect(dialog.getByRole('link', { name: /Scout shelter/ })).toHaveAttribute(
    'href',
    '/holdings?view=shared#base-811',
  );
  await expect(dialog.getByRole('link', { name: /Scout rover/ })).toHaveAttribute(
    'href',
    '/vehicles?view=shared#vehicle-822',
  );
  await expect(dialog).not.toContainText('Scout secret');
  expect(reads).toBe(1);
  await dialog.getByRole('searchbox').focus();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/holdings\?view=shared#base-811$/);
  await open(page);
  await dialog.getByRole('button', { name: 'Asset lookup', exact: true }).click();
  await dialog.getByRole('searchbox').fill('Spice');
  await dialog.getByRole('link', { name: /^Find items: Spice/ }).click();
  await expect(page.getByRole('searchbox', { name: 'Find across your assets' })).toHaveValue('Spice');
  expect(scans).toBe(0);
  const calls = await fakeConsole.requests();
  expect(calls.filter((r) => r.method !== 'GET' && r.path !== '/api/integrations/discord/players/me')).toEqual([]);
});
test('changing query, cancellation, visibility and errors discard asset readings without retries', async ({ page }) => {
  await setup(page);
  const dialog = await open(page);
  await dialog.getByRole('button', { name: 'Asset lookup', exact: true }).click();
  let reads = 0;
  await page.route('**/api/v2/commands/assets?*', async (route) => {
    reads++;
    await route.fulfill({
      json: {
        checkedAt: new Date().toISOString(),
        partial: true,
        assets: [
          { id: '11', name: 'Temporary shelter', kind: 'base', access: 'owned', href: '/holdings?view=owned#base-11' },
        ],
      },
    });
  });
  await dialog.getByRole('searchbox').fill('shelter');
  await dialog.getByRole('button', { name: 'Search bases and vehicles' }).click();
  await expect(dialog).toContainText('Temporary shelter');
  await dialog.getByRole('searchbox').fill('different');
  await expect(dialog).not.toContainText('Temporary shelter');
  await page.unroute('**/api/v2/commands/assets?*');
  await page.route('**/api/v2/commands/assets?*', (route) => {
    reads++;
    return route.fulfill({ status: 503, json: { error: 'secret provider detail' } });
  });
  await dialog.getByRole('button', { name: 'Search bases and vehicles' }).click();
  await expect(dialog.getByRole('alert')).toContainText('could not be confirmed');
  await expect(dialog).not.toContainText('secret provider detail');
  expect(reads).toBe(2);
  await page.unroute('**/api/v2/commands/assets?*');
  await page.route('**/api/v2/commands/assets?*', () => {
    reads++;
  });
  await dialog.getByRole('button', { name: 'Search bases and vehicles' }).click();
  await dialog.getByRole('button', { name: 'Cancel lookup' }).click();
  await expect(dialog.getByRole('alert')).toContainText('cancelled');
  expect(reads).toBe(3);
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect(dialog).toHaveCount(0);
});
test('mobile menu opens the palette with accessible touch controls at release widths', async ({ page }, info) => {
  await setup(page);
  await page.setViewportSize({ width: 393, height: 852 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.getByRole('button', { name: 'Open menu', exact: true }).tap();
  await page.getByRole('button', { name: 'Search navigation and assets' }).tap();
  const dialog = palette(page);
  await expect(dialog).toBeVisible();
  await expect(page.getByRole('dialog', { name: 'Navigation', exact: true })).toHaveCount(0);
  await page.evaluate(axeSource);
  for (const width of [320, 393, 412, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(await dialog.evaluate((d) => d.scrollWidth <= d.clientWidth)).toBe(true);
    if (width === 320 || width === 1440) {
      const violations = await page.evaluate(async () => {
        const axe = (
          window as unknown as { axe: { run(doc: Document, options: object): Promise<{ violations: unknown[] }> } }
        ).axe;
        return (await axe.run(document, { runOnly: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'] })).violations;
      });
      expect(violations).toEqual([]);
    }
  }
  await dialog.getByRole('searchbox').fill('base');
  for (const [name, width, height] of [
    ['commands-desktop.png', 1440, 1000],
    ['commands-mobile.png', 393, 852],
  ] as const) {
    await page.setViewportSize({ width, height });
    await page.evaluate(async () => {
      await document.fonts.ready;
      await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
    });
    await page.screenshot({ path: info.outputPath(name), animations: 'disabled' });
  }
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Open menu', exact: true })).toBeFocused();
});
test('service-status commands preserve full document CSP navigation boundaries', async ({ page }) => {
  await setup(page);
  const dialog = await open(page);
  await dialog.getByRole('searchbox').fill('Service status');
  await dialog.getByRole('link').click();
  await expect(page).toHaveURL(/\/status$/);
  await open(page);
  await dialog.getByRole('searchbox').fill('Personal tasks');
  await dialog.getByRole('link').click();
  await expect(page).toHaveURL(/\/tasks$/);
  await expect(dialog).toHaveCount(0);
});
