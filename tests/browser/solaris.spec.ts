import { test, expect } from '../helpers/browser-test';
import { fakeConsole } from '../helpers/fake-console-client';

test.afterEach(async () => {
  await fakeConsole.reset();
});

test('Solaris leaderboard ranks characters from the player routes and shows the member their own rank', async ({
  page,
}) => {
  const rich = await fakeConsole.newMember('Solaris Baron', { details: { 'solaris-coin': { total: '9000000' } } });
  const me = await fakeConsole.newMember('Water Seller', { details: { 'solaris-coin': { total: '250000' } } });
  const poor = await fakeConsole.newMember('Sand Walker', { details: { 'solaris-coin': { total: '1200' } } });
  const pawn = (member: { discordId: string }) => `1${member.discordId.slice(-7)}`;
  await fakeConsole.setShared({
    players: {
      rows: [rich, me, poor].map((member) => ({ player_id: pawn(member), character_name: member.characterName })),
      totalCount: 3,
    },
  });
  await page.context().setExtraHTTPHeaders({ Cookie: me.cookie });
  await page.goto('/solaris');
  await expect(page.getByRole('heading', { level: 1, name: 'Solaris leaderboard' })).toBeVisible();
  const table = page.getByRole('table', { name: 'Characters ranked by Solaris on hand' });
  await expect(table.locator('tbody tr')).toHaveCount(3);
  await expect(table.locator('tbody tr').first()).toContainText('Solaris Baron');
  await expect(table.locator('tbody tr').first()).toContainText('9,000,000');
  await expect(page.getByText('3 of 3 characters ranked')).toBeVisible();
  const standing = page.getByRole('region', { name: 'Your standing' });
  await expect(standing).toContainText('#2');
  await expect(standing).toContainText('250,000');
  await expect(table.locator('tr[aria-current="true"]')).toContainText('Water Seller');

  await page.getByLabel('Search').fill('sand');
  await expect(table.locator('tbody tr')).toHaveCount(1);
  await page.getByLabel('Search').fill('nobody');
  await expect(page.getByText('No characters match this search')).toBeVisible();

  const requests = await fakeConsole.requests();
  expect(requests.some((entry) => entry.path.startsWith('/api/players?') && entry.path.includes('status=all'))).toBe(
    true,
  );
  expect(requests.every((entry) => entry.authorized)).toBe(true);
});
