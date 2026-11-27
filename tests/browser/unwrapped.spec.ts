import { test, expect } from '../helpers/browser-test';
import { fakeConsole } from '../helpers/fake-console-client';

test.afterEach(async () => {
  await fakeConsole.reset();
});

test('Unwrapped steps through the server recap and opens the member recap', async ({ page }) => {
  const member = await fakeConsole.newMember('Arrakis Demo');
  await page.context().setExtraHTTPHeaders({ Cookie: member.cookie });
  await page.goto('/unwrapped');
  await expect(page.getByRole('heading', { level: 1, name: /^Unwrapped \d{4}$/ })).toBeVisible();

  const server = page.getByRole('region', { name: 'Server recap' });
  await expect(server.getByRole('group', { name: /^1 of \d+:/ })).toBeVisible();
  await expect(server.getByRole('button', { name: 'Previous' })).toBeDisabled();

  // The fake Console's records board: 9 records and 36 runs.
  const stage = server.locator('[tabindex="0"]');
  await stage.focus();
  for (let step = 0; step < 8 && !(await server.getByText('dungeon runs on the board').isVisible()); step++)
    await page.keyboard.press('ArrowRight');
  await expect(server.getByText('dungeon runs on the board')).toBeVisible();
  await expect(server.getByText('36', { exact: true })).toBeVisible();
  await expect(server.getByText(/does not record when a run happened/)).toBeVisible();

  await page.keyboard.press('End');
  await server.getByRole('button', { name: 'See your own year' }).click();
  await expect(page.getByRole('button', { name: 'You', pressed: true })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Your recap' })).toBeVisible();
});
