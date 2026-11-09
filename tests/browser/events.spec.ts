import { test, expect } from '../helpers/browser-test';

const member = '__Host-dashboard_session=browser-member-session';
const admin = '__Host-dashboard_session=browser-admin-session';

test('members find the seeded competition under More, with known prizes and no invented dates', async ({ page }) => {
  await page.context().setExtraHTTPHeaders({ Cookie: member });
  await page.setViewportSize({ width: 1920, height: 900 });
  await page.goto('/portal');
  const primary = page.getByRole('navigation', { name: 'Primary', exact: true });
  await expect(primary.getByRole('link', { name: 'Community events', exact: true })).toHaveCount(0);
  await primary.getByRole('button', { name: 'More', exact: true }).click();
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

test('event pages and management reject unauthorized visitors', async ({ page }) => {
  await page.goto('/events');
  await expect(page).toHaveURL(/\/login/);
  await page.context().setExtraHTTPHeaders({ Cookie: member });
  expect((await page.request.get('/api/v2/admin/events')).status()).toBe(403);
  const response = await page.goto('/admin?tab=events');
  expect(response?.status()).toBe(404);
});

test('administrator creates a private draft, publishes, edits and deletes it through the event manager', async ({
  page,
  browser,
}) => {
  await page.context().setExtraHTTPHeaders({ Cookie: admin });
  const viewer = await browser.newContext({ extraHTTPHeaders: { Cookie: member } });
  const memberPage = await viewer.newPage();
  const title = `Community showcase ${Date.now()}`;
  await page.goto('/admin?tab=events');
  await expect(page.getByRole('heading', { name: 'Community events', exact: true })).toBeVisible();
  await page.getByLabel('Event title', { exact: true }).fill(title);
  await page.getByLabel('Short description', { exact: true }).fill('A community showcase for our players.');
  await page
    .getByLabel('Full description', { exact: true })
    .fill('Bring your best creations and enjoy a community showcase.');
  await page.getByLabel('Solaris prize', { exact: true }).fill('25000');
  await page.getByLabel('How to enter', { exact: true }).fill('Entry information for this test event.');
  await page.getByRole('button', { name: 'Save event', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Draft saved');
  await memberPage.goto(new URL('/events', page.url()).toString());
  await expect(memberPage.getByRole('heading', { name: title, exact: true })).toHaveCount(0);
  await page.getByLabel('Visibility', { exact: true }).selectOption('published');
  await page.getByRole('button', { name: 'Save event', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Event published');
  await memberPage.reload();
  await expect(memberPage.getByRole('heading', { name: title, exact: true })).toBeVisible();
  await expect(memberPage.getByText('25,000', { exact: true })).toBeVisible();
  await page.getByLabel('Short description', { exact: true }).fill('Updated showcase details for everyone.');
  await page.getByRole('button', { name: 'Save event', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Event published');
  await memberPage.reload();
  await expect(memberPage.getByText('Updated showcase details for everyone.')).toBeVisible();
  await page.getByRole('button', { name: 'Delete event', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Delete community event' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Delete event', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText('Event deleted.');
  await memberPage.reload();
  await expect(memberPage.getByRole('heading', { name: title, exact: true })).toHaveCount(0);
  await expect(memberPage.getByRole('heading', { name: 'Base Building Competition', exact: true })).toBeVisible();
  await viewer.close();
});
