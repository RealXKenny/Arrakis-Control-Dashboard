import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { test, expect } from '../helpers/browser-test';
import { fakeConsole } from '../helpers/fake-console-client';
test.afterEach(async () => {
  await fakeConsole.reset();
});
test.use({ hasTouch: true });
const axeSource = readFileSync(createRequire(import.meta.url).resolve('axe-core/axe.min.js'), 'utf8');
test('solo members create planning entries, link tasks, complete/reopen and preserve references across reload', async ({
  page,
  context,
}) => {
  const member = await fakeConsole.newMember('Task planner', { guild: null, linked: { linked: false } });
  await context.setExtraHTTPHeaders({ Cookie: member.cookie });
  await page.goto('/tasks');
  const list = page.getByRole('region', { name: 'Personal task list' });
  await list.getByRole('button', { name: 'New entry' }).click();
  await list.getByLabel('Entry kind').selectOption('project');
  await list.getByLabel('Entry title').fill('Desert workshop');
  await page.keyboard.press('Tab');
  await expect(list.getByLabel('Notes', { exact: true })).toBeFocused();
  await list.getByRole('button', { name: 'Save entry' }).click();
  await expect(list.getByRole('article', { name: 'Desert workshop' })).toBeVisible();
  await list.getByRole('button', { name: 'New entry' }).click();
  await list.getByLabel('Entry kind').selectOption('goal');
  await list.getByLabel('Entry title').fill('Explore the desert');
  await list.getByRole('button', { name: 'Save entry' }).click();
  await expect(list.getByRole('article', { name: 'Explore the desert' })).toBeVisible();
  await list.getByRole('button', { name: 'New entry' }).click();
  await list.getByLabel('Entry title').fill('Collect building supplies');
  await list.getByLabel('Notes', { exact: true }).fill('Keep this private.');
  await list.getByLabel('Link to', { exact: true }).selectOption('project');
  await list.getByLabel('Planning entry').selectOption({ label: 'Desert workshop' });
  await list.getByRole('button', { name: 'Save entry' }).click();
  const child = list.getByRole('article', { name: 'Collect building supplies' });
  await expect(child).toBeVisible();
  await page.reload();
  await expect(child).toContainText('Keep this private.');
  await list.getByRole('article', { name: 'Desert workshop' }).getByRole('button', { name: 'Delete entry' }).click();
  await list.getByRole('button', { name: 'Confirm delete' }).click();
  await expect(list.getByRole('alert')).toContainText('Other tasks link');
  await list.getByRole('button', { name: 'Keep entry' }).click();
  await child.getByRole('button', { name: 'Mark complete' }).click();
  await expect(child).toHaveCount(0);
  await list.getByLabel('Entry status').selectOption('completed');
  await child.getByRole('button', { name: 'Reopen entry' }).click();
  await list.getByLabel('Entry status').selectOption('open');
  await child.getByRole('link', { name: /Open Desert workshop/ }).click();
  await expect(page).toHaveURL(/\/tasks\?focus=/);
  await expect(list.getByRole('article', { name: 'Desert workshop' })).toHaveAttribute('data-focused', 'true');
  await expect(list.getByRole('article', { name: 'Desert workshop' })).toBeInViewport();
  await expect(child).toContainText('Keep this private.');
  await child.getByRole('button', { name: 'Edit entry' }).click();
  await list.getByLabel('Link to', { exact: true }).selectOption('goal');
  await list.getByLabel('Planning entry').selectOption({ label: 'Explore the desert' });
  await list.getByRole('button', { name: 'Save entry' }).click();
  await child.getByRole('link', { name: /Open Explore the desert/ }).click();
  await expect(list.getByRole('article', { name: 'Explore the desert' })).toHaveAttribute('data-focused', 'true');
});
test('asset cards prepare explicit drafts and item links prefill the authorized finder without automatic scans', async ({
  page,
  context,
}) => {
  const member = await fakeConsole.newMember('Asset planner', {
    guild: null,
    details: {
      vehicles: {
        rows: [
          {
            id: 'task-rover',
            name: 'Task rover',
            owner_name: 'Asset planner',
            relationship: 'owner',
            condition_percent: 60,
            fuel_percent: 60,
          },
        ],
      },
    },
  });
  await context.setExtraHTTPHeaders({ Cookie: member.cookie });
  await page.goto('/vehicles');
  await page.getByRole('link', { name: 'Plan a task for Task rover' }).click();
  const list = page.getByRole('region', { name: 'Personal task list' });
  await expect(list.getByLabel('Asset reference ID')).toHaveValue('task-rover');
  await list.getByLabel('Entry title').fill('Fuel the rover');
  await list.getByRole('button', { name: 'Save entry' }).click();
  await list.getByRole('article', { name: 'Fuel the rover' }).getByRole('link').click();
  await expect(page).toHaveURL(/\/vehicles\?view=owned#vehicle-task-rover/);
  await expect(page.locator('#vehicle-task-rover')).toBeVisible();
  await page.goto('/holdings');
  await page.getByRole('link', { name: 'Plan a task for Stronghold One' }).click();
  await expect(list.getByLabel('Asset reference ID')).toHaveValue('b1');
  await list.getByLabel('Entry title').fill('Check water');
  await list.getByRole('button', { name: 'Save entry' }).click();
  await list.getByRole('article', { name: 'Check water' }).getByRole('link').click();
  await expect(page).toHaveURL(/\/holdings\?view=owned#base-b1/);
  await page.goto('/tasks');
  await list.getByRole('button', { name: 'New entry' }).click();
  await list.getByLabel('Entry title').fill('Find spice');
  await list.getByLabel('Link to', { exact: true }).selectOption('item');
  await list.getByLabel('Item name or template to find').fill('Spice');
  await list.getByLabel('Reference label').fill('Spice Melange');
  await list.getByRole('button', { name: 'Save entry' }).click();
  let scans = 0;
  page.on('request', (r) => {
    if (r.url().includes('/api/v2/items/find?')) scans++;
  });
  await list.getByRole('article', { name: 'Find spice' }).getByRole('link').click();
  await expect(page.getByRole('searchbox', { name: 'Find across your assets' })).toHaveValue('Spice');
  expect(scans).toBe(0);
  await page.getByRole('button', { name: 'Find items', exact: true }).click();
  await expect.poll(() => scans).toBe(1);
});
test('stale updates preserve drafts, explicit reload reconciles and another account never sees notes', async ({
  page,
  context,
}) => {
  const member = await fakeConsole.newMember('Private planner', { guild: null });
  await context.setExtraHTTPHeaders({ Cookie: member.cookie });
  await page.goto('/tasks');
  const list = page.getByRole('region', { name: 'Personal task list' });
  await list.getByRole('button', { name: 'New entry' }).click();
  await list.getByLabel('Entry title').fill('Unsaved plan');
  const created = await page.request.post('/api/v2/tasks', {
    headers: { Origin: 'http://127.0.0.1:3100' },
    data: {
      action: 'save',
      revision: null,
      task: {
        id: randomUUID(),
        kind: 'goal',
        title: 'Other tab goal',
        notes: 'Private account notes',
        priority: 'normal',
        dueDate: null,
        target: { type: 'none' },
      },
    },
  });
  expect(created.status()).toBe(200);
  await list.getByRole('button', { name: 'Save entry' }).click();
  await expect(list.getByRole('alert')).toContainText('another tab');
  await expect(list.getByLabel('Entry title')).toHaveValue('Unsaved plan');
  await list.getByRole('button', { name: 'Reload saved list' }).click();
  await expect(list.getByRole('article', { name: 'Other tab goal' })).toBeVisible();
  const other = await fakeConsole.newMember('Other planner', { guild: null });
  await context.setExtraHTTPHeaders({ Cookie: other.cookie });
  await page.goto('/tasks');
  await expect(list.getByRole('status')).toContainText('Saved task list loaded');
  await expect(list.getByRole('article')).toHaveCount(0);
  const response = await page.request.get(`/api/v2/tasks?owner=${member.discordId}`);
  expect(JSON.stringify(await response.json())).not.toContain('Private account notes');
});
test('task editing stays accessible and usable at narrow touch widths, with failures retaining drafts', async ({
  page,
  context,
}, info) => {
  const member = await fakeConsole.newMember('Mobile planner', { guild: null });
  await context.setExtraHTTPHeaders({ Cookie: member.cookie });
  await page.goto('/tasks');
  const list = page.getByRole('region', { name: 'Personal task list' });
  await list.getByRole('button', { name: 'New entry' }).click();
  await list.getByLabel('Entry title').fill('Explore the basin');
  await list.getByLabel('Notes', { exact: true }).fill('Bring water and a spare power pack.');
  await page.evaluate(axeSource);
  for (const width of [320, 393, 412, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  const violations = await page.evaluate(async () => {
    const axe = (
      window as unknown as { axe: { run(node: Document, options: object): Promise<{ violations: unknown[] }> } }
    ).axe;
    return (await axe.run(document, { runOnly: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'] })).violations;
  });
  expect(violations).toEqual([]);
  await page.evaluate(() => {
    (document.activeElement as HTMLElement | null)?.blur();
    window.scrollTo({ top: 0, behavior: 'instant' });
  });
  await page.screenshot({ path: info.outputPath('tasks-desktop.png'), fullPage: true });
  await page.setViewportSize({ width: 393, height: 852 });
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
  await page.screenshot({ path: info.outputPath('tasks-mobile.png'), fullPage: true });
  let writes = 0;
  await page.route('**/api/v2/tasks', async (route) => {
    writes++;
    await route.fulfill({ status: 503, json: { error: 'Task storage is unavailable.' } });
  });
  await list.getByRole('button', { name: 'Save entry' }).tap();
  await expect(list.getByRole('alert')).toContainText('unavailable');
  await expect(list.getByLabel('Entry title')).toHaveValue('Explore the basin');
  expect(writes).toBe(1);
});
