import { readFileSync } from 'node:fs';
import { test, expect } from '../helpers/browser-test';

const REPORT = 'https://wl.hetrixtools.com/r/6fb3cbf6a8f67831f3e046b945b82450/';
const child = readFileSync('node_modules/iframe-resizer/js/iframeResizer.contentWindow.js', 'utf8');

test('service report requires a dashboard session', async ({ page }) => {
  await page.goto('/status');
  await expect(page).toHaveURL(/\/login/);
  await expect(page.locator('#hetrix-status-report')).toHaveCount(0);
});

test('report stays under More on wide screens and mobile and resizes through the real iframe protocol', async ({
  page,
}) => {
  await page.context().setExtraHTTPHeaders({ Cookie: '__Host-dashboard_session=browser-member-session' });
  await page.route(REPORT, (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: `<!doctype html><html><body style="margin:0"><div style="height:1800px">Fixture hosting report</div><script>${child}</script></body></html>`,
    }),
  );
  for (const width of [2560, 1920, 1600, 1280, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/portal');
    if (width >= 1280) {
      const primary = page.getByRole('navigation', { name: 'Primary', exact: true });
      await expect(primary.getByRole('link', { name: 'Service status', exact: true })).toHaveCount(0);
      await primary.getByRole('button', { name: 'More', exact: true }).click();
      await page.getByRole('menuitem', { name: /Service status/ }).click();
    } else {
      await page.getByRole('button', { name: 'Open menu', exact: true }).click();
      const drawer = page.getByRole('dialog', { name: 'Navigation', exact: true });
      await drawer.getByRole('button', { name: 'More', exact: true }).click();
      await drawer.getByRole('link', { name: 'Service status', exact: true }).click();
    }
    await expect(page).toHaveURL(/\/status$/);
    await expect(page.getByRole('heading', { name: 'Service status', exact: true })).toBeVisible();
    const frame = page.locator('#hetrix-status-report');
    await expect(frame).toHaveAttribute('src', REPORT);
    await expect(frame).toHaveAttribute('sandbox', 'allow-scripts allow-same-origin allow-popups');
    await expect(frame).toHaveAttribute('referrerpolicy', 'no-referrer');
    await expect.poll(() => frame.evaluate((element) => parseFloat(element.style.height))).toBeGreaterThan(1700);
    await expect(page.getByText('Loading service report…')).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Open report in a new tab' })).toHaveAttribute(
      'rel',
      'noopener noreferrer',
    );
    const overflow = await page.evaluate(() => ({
      width: innerWidth,
      scroll: document.documentElement.scrollWidth,
      elements: [...document.querySelectorAll('body *')]
        .filter((element) => element.getBoundingClientRect().right > innerWidth + 1)
        .slice(0, 6)
        .map((element) => ({
          tag: element.tagName,
          class: element.className,
          right: element.getBoundingClientRect().right,
        })),
    }));
    expect(overflow.scroll, JSON.stringify(overflow)).toBeLessThanOrEqual(overflow.width);
    const portal = page.waitForResponse(
      (response) => new URL(response.url()).pathname === '/portal' && response.request().isNavigationRequest(),
    );
    if (width >= 1280) {
      await page
        .getByRole('navigation', { name: 'Primary', exact: true })
        .getByRole('link', { name: 'Portal', exact: true })
        .click();
    } else {
      await page.getByRole('button', { name: 'Open menu', exact: true }).click();
      await page
        .getByRole('dialog', { name: 'Navigation', exact: true })
        .getByRole('link', { name: 'Portal', exact: true })
        .click();
    }
    expect((await portal).headers()['content-security-policy']).not.toContain('wl.hetrixtools.com');
  }
});
