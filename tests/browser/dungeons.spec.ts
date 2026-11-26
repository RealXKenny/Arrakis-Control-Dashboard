import { test, expect } from '../helpers/browser-test';
import { fakeConsole } from '../helpers/fake-console-client';

test.afterEach(async () => {
  await fakeConsole.reset();
});

async function signIn(page: import('@playwright/test').Page) {
  const member = await fakeConsole.newMember('Arrakis Demo');
  await page.context().setExtraHTTPHeaders({ Cookie: member.cookie });
}

test('dungeon records, filters, recent runs and personal records come from the documented endpoints', async ({
  page,
}) => {
  await signIn(page);
  await page.goto('/dungeons');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  const table = page.getByRole('table', { name: 'Fastest run per dungeon and difficulty' });
  await expect(table).toBeVisible();
  await expect(page.getByText('9 records · 36 runs counted')).toBeVisible();
  await expect(table.getByText('Spice Refinery').first()).toBeVisible();

  await page.getByLabel('Search').fill('Shipwreck');
  await expect(table.locator('tbody tr')).toHaveCount(3);
  await page.getByLabel('Search').fill('no-such-dungeon');
  await expect(page.getByText('No records match these filters')).toBeVisible();
  await page.getByLabel('Search').fill('');

  await page.getByRole('link', { name: 'Recent runs' }).click();
  await expect(page.getByRole('list', { name: 'Recent dungeon runs' })).toBeVisible();
  await expect(page.getByText(/36 matching of 36 runs/)).toBeVisible();
  const pager = page.getByRole('navigation', { name: 'Run pages' });
  await pager.getByRole('button', { name: 'Next' }).click();
  await expect(page.getByRole('list', { name: 'Recent dungeon runs' }).locator('li')).toHaveCount(11);

  await page.getByRole('link', { name: 'My records' }).click();
  await expect(page.getByRole('table', { name: 'Your best run per dungeon and difficulty' })).toBeVisible();

  const requests = await fakeConsole.requests();
  const dungeonPaths = requests.map((request) => request.path).filter((path) => path.startsWith('/api/dungeons'));
  expect(dungeonPaths.every((path) => /^\/api\/dungeons\/(leaderboard|runs)(\?|$)/.test(path))).toBe(true);
});

test('the leaderboard fits desktop and mobile without horizontal scrolling', async ({ page }, info) => {
  await signIn(page);
  for (const [name, width, height] of [
    ['dungeon-leaderboard-desktop.png', 1440, 1000],
    ['dungeon-leaderboard-mobile.png', 393, 852],
  ] as const) {
    await page.setViewportSize({ width, height });
    await page.goto('/dungeons');
    await expect(page.getByText('9 records · 36 runs counted')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.evaluate(async () => {
      await document.fonts.ready;
      window.scrollTo(0, 0);
    });
    await page.screenshot({ path: info.outputPath(name), fullPage: true, animations: 'disabled' });
  }
});
