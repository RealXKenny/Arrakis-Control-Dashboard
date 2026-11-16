import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { test, expect } from '../helpers/browser-test';
import { fakeConsole } from '../helpers/fake-console-client';
import { personalPortalLayout } from '../../src/features/portal/layout';
const origin = 'http://127.0.0.1:3100';
const endpoint = '/api/v2/portal/layout';
const axeSource = readFileSync(createRequire(import.meta.url).resolve('axe-core/axe.min.js'), 'utf8');

test('widgets save order, visibility and density privately across reload and map navigation', async ({
  page,
  context,
  browser,
}) => {
  const member = await fakeConsole.newMember('Widget Navigator', { guild: { id: '2', role: 100 } });
  await context.setExtraHTTPHeaders({ Cookie: member.cookie });
  await page.goto('/portal');
  const widgets = page
    .getByRole('region', { name: 'Your portal widgets', exact: true })
    .locator('[data-portal-widget]');
  await expect(widgets).toHaveCount(8);
  await page.getByRole('button', { name: 'Customize widgets', exact: true }).click();
  const settings = page.getByRole('region', { name: 'Portal layout', exact: true });
  await settings.getByRole('checkbox', { name: /^Landsraad/ }).uncheck();
  await settings.getByRole('button', { name: 'Move Fleet up', exact: true }).click();
  await settings.getByLabel('Panel density', { exact: true }).selectOption('compact');
  await settings.getByRole('button', { name: 'Save layout', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Portal layout', exact: true }).getByRole('status')).toHaveText(
    'Portal layout saved.',
  );
  const saved = (await (await page.request.get(`${endpoint}?owner=foreign`)).json()).record;
  expect(saved.layout).toEqual({
    schemaVersion: 1,
    density: 'compact',
    widgets: ['conditions', 'character', 'solaris', 'exchange', 'fleet', 'holdings', 'population'],
  });
  await page.reload();
  await expect(widgets).toHaveCount(7);
  expect(
    await widgets.evaluateAll((elements) => elements.map((element) => element.getAttribute('data-portal-widget'))),
  ).toEqual(saved.layout.widgets);
  await page.getByRole('link', { name: 'Deep Desert', exact: true }).click();
  await expect(page.getByText('Field conditions · Deep Desert', { exact: true })).toBeVisible();
  await expect(page.locator('[data-portal-density]')).toHaveAttribute('data-portal-density', 'compact');
  const other = await fakeConsole.newMember('Independent Viewer');
  const otherContext = await browser.newContext({ extraHTTPHeaders: { Cookie: other.cookie } });
  const otherPage = await otherContext.newPage();
  await otherPage.goto(`${origin}/portal`);
  expect((await (await otherPage.request.get(`${origin}${endpoint}`)).json()).record).toBeNull();
  await expect(
    otherPage.getByRole('region', { name: 'Your portal widgets', exact: true }).locator('[data-portal-widget]'),
  ).toHaveCount(5);
  await otherContext.close();
});

test('solo defaults stay compact and empty layouts remain recoverable without a guild or linked character', async ({
  page,
  context,
}) => {
  const member = await fakeConsole.newMember('Solo Navigator');
  await context.setExtraHTTPHeaders({ Cookie: member.cookie });
  await page.goto('/portal');
  const widgets = page
    .getByRole('region', { name: 'Your portal widgets', exact: true })
    .locator('[data-portal-widget]');
  await expect(widgets).toHaveCount(5);
  await expect(page.getByText('Independent traveller', { exact: true })).toBeVisible();
  await expect(page.getByText('Guild rank', { exact: true })).toBeHidden();
  await page.getByRole('button', { name: 'Full overview', exact: true }).click();
  await expect(widgets).toHaveCount(8);
  await page.getByRole('button', { name: 'Discard changes', exact: true }).click();
  await expect(widgets).toHaveCount(5);
  for (const name of ['Field conditions', 'Your character', 'Solari credit', 'Holdings', 'Fleet'])
    await page.getByRole('checkbox', { name: new RegExp(`^${name}`) }).uncheck();
  await page.getByRole('button', { name: 'Save layout', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Portal layout', exact: true }).getByRole('status')).toHaveText(
    'Portal layout saved.',
  );
  await page.reload();
  await expect(widgets).toHaveCount(0);
  await expect(page.getByText(/All widgets are hidden/)).toBeVisible();
  await page.getByRole('button', { name: 'Customize widgets', exact: true }).click();
  await page.getByRole('button', { name: 'Reset to recommended', exact: true }).click();
  await page.getByRole('button', { name: 'Save layout', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Portal layout', exact: true }).getByRole('status')).toHaveText(
    'Portal layout saved.',
  );
  await expect(widgets).toHaveCount(5);
  const unlinked = await fakeConsole.newMember('Unlinked Viewer', { linked: { linked: false } });
  await context.setExtraHTTPHeaders({ Cookie: unlinked.cookie });
  await page.reload();
  await expect(page.getByText('Link your character', { exact: true })).toBeVisible();
  await expect(page.locator('[data-portal-widget="holdings"]')).toContainText('Unavailable');
  await page.getByRole('button', { name: 'Full overview', exact: true }).click();
  await page.getByRole('button', { name: 'Save layout', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Portal layout', exact: true }).getByRole('status')).toHaveText(
    'Portal layout saved.',
  );
});

test('stale-tab conflicts and failed writes preserve the preview until the saved layout is explicitly reloaded', async ({
  page,
  context,
}) => {
  const member = await fakeConsole.newMember('Layout Conflict');
  await context.setExtraHTTPHeaders({ Cookie: member.cookie });
  await page.goto('/portal');
  await page.getByRole('button', { name: 'Customize widgets', exact: true }).click();
  await page.getByRole('checkbox', { name: /^Fleet/ }).uncheck();
  const concurrent = { revision: null, layout: { ...personalPortalLayout(), widgets: ['character'] } };
  expect((await page.request.post(endpoint, { headers: { Origin: origin }, data: concurrent })).ok()).toBe(true);
  await page.getByRole('button', { name: 'Save layout', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Portal layout', exact: true }).getByRole('alert')).toContainText(
    'another tab',
  );
  await expect(
    page.getByRole('region', { name: 'Your portal widgets', exact: true }).locator('[data-portal-widget]'),
  ).toHaveCount(4);
  await page.getByRole('button', { name: 'Reload saved layout', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Portal layout', exact: true }).getByRole('status')).toHaveText(
    'Saved layout loaded.',
  );
  await expect(
    page.getByRole('region', { name: 'Your portal widgets', exact: true }).locator('[data-portal-widget]'),
  ).toHaveCount(1);
  await page.getByRole('checkbox', { name: /^Holdings/ }).check();
  await page.route(`**${endpoint}`, (route) =>
    route.request().method() === 'POST'
      ? route.fulfill({ status: 503, json: { error: 'Settings temporarily unavailable.' } })
      : route.continue(),
  );
  await page.getByRole('button', { name: 'Save layout', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Portal layout', exact: true }).getByRole('alert')).toContainText(
    'temporarily unavailable',
  );
  await expect(page.getByRole('checkbox', { name: /^Holdings/ })).toBeChecked();
  expect((await (await page.request.get(endpoint)).json()).record.layout.widgets).toEqual(['character']);
});

test('the editor supports touch, keyboard and WCAG AA without mobile overflow', async ({ browser }, info) => {
  const member = await fakeConsole.newMember('Touch Layout');
  const context = await browser.newContext({
    baseURL: origin,
    extraHTTPHeaders: { Cookie: member.cookie },
    hasTouch: true,
    isMobile: true,
    deviceScaleFactor: 3,
    viewport: { width: 393, height: 852 },
  });
  const page = await context.newPage();
  await page.goto('/portal');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.getByRole('button', { name: 'Customize widgets', exact: true }).tap();
  await page.getByRole('button', { name: 'Move Solari credit up', exact: true }).tap();
  await expect(page.getByRole('region', { name: 'Portal layout', exact: true }).getByRole('status')).toContainText(
    'position 2',
  );
  await page.getByRole('button', { name: 'Save layout', exact: true }).tap();
  await expect(page.getByRole('region', { name: 'Portal layout', exact: true }).getByRole('status')).toHaveText(
    'Portal layout saved.',
  );
  for (const width of [320, 393, 412, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  await page.evaluate(axeSource);
  for (const width of [1920, 393]) {
    await page.setViewportSize({ width, height: 900 });
    const violations = await page.evaluate(async () => {
      const axe = (
        window as unknown as {
          axe: { run(document: Document, options: object): Promise<{ violations: { id: string }[] }> };
        }
      ).axe;
      return (await axe.run(document, { runOnly: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'] })).violations.map(
        (v) => v.id,
      );
    });
    expect(violations).toEqual([]);
  }
  await page.getByRole('button', { name: 'Move Solari credit up', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('region', { name: 'Portal layout', exact: true }).getByRole('status')).toContainText(
    'position 1',
  );
  await page.setViewportSize({ width: 393, height: 852 });
  await page.getByRole('button', { name: 'Discard changes', exact: true }).tap();
  await page.getByRole('button', { name: 'Customize widgets', exact: true }).tap();
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
  await page.screenshot({ path: info.outputPath('portal-solo-mobile.png'), fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
  await page.screenshot({ path: info.outputPath('portal-solo-desktop.png'), fullPage: true });
  await context.close();
});

test('a timed-out save preserves unsaved choices and requires explicit reconciliation without retrying', async ({
  page,
  context,
}) => {
  const member = await fakeConsole.newMember('Slow Settings');
  await context.setExtraHTTPHeaders({ Cookie: member.cookie });
  await page.goto('/portal');
  await page.getByRole('button', { name: 'Customize widgets', exact: true }).click();
  await page.getByRole('checkbox', { name: /^Fleet/ }).uncheck();
  let writes = 0;
  await page.route(`**${endpoint}`, async (route) => {
    if (route.request().method() !== 'POST') return route.continue();
    writes++;
    await new Promise<void>((resolve) => {
      route
        .request()
        .response()
        .then(() => resolve())
        .catch(() => resolve());
    });
  });
  await page.getByRole('button', { name: 'Save layout', exact: true }).click();
  const settings = page.getByRole('region', { name: 'Portal layout', exact: true });
  await expect(settings.getByRole('alert')).toContainText('timed out', { timeout: 15000 });
  await expect(page.getByRole('checkbox', { name: /^Fleet/ })).not.toBeChecked();
  await expect(page.getByRole('button', { name: 'Save layout', exact: true })).toBeEnabled();
  expect(writes).toBe(1);
  await page.getByRole('button', { name: 'Reload saved layout', exact: true }).click();
  await expect(settings.getByRole('status')).toHaveText('Saved layout loaded.');
  await expect(page.getByRole('checkbox', { name: /^Fleet/ })).toBeChecked();
});
