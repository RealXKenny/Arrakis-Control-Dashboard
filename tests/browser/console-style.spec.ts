import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { test, expect } from '../helpers/browser-test';

const axeSource = readFileSync(createRequire(import.meta.url).resolve('axe-core/axe.min.js'), 'utf8');

test('Console-inspired desktop surfaces keep native navigation usable at PC widths', async ({ page }, info) => {
  await page.context().setExtraHTTPHeaders({ Cookie: '__Host-dashboard_session=browser-member-session' });
  for (const width of [1280, 1440, 1920, 2560]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto('/portal');
    await expect(page.getByRole('navigation', { name: 'Primary', exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Your world at a glance' })).toHaveCSS('text-transform', 'none');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({ path: info.outputPath('console-style-portal-desktop.png') });
  await page.goto('/activity-views');
  const button = page.getByRole('button', { name: 'Save activity view', exact: true });
  await expect(button).toHaveCSS('text-transform', 'none');
  await expect(button).toHaveCSS('box-shadow', 'none');
  await page.screenshot({ path: info.outputPath('console-style-desktop.png'), fullPage: true });
});

test('grouped mobile tiles preserve routes, permissions, focus and small-screen accessibility', async ({
  page,
}, info) => {
  await page.context().setExtraHTTPHeaders({ Cookie: '__Host-dashboard_session=browser-member-session' });
  for (const width of [320, 393, 412, 768]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/portal');
    const trigger = page.getByRole('button', { name: 'Open menu', exact: true });
    await trigger.click();
    const drawer = page.getByRole('dialog', { name: 'Navigation', exact: true });
    await expect(drawer.getByRole('link', { name: 'Holdings', exact: true })).toBeVisible();
    await expect(drawer.getByRole('link', { name: 'Base Storage', exact: true })).toBeVisible();
    await expect(drawer.getByRole('link', { name: 'Administration', exact: true })).toHaveCount(0);
    const grid = drawer.locator('nav[aria-label="Mobile"] > .mobile-nav-grid');
    const columns = await grid.evaluate((element) => getComputedStyle(element).gridTemplateColumns.split(' ').length);
    expect(columns).toBe(width < 380 ? 1 : 2);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.evaluate(axeSource);
    const violations = await page.evaluate(
      async () =>
        (
          await (
            window as unknown as {
              axe: { run: (element: Element, options: object) => Promise<{ violations: unknown[] }> };
            }
          ).axe.run(document.querySelector('#mobile-nav')!, {
            runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] },
          })
        ).violations,
    );
    expect(violations).toEqual([]);
    if (width === 393) await page.screenshot({ path: info.outputPath('console-style-mobile-menu.png') });
    await page.keyboard.press('Escape');
    await expect(trigger).toBeFocused();
  }
});
