import { test, expect } from '../helpers/browser-test';
import '../helpers/portal-browser';

test('unavailable personal listings are not shown as zero or a request failure', async ({ page }) => {
  await page.route('**/api/market?*', (route) =>
    route.fulfill({
      json: {
        ok: true,
        stats: { totalListings: 5500 },
        matchingItems: 240,
        marketConfig: { buybackPercent: 60 },
        items: { rows: [], totalCount: null, capabilities: { exchange: true, personalListings: false } },
        availabilityMessage: 'No listings found.',
      },
    }),
  );
  await page.goto('/portal?view=market');
  await expect(page.getByText('No listings found.', { exact: true })).toBeVisible();
  await expect(page.getByText('5,500', { exact: true })).toBeVisible();
  await expect(page.getByText('240', { exact: true })).toBeVisible();
  await expect(page.getByText('60%', { exact: true })).toHaveCount(1);
  await expect(page.getByRole('alert').filter({ hasText: /\S/ })).toHaveCount(0);
  await expect(page.getByText('No matching listings found.', { exact: true })).toHaveCount(0);
});
