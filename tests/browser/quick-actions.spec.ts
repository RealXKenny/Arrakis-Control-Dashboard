import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { test, expect } from '../helpers/browser-test';
import { fakeConsole } from '../helpers/fake-console-client';

test.use({ hasTouch: true });
test.afterEach(async () => {
  await fakeConsole.reset();
});
const axeSource = readFileSync(createRequire(import.meta.url).resolve('axe-core/axe.min.js'), 'utf8');
const quick = (page: import('@playwright/test').Page) =>
  page.getByRole('region', { name: 'Quick actions', exact: true });

test('solo supply shortcut prepares a bounded query and searches only after explicit confirmation', async ({
  page,
}) => {
  const member = await fakeConsole.newMember('Quick solo', { guild: null });
  await page.context().setExtraHTTPHeaders({ Cookie: member.cookie });
  await page.setViewportSize({ width: 393, height: 852 });
  let scans = 0;
  page.on('request', (r) => {
    if (r.url().includes('/api/v2/items/find?')) scans++;
  });
  await page.goto('/portal');
  await expect(quick(page)).toContainText('No guild is reported');
  const input = quick(page).getByRole('searchbox', { name: 'Item name or template' });
  await expect(input).toHaveAttribute('maxlength', '128');
  await input.fill('Spice & water / desert');
  await input.press('Enter');
  await expect(page).toHaveURL(/\/storage\?find=Spice.*#finder-title$/);
  await expect(page.getByRole('searchbox', { name: 'Find across your assets' })).toHaveValue('Spice & water / desert');
  expect(scans).toBe(0);
  await page.getByRole('searchbox', { name: 'Find across your assets' }).fill('Spice');
  await page.getByRole('button', { name: 'Find items', exact: true }).tap();
  await expect.poll(() => scans).toBe(1);
  await expect(page.getByRole('list', { name: 'Item finder results' })).toContainText('Spice');
});

test('base shortcuts select owned and shared holdings without publishing or importing', async ({ page }) => {
  const member = await fakeConsole.newMember('Quick bases', {
    guild: null,
    details: {
      bases: {
        rows: [
          { id: 'quick-owned', name: 'Solo shelter', relationship: 'owner' },
          { id: 'quick-shared', name: 'Team shelter', relationship: 'shared' },
        ],
      },
    },
  });
  await page.context().setExtraHTTPHeaders({ Cookie: member.cookie });
  await page.goto('/portal');
  await quick(page).getByRole('link', { name: 'Check owned bases' }).tap();
  await expect(page).toHaveURL(/\/holdings$/);
  await expect(page.getByRole('heading', { name: 'Solo shelter', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Team shelter', exact: true })).toHaveCount(0);
  await page.goto('/portal');
  await quick(page).getByRole('link', { name: 'Check shared bases' }).tap();
  await expect(page).toHaveURL(/\/holdings\?view=shared$/);
  await expect(page.getByRole('heading', { name: 'Team shelter', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Solo shelter', exact: true })).toHaveCount(0);
  // The existing adapter resolves identity with a read-only POST; all resource mutations stay forbidden.
  expect(
    (await fakeConsole.requests()).filter(
      (r) => r.method !== 'GET' && r.path !== '/api/integrations/discord/players/me',
    ),
  ).toEqual([]);
});

test('operation shortcut opens a real private briefing without signing up and unlinked users retain honest destinations', async ({
  page,
}) => {
  const leader = await fakeConsole.newMember('Quick leader', { guild: { id: '2', role: 100 } });
  await page.context().setExtraHTTPHeaders({ Cookie: leader.cookie });
  await page.goto('/guild?tab=operations');
  const planner = page.getByRole('region', { name: 'Guild operations planner' });
  await planner.getByRole('button', { name: 'New operation', exact: true }).click();
  await planner.getByLabel('Operation title').fill('Quick desert patrol');
  await planner.getByLabel('Meeting point').fill('Eastern rally point');
  await planner.getByLabel('Operation details').fill('Bring water and repair tools.');
  await planner.getByRole('button', { name: 'Save operation', exact: true }).click();
  await expect(planner.getByRole('article', { name: 'Quick desert patrol', exact: true })).toBeVisible();
  const member = await fakeConsole.newMember('Quick member', { guild: { id: '2', role: 1 } });
  await page.context().setExtraHTTPHeaders({ Cookie: member.cookie });
  await page.goto('/portal');
  let mutations = 0;
  page.on('request', (r) => {
    if (r.method() === 'POST') mutations++;
  });
  await quick(page).getByRole('link', { name: 'Read operation briefings' }).tap();
  await expect(page).toHaveURL(/\/guild\?tab=operations$/);
  await expect(planner.getByRole('article', { name: 'Quick desert patrol', exact: true })).toContainText(
    'Eastern rally point',
  );
  await expect(planner).toContainText('Bring water and repair tools.');
  expect(mutations).toBe(0);
  const solo = await fakeConsole.newMember('Quick unlinked', { linked: { linked: false }, guild: null });
  await page.context().setExtraHTTPHeaders({ Cookie: solo.cookie });
  await page.goto('/portal');
  await expect(quick(page)).toContainText('Guild access is not confirmed');
  await expect(page.getByText('Link your character', { exact: true })).toBeVisible();
  await quick(page).getByRole('link', { name: 'Read operation briefings' }).tap();
  await expect(page.getByText('Link your character', { exact: true })).toBeVisible();
  await expect(page.getByRole('article', { name: 'Quick desert patrol', exact: true })).toHaveCount(0);
});

test('server-rendered shortcuts work without JavaScript and preserve solo and anonymous access boundaries', async ({
  browser,
}) => {
  const member = await fakeConsole.newMember('No-script solo', { guild: null, details: { bases: { rows: [] } } });
  const context = await browser.newContext({ javaScriptEnabled: false, extraHTTPHeaders: { Cookie: member.cookie } });
  try {
    const page = await context.newPage();
    await page.goto('/portal');
    await quick(page).getByRole('searchbox').fill('Spice');
    await quick(page).getByRole('button', { name: 'Prepare supply search' }).click();
    await expect(page).toHaveURL(/\/storage\?find=Spice#finder-title$/);
    await expect(page.getByRole('searchbox', { name: 'Find across your assets' })).toHaveValue('Spice');
    await page.goto('/portal');
    await quick(page).getByRole('link', { name: 'Check owned bases' }).click();
    await expect(page.getByText('No bases', { exact: true })).toBeVisible();
    await page.goto('/portal');
    await quick(page).getByRole('link', { name: 'Read operation briefings' }).click();
    await expect(page.getByText('No guild reported', { exact: true })).toBeVisible();
  } finally {
    await context.close();
  }
  const anonymous = await browser.newContext();
  try {
    const page = await anonymous.newPage();
    await page.goto('/portal');
    await expect(page).toHaveURL(/\/login/);
    await expect(quick(page)).toHaveCount(0);
  } finally {
    await anonymous.close();
  }
});

test('quick actions support small touch screens, keyboard and reduced motion with WCAG AA', async ({ page }, info) => {
  const member = await fakeConsole.newMember('Mobile field essentials', { guild: null });
  await page.context().setExtraHTTPHeaders({ Cookie: member.cookie });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/portal');
  await page.evaluate(axeSource);
  for (const width of [320, 393, 412, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const sizes = await quick(page)
      .locator('input, button, a')
      .evaluateAll((nodes) => nodes.map((n) => n.getBoundingClientRect().height));
    expect(sizes.every((height) => height >= 48)).toBe(true);
    if (width === 320 || width === 1440) {
      const violations = await page.evaluate(async () => {
        const axe = (
          window as unknown as { axe: { run(doc: Document, opts: object): Promise<{ violations: unknown[] }> } }
        ).axe;
        return (await axe.run(document, { runOnly: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'] })).violations;
      });
      expect(violations).toEqual([]);
    }
  }
  await quick(page).getByRole('searchbox').focus();
  await page.keyboard.press('Tab');
  await expect(quick(page).getByRole('button', { name: 'Prepare supply search' })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(quick(page).getByRole('link', { name: 'Check owned bases' })).toBeFocused();
  for (const [name, width, height] of [
    ['quick-actions-desktop.png', 1440, 1000],
    ['quick-actions-mobile.png', 393, 852],
  ] as const) {
    await page.setViewportSize({ width, height });
    await page.evaluate(async () => {
      (document.activeElement as HTMLElement | null)?.blur();
      window.scrollTo({ top: 0, behavior: 'instant' });
      await document.fonts.ready;
      await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
    });
    await page.screenshot({ path: info.outputPath(name), fullPage: true, animations: 'disabled' });
  }
});
