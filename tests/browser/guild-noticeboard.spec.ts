import { expect, test } from '../helpers/browser-test';
import { fakeConsole } from '../helpers/fake-console-client';

test.afterEach(async () => {
  await fakeConsole.reset();
});

test('leaders publish private notices while ordinary members can only read them', async ({ page, context }) => {
  const leader = await fakeConsole.newMember('Notice Leader', { guild: { id: '2', role: 100 } });
  await context.setExtraHTTPHeaders({ Cookie: leader.cookie });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/guild');
  const board = page.getByRole('region', { name: 'Guild noticeboard', exact: true });
  await board.getByRole('button', { name: 'Edit message and priorities' }).click();
  await board.getByLabel(/^Message of the day/).fill('Meet at the south base tonight.');
  await board.getByLabel('Guild priorities', { exact: true }).fill('Bring water and spare fuel.');
  await board.getByRole('button', { name: 'Save message and priorities' }).click();
  await expect(board.getByRole('status')).toHaveText('Guild noticeboard updated.');
  await board.getByRole('button', { name: 'New announcement' }).click();
  await board.getByLabel('Announcement title').fill('Deep Desert briefing');
  await board.getByLabel('Announcement text').fill('Scout team meets at 19:00. <script> is displayed as text.');
  await board.getByLabel('Pin announcement').check();
  await board.getByRole('button', { name: 'Save announcement', exact: true }).click();
  await expect(board.getByRole('heading', { name: 'Deep Desert briefing' })).toBeVisible();
  await expect(board.getByText('Pinned', { exact: true })).toBeVisible();
  await page.reload();
  await expect(board.getByText('Meet at the south base tonight.', { exact: true })).toBeVisible();
  await expect(
    board.getByText('Scout team meets at 19:00. <script> is displayed as text.', { exact: true }),
  ).toBeVisible();
  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  await board.screenshot({ path: test.info().outputPath('guild-noticeboard-phone.png') });

  const member = await fakeConsole.newMember('Notice Reader', { guild: { id: '2', role: 1 } });
  await context.setExtraHTTPHeaders({ Cookie: member.cookie });
  await page.goto('/guild');
  await expect(board.getByRole('heading', { name: 'Deep Desert briefing' })).toBeVisible();
  await expect(board.getByRole('button', { name: 'New announcement' })).toHaveCount(0);
  await expect(board.getByRole('button', { name: 'Edit message and priorities' })).toHaveCount(0);

  await context.setExtraHTTPHeaders({ Cookie: leader.cookie });
  await page.goto('/guild');
  await board.getByRole('button', { name: 'Edit Deep Desert briefing', exact: true }).click();
  await board.getByLabel('Announcement title').fill('Updated briefing');
  await board.getByRole('button', { name: 'Save announcement', exact: true }).click();
  await expect(board.getByRole('heading', { name: 'Updated briefing' })).toBeVisible();
  await board.getByRole('button', { name: 'Remove Updated briefing', exact: true }).click();
  await board.getByRole('button', { name: 'Confirm removal' }).click();
  await expect(board.getByRole('heading', { name: 'Updated briefing' })).toHaveCount(0);
});

test('a conflicting save keeps the leader draft until an explicit refresh and save', async ({ page, context }) => {
  const leader = await fakeConsole.newMember('Notice Editor', { guild: { id: '2', role: 100 } });
  await context.setExtraHTTPHeaders({ Cookie: leader.cookie });
  await page.goto('/guild');
  const board = page.getByRole('region', { name: 'Guild noticeboard', exact: true });
  await board.getByRole('button', { name: 'New announcement' }).click();
  await board.getByLabel('Announcement title').fill('My unsaved plan');
  await board.getByLabel('Announcement text').fill('Keep this draft after a conflict.');
  let submissions = 0;
  await page.route('**/api/v2/guilds/2/noticeboard', async (route) => {
    if (route.request().method() !== 'POST') return route.continue();
    submissions++;
    return route.fulfill({
      status: 409,
      json: { ok: false, error: 'This noticeboard changed. Refresh before saving again. Your draft has been kept.' },
    });
  });
  await board.getByRole('button', { name: 'Save announcement', exact: true }).click();
  await expect(board.getByRole('alert')).toContainText('Your draft has been kept');
  await expect(board.getByLabel('Announcement title')).toHaveValue('My unsaved plan');
  expect(submissions).toBe(1);
  await page.unroute('**/api/v2/guilds/2/noticeboard');
  await board.getByRole('button', { name: 'Refresh noticeboard' }).click();
  await expect(board.getByLabel('Announcement text')).toHaveValue('Keep this draft after a conflict.');
  await board.getByRole('button', { name: 'Save announcement', exact: true }).click();
  await expect(board.getByRole('heading', { name: 'My unsaved plan' })).toBeVisible();
  await board.getByRole('button', { name: 'Remove My unsaved plan', exact: true }).click();
  await board.getByRole('button', { name: 'Confirm removal' }).click();
});
