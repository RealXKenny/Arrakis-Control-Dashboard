import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { test, expect } from '../helpers/browser-test';
import { fakeConsole } from '../helpers/fake-console-client';
import { appearancePalettes } from '../../src/features/appearance/catalog';
import { deriveAppearance } from '../../src/features/appearance/engine';
import { defaultColors, colorNames } from '../../src/features/appearance/model';
const axeSource = readFileSync(createRequire(import.meta.url).resolve('axe-core/axe.min.js'), 'utf8');
const studio = (page: import('@playwright/test').Page) => page.getByRole('dialog', { name: 'Appearance studio' });
test.afterEach(async () => {
  await fakeConsole.reset();
});
test('expanded desktop appearance tools fit beside the full route inventory', async ({ page }) => {
  await start(page);
  for (const width of [1840, 1920, 2000, 2160, 2400]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.evaluate(() => document.fonts.ready);
    const geometry = await page.evaluate(() => ({
      width: innerWidth,
      scroll: document.documentElement.scrollWidth,
      parts: [...document.querySelector('header')!.children[0].children].map((el) => ({
        tag: el.tagName,
        box: {
          left: el.getBoundingClientRect().left,
          width: el.getBoundingClientRect().width,
          right: el.getBoundingClientRect().right,
        },
      })),
    }));
    expect(geometry.scroll, JSON.stringify(geometry)).toBeLessThanOrEqual(width);
    await expect(page.getByRole('button', { name: 'Open appearance studio', exact: true })).toBeVisible();
  }
});
async function start(page: import('@playwright/test').Page) {
  const member = await fakeConsole.newMember('Appearance member', { guild: null, linked: { linked: false } });
  await page.context().setExtraHTTPHeaders({ Cookie: member.cookie });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/portal');
  await expect(page.getByRole('region', { name: 'Your portal widgets' })).toBeVisible();
  return member;
}
async function open(page: import('@playwright/test').Page) {
  await page.getByRole('button', { name: 'Open appearance studio', exact: true }).click();
  await expect(studio(page)).toBeVisible();
  return studio(page);
}
test('matches all 66 PR #298 choices across the whole UI and restores the Console default', async ({ page }, info) => {
  test.setTimeout(120000);
  await start(page);
  const dialog = await open(page);
  await expect(dialog.locator('[data-palette-option]')).toHaveCount(66);
  for (const palette of appearancePalettes) {
    await dialog.locator(`[data-palette-option="${palette.id}"]`).click();
    await expect(dialog.locator(`[data-palette-option="${palette.id}"]`)).toHaveAttribute('aria-pressed', 'true');
    const expected = palette.id === 'default' ? defaultColors : deriveAppearance(palette.colors).colors;
    const colors = await page.evaluate(() => ({
      background: getComputedStyle(document.body).backgroundColor,
      panel: getComputedStyle(document.querySelector('dialog')!).backgroundColor,
      header: getComputedStyle(document.querySelector('header')!).backgroundColor,
      selected: document.documentElement.dataset.appearance ?? 'default',
    }));
    expect(colors.selected).toBe(palette.id);
    const rgb = (hex: string) => `rgb(${[1, 3, 5].map((at) => parseInt(hex.slice(at, at + 2), 16)).join(', ')})`;
    expect(colors.background, palette.id).toBe(rgb(expected.background));
    expect(colors.panel, palette.id).toBe(rgb(expected.background));
    expect(colors.header, palette.id).not.toBe('rgba(0, 0, 0, 0)');
  }
  await dialog.getByRole('button', { name: 'Restore Default', exact: true }).click();
  expect(
    await page.evaluate(() => ({
      id: document.documentElement.dataset.appearance,
      stored: localStorage.getItem('arrakis-appearance-v1'),
      bg: getComputedStyle(document.body).backgroundColor,
    })),
  ).toEqual({ id: undefined, stored: null, bg: 'rgb(13, 15, 18)' });
  await dialog.getByRole('button', { name: 'Done', exact: true }).click();
  await page.screenshot({
    path: info.outputPath('appearance-default-desktop.png'),
    fullPage: true,
    animations: 'disabled',
  });
});
test('searches groups, retains the applied name, follows visible keyboard order and returns focus', async ({
  page,
}) => {
  await start(page);
  const trigger = page.getByRole('button', { name: 'Open appearance studio', exact: true });
  const dialog = await open(page);
  await expect(dialog.getByLabel('Find a theme')).toBeFocused();
  await dialog.locator('[data-palette-option="dd-jade"]').click();
  await dialog.getByLabel('Find a theme').fill('harkonnen');
  await expect(dialog.locator('[data-palette-option]')).toHaveCount(2);
  await expect(dialog).toContainText('Jade');
  const first = dialog.locator('[data-palette-option]').first(),
    last = dialog.locator('[data-palette-option]').last();
  await first.focus();
  await page.keyboard.press('End');
  await expect(last).toBeFocused();
  await page.keyboard.press('Home');
  await expect(first).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(last).toBeFocused();
  await dialog.getByRole('combobox', { name: 'Theme group' }).selectOption('Houses');
  await expect(dialog.locator('[data-palette-option]')).toHaveCount(1);
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await page.reload();
  expect(await page.evaluate(() => document.documentElement.dataset.appearance)).toBe('dd-jade');
});
test('customizes light/dark role colors, previews without saving, exports/imports and persists validated settings', async ({
  page,
}) => {
  await start(page);
  let dialog = await open(page);
  await dialog.locator('[data-palette-option="dd-jade"]').click();
  const colors = {
    ...defaultColors,
    background: '#f8fafc',
    panel: '#f1f5f9',
    raised: '#e2e8f0',
    text: '#0f172a',
    muted: '#475569',
    accent: '#6d28d9',
    secondary: '#0369a1',
    border: '#64748b',
    success: '#15803d',
    warning: '#92400e',
    danger: '#b91c1c',
  };
  await dialog.getByRole('button', { name: 'Custom colors', exact: true }).click();
  const labels = {
    background: 'Page background',
    panel: 'Panel surface',
    raised: 'Raised surface',
    text: 'Primary text',
    muted: 'Muted text',
    accent: 'Primary accent',
    secondary: 'Secondary accent',
    border: 'Borders',
    success: 'Success',
    warning: 'Warning',
    danger: 'Danger',
  };
  for (const name of colorNames) await dialog.getByLabel(`${labels[name]} hex`, { exact: true }).fill(colors[name]);
  await dialog.getByRole('button', { name: 'Preview on dashboard' }).click();
  expect(await page.evaluate(() => document.documentElement.dataset.appearance)).toBe('custom');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('arrakis-appearance-v1')!).selected)).toBe(
    'dd-jade',
  );
  await page.keyboard.press('Escape');
  expect(await page.evaluate(() => document.documentElement.dataset.appearance)).toBe('dd-jade');
  dialog = await open(page);
  await dialog.getByRole('button', { name: 'Custom colors', exact: true }).click();
  const file = {
    name: 'colors.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify({ version: 1, colors })),
  };
  await dialog.getByLabel('Import color JSON').setInputFiles(file);
  await expect(dialog.getByRole('status')).toContainText('imported into the draft');
  await dialog.getByRole('button', { name: 'Apply custom colors', exact: true }).click();
  const expected = deriveAppearance(colors).colors;
  expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe(
    `rgb(${[1, 3, 5].map((at) => parseInt(expected.background.slice(at, at + 2), 16)).join(', ')})`,
  );
  const download = page.waitForEvent('download');
  await dialog.getByRole('button', { name: 'Export colors', exact: true }).click();
  expect(JSON.parse(readFileSync((await (await download).path())!, 'utf8'))).toEqual({ version: 1, colors });
  await dialog.getByLabel('Import color JSON').setInputFiles({
    name: 'bad.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify({ version: 1, colors: { ...colors, accent: 'url(https://foreign.test)' } })),
  });
  await expect(dialog.getByRole('alert')).toContainText('No settings were changed');
  await dialog.getByRole('button', { name: 'Done', exact: true }).click();
  await page.reload();
  expect(await page.evaluate(() => document.documentElement.dataset.appearance)).toBe('custom');
  for (const path of [
    '/portal',
    '/inbox',
    '/tasks',
    '/activity-views',
    '/personal-data',
    '/privacy',
    '/vehicles',
    '/guild',
    '/market',
  ]) {
    await page.goto(path);
    await page.evaluate(axeSource);
    expect(
      await page.evaluate(
        async () =>
          (
            await (
              window as unknown as { axe: { run(doc: Document, opts: object): Promise<{ violations: unknown[] }> } }
            ).axe.run(document, { runOnly: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'] })
          ).violations,
      ),
      path,
    ).toEqual([]);
  }
});
test('synchronizes other tabs and supports blocked storage without making server requests', async ({ page }) => {
  await start(page);
  const other = await page.context().newPage();
  await other.goto('/tasks');
  let dialog = await open(page);
  await dialog.locator('[data-palette-option="dd-emerald"]').click();
  await expect.poll(() => other.evaluate(() => document.documentElement.dataset.appearance)).toBe('dd-emerald');
  await dialog.getByRole('button', { name: 'Done', exact: true }).click();
  await page.evaluate(() => {
    Storage.prototype.setItem = function () {
      throw new DOMException('Blocked', 'QuotaExceededError');
    };
    Storage.prototype.removeItem = function () {
      throw new DOMException('Blocked', 'SecurityError');
    };
  });
  const api: string[] = [];
  page.on('request', (request) => {
    if (new URL(request.url()).pathname.startsWith('/api/')) api.push(request.url());
  });
  dialog = await open(page);
  await dialog.locator('[data-palette-option="dd-rosewood"]').click();
  await expect(dialog.getByRole('status')).toContainText('Browser storage is unavailable');
  await dialog.getByRole('button', { name: 'Done', exact: true }).click();
  dialog = await open(page);
  await expect(dialog).toContainText('Rosewood');
  expect(api).toEqual([]);
  await other.close();
});
test('rejects malformed cached CSS and uses a nonce for the synchronous boot', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem(
      'arrakis-appearance-v1',
      JSON.stringify({ version: 1, selected: 'custom', custom: { background: 'url(https://foreign.test)' } }),
    );
    localStorage.setItem(
      'arrakis-appearance-cache-v1',
      JSON.stringify({
        version: 1,
        preference: localStorage.getItem('arrakis-appearance-v1'),
        appearance: 'dark',
        tokens: { '--font-sans': 'url(https://foreign.test)' },
      }),
    );
  });
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const response = await page.goto('/');
  const csp = response!.headers()['content-security-policy'];
  const boot = page.locator('#arrakis-appearance-boot');
  const nonce = await boot.evaluate((node) => (node as HTMLScriptElement).nonce);
  expect(nonce).toBeTruthy();
  expect(csp).toContain(`nonce-${nonce}`);
  expect(await page.evaluate(() => document.documentElement.style.getPropertyValue('--font-sans'))).toBe('');
  expect(errors).toEqual([]);
});
test('a failed lazy picker chunk leaves navigation usable and offers an isolated Default recovery', async ({
  page,
}) => {
  await start(page);
  await page.waitForFunction(() => document.documentElement.dataset.appearanceReady === 'default');
  await page.route('**/_next/static/chunks/*.js', (route) => route.abort());
  await page.getByRole('button', { name: 'Open appearance studio', exact: true }).click();
  await expect(page.getByRole('alert', { name: 'Appearance recovery' })).toContainText(
    'Appearance controls could not load',
  );
  await page.unroute('**/_next/static/chunks/*.js');
  await page.getByRole('button', { name: 'Reset appearance and close', exact: true }).click();
  await expect(page.getByRole('alert', { name: 'Appearance recovery' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Open appearance studio', exact: true })).toBeFocused();
  await page.reload();
  await open(page);
  await expect(studio(page).locator('[data-palette-option]')).toHaveCount(66);
});
test('supports mobile entry, all release widths, reduced motion and WCAG AA with screenshots', async ({
  page,
}, info) => {
  await start(page);
  await page.setViewportSize({ width: 393, height: 852 });
  await page.getByRole('button', { name: 'Open menu', exact: true }).click();
  await page.getByRole('button', { name: 'Themes and custom colors', exact: true }).click();
  const dialog = studio(page);
  await expect(dialog).toBeVisible();
  await dialog.locator('[data-palette-option="tabr-fremen"]').click();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.evaluate(axeSource);
  for (const width of [320, 393, 412, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
    if (width === 320 || width === 1440)
      expect(
        await page.evaluate(
          async () =>
            (
              await (
                window as unknown as { axe: { run(doc: Document, opts: object): Promise<{ violations: unknown[] }> } }
              ).axe.run(document, { runOnly: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'] })
            ).violations,
        ),
      ).toEqual([]);
  }
  for (const [name, width, height] of [
    ['appearance-desktop.png', 1440, 1000],
    ['appearance-mobile.png', 393, 852],
  ] as const) {
    await page.setViewportSize({ width, height });
    await dialog.evaluate((el) => el.scrollTo({ top: 0, behavior: 'instant' }));
    await dialog.locator('[data-appearance-body]').evaluate((el) => el.scrollTo({ top: 0, behavior: 'instant' }));
    await page.screenshot({ path: info.outputPath(name), animations: 'disabled' });
  }
});
