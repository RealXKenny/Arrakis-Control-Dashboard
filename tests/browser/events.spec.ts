import { test, expect } from '../helpers/browser-test';

const member = '__Host-dashboard_session=browser-member-session';

test('members find the seeded competition under Community, with known prizes and no invented dates', async ({
  page,
}) => {
  await page.context().setExtraHTTPHeaders({ Cookie: member });
  await page.setViewportSize({ width: 1920, height: 900 });
  await page.goto('/portal');
  const primary = page.getByRole('navigation', { name: 'Primary', exact: true });
  await expect(primary.getByRole('link', { name: 'Community events', exact: true })).toHaveCount(0);
  await primary.getByRole('button', { name: 'Community', exact: true }).click();
  await page.getByRole('menuitem', { name: /Community events/ }).click();
  await expect(page).toHaveURL(/\/events$/);
  await expect(page.getByRole('heading', { name: 'Base Building Competition', exact: true })).toBeVisible();
  await expect(page.getByText('500,000', { exact: true })).toBeVisible();
  await expect(page.getByText('Schedule to be announced', { exact: true })).toBeVisible();
  await expect(page.getByText(/A couple of new in-game items/)).toBeVisible();
  await page.getByText('Event details', { exact: true }).click();
  await expect(page.getByText('Entry details and judging criteria will be announced here.')).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('button', { name: 'Past events', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText('0 events');
  await expect(page.getByRole('heading', { name: 'More adventures ahead' })).toBeVisible();
});

test('event pages reject unauthorized visitors', async ({ page }) => {
  await page.goto('/events');
  await expect(page).toHaveURL(/\/login/);
});
