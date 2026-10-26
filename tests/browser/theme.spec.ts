import { expect, test } from '@playwright/test';
import { getThemeScript } from '../../src/modules/theme/bootstrap';

test('applies local themes before body parsing under CSP without changing layout', async ({ page }) => {
  // Browser fixtures have no Redis. Production smoke separately checks the actual script endpoint.
  await page.route('**/api/theme-script', (route) =>
    route.fulfill({
      contentType: 'application/javascript',
      body: getThemeScript(),
    }),
  );
  await page.clock.install({ time: new Date(2026, 6, 5, 23, 59, 58) });
  // Freeze before navigation so server startup time cannot consume the final second of July 5.
  await page.clock.pauseAt(new Date(2026, 6, 5, 23, 59, 59));
  await page.addInitScript(() => {
    document.addEventListener('DOMContentLoaded', () => {
      document.documentElement.dataset.initialTheme = document.documentElement.dataset.theme;
    });
  });
  await page.goto('/');
  const html = page.locator('html');
  await expect(html).toHaveAttribute('data-initial-theme', 'independence-day');
  const before = await page.locator('h1').first().boundingBox();
  await page.clock.runFor(1000);
  await expect(html).toHaveAttribute('data-theme', 'summer');
  await page.evaluate(() => {
    history.pushState({}, '', '?theme=default');
    window.dispatchEvent(new PopStateEvent('popstate'));
  });
  await expect(html).toHaveAttribute('data-theme', 'default');
  await expect(html).not.toHaveAttribute('data-theme-palette');
  expect(await page.locator('h1').first().boundingBox()).toEqual(before);
  await page.goto('/?theme=halloween');
  await expect(html).toHaveAttribute('data-initial-theme', 'halloween');
});
