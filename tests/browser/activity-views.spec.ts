import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { test, expect } from '../helpers/browser-test';
import { fakeConsole } from '../helpers/fake-console-client';
import { defaultActivity, type ActivityView, type ActivityRecord } from '../../src/features/activity-views/model';
import type { TaskRecord } from '../../src/features/tasks/model';
const origin = 'http://127.0.0.1:3100';
const axeSource = readFileSync(createRequire(import.meta.url).resolve('axe-core/axe.min.js'), 'utf8');
const manager = (page: import('@playwright/test').Page) =>
  page.getByRole('region', { name: 'Saved activity views', exact: true });
test.use({ hasTouch: true });
test.afterEach(async () => {
  await fakeConsole.reset();
});
async function member(page: import('@playwright/test').Page) {
  const account = await fakeConsole.newMember('Activity owner', { guild: null, linked: { linked: false } });
  await page.context().setExtraHTTPHeaders({ Cookie: account.cookie });
  return account;
}
async function plans(page: import('@playwright/test').Page) {
  let record: TaskRecord = { schemaVersion: 1, revision: null, tasks: [] };
  const plan = randomUUID();
  for (const [kind, id, title, target] of [
    ['project', plan, 'Relay station', { type: 'none' }],
    ['task', randomUUID(), 'Build relay', { type: 'project', ref: plan }],
    ['task', randomUUID(), 'Unrelated relay', { type: 'none' }],
  ] as const) {
    const response = await page.request.post('/api/v2/tasks', {
      headers: { Origin: origin },
      data: {
        action: 'save',
        revision: record.revision,
        task: { kind, id, title, notes: 'Task note not copied to views', priority: 'normal', dueDate: null, target },
      },
    });
    expect(response.status()).toBe(200);
    record = (await response.json()).record;
  }
  return { plan, record };
}
async function stored(page: import('@playwright/test').Page): Promise<ActivityRecord> {
  return (await (await page.request.get('/api/v2/activity-views')).json()).record;
}
async function save(page: import('@playwright/test').Page, view: ActivityView, revision: string | null = null) {
  const response = await page.request.post('/api/v2/activity-views', {
    headers: { Origin: origin },
    data: { action: 'save', revision, view },
  });
  expect(response.status()).toBe(200);
  return (await response.json()).record as ActivityRecord;
}
test('creates an activity entirely in the editor and restores widgets, map, filters and live planning context across workspaces', async ({
  page,
}) => {
  await member(page);
  const { plan } = await plans(page);
  await page.goto('/activity-views');
  await expect(manager(page).getByRole('status')).toContainText('loaded');
  await manager(page).getByLabel('Activity name', { exact: true }).fill('Building relay');
  await manager(page).getByRole('combobox', { name: 'Briefing map', exact: true }).selectOption('DeepDesert');
  await manager(page).getByRole('button', { name: 'Move Your character up', exact: true }).tap();
  await manager(page).getByRole('checkbox', { name: 'Solari credit', exact: true }).uncheck();
  await manager(page).getByLabel('Saved alert category').selectOption('operations');
  await manager(page).getByLabel('Saved urgent only').check();
  await manager(page).getByLabel('Saved show muted alerts').check();
  await manager(page).getByLabel('Saved entry status').selectOption('all');
  await manager(page).getByLabel('Saved entry type').selectOption('task');
  await manager(page).getByLabel('Saved task search').fill('relay');
  await manager(page).getByLabel('Project or goal context').selectOption(plan);
  await manager(page).getByRole('button', { name: 'Save activity view', exact: true }).click();
  await expect(manager(page).getByRole('status')).toContainText('saved');
  const record = await stored(page);
  const view = record.views[0];
  expect(view).toMatchObject({ name: 'Building relay', planning: { id: plan }, map: 'DeepDesert' });
  expect(JSON.stringify(record)).not.toContain('Task note not copied');
  await manager(page)
    .getByRole('article', { name: 'Building relay', exact: true })
    .getByRole('link', { name: 'Open portal' })
    .click();
  await expect(page.getByRole('region', { name: 'Activity view', exact: true })).toContainText('Building relay');
  expect(
    await page
      .locator('[data-portal-widget]')
      .evaluateAll((nodes) => nodes.map((n) => n.getAttribute('data-portal-widget'))),
  ).toEqual(['character', 'conditions', 'holdings', 'fleet']);
  await expect(
    page.getByRole('group', { name: 'Briefing map' }).getByRole('link', { name: 'Deep Desert', exact: true }),
  ).toHaveAttribute('aria-current', 'page');
  expect((await (await page.request.get('/api/v2/portal/layout')).json()).record).toBeNull();
  await page.getByRole('link', { name: 'Activity inbox', exact: true }).click();
  await expect(page.getByRole('combobox', { name: 'Alert category', exact: true })).toHaveValue('operations');
  await expect(page.getByLabel('Urgent only', { exact: true })).toBeChecked();
  await expect(page.getByLabel('Show muted alerts', { exact: true })).toBeChecked();
  await page.getByRole('link', { name: 'Activity tasks', exact: true }).click();
  const list = page.getByRole('region', { name: 'Personal task list' });
  await expect(list.getByRole('combobox', { name: 'Entry status', exact: true })).toHaveValue('all');
  await expect(list.getByRole('combobox', { name: 'Entry type', exact: true })).toHaveValue('task');
  await expect(list.getByLabel('Search entries')).toHaveValue('relay');
  await expect(list.getByRole('article', { name: 'Build relay', exact: true })).toBeVisible();
  await expect(list.getByRole('article', { name: 'Unrelated relay', exact: true })).toHaveCount(0);
  await page.reload();
  await expect(list.getByLabel('Search entries')).toHaveValue('relay');
});
test('captures current filters, duplicates/renames a setup and confirms deletion without changing source tasks', async ({
  page,
}) => {
  await member(page);
  await plans(page);
  await page.goto('/tasks');
  const list = page.getByRole('region', { name: 'Personal task list' });
  await list.getByRole('combobox', { name: 'Entry status', exact: true }).selectOption('completed');
  await list.getByLabel('Search entries').fill('relay');
  const capture = list.getByRole('region', { name: 'Capture activity settings' });
  await capture.getByRole('button', { name: 'Save current settings as activity' }).click();
  await expect(capture.getByRole('status')).toContainText('loaded');
  await capture.getByLabel('New activity name').fill('Completed work');
  await capture.getByRole('button', { name: 'Create from current settings' }).click();
  await expect(capture.getByRole('status')).toContainText('saved');
  expect((await stored(page)).views[0].tasks).toMatchObject({ status: 'completed', query: 'relay' });
  await page.goto('/activity-views');
  await expect(manager(page).getByRole('status')).toContainText('loaded');
  await manager(page)
    .getByRole('article', { name: 'Completed work', exact: true })
    .getByRole('button', { name: 'Duplicate view' })
    .click();
  await expect(manager(page).getByLabel('Activity name', { exact: true })).toHaveValue('Completed work copy');
  await manager(page).getByLabel('Activity name', { exact: true }).fill('Supply run');
  await manager(page).getByRole('button', { name: 'Save activity view', exact: true }).click();
  await expect(manager(page).getByRole('article', { name: 'Supply run', exact: true })).toBeVisible();
  const card = manager(page).getByRole('article', { name: 'Completed work', exact: true });
  await card.getByRole('button', { name: 'Review view deletion' }).click();
  await card.getByRole('button', { name: 'Keep view' }).click();
  expect((await stored(page)).views).toHaveLength(2);
  await card.getByRole('button', { name: 'Review view deletion' }).click();
  await card.getByRole('button', { name: 'Confirm delete view' }).click();
  await expect(card).toHaveCount(0);
  await expect(manager(page).getByRole('heading', { name: 'Saved setups (1 / 12)' })).toBeFocused();
  expect((await (await page.request.get('/api/v2/tasks')).json()).record.tasks).toHaveLength(3);
});
test('isolates accounts and handles stale edits and uncertain saves without retrying or discarding drafts', async ({
  page,
  browser,
}) => {
  const owner = await member(page);
  const view = { ...defaultActivity(), id: randomUUID(), name: 'Private activity' };
  const record = await save(page, view);
  await page.goto('/activity-views');
  await expect(manager(page).getByRole('status')).toContainText('loaded');
  await manager(page).getByRole('article', { name: view.name }).getByRole('button', { name: 'Edit view' }).click();
  await manager(page).getByLabel('Activity name', { exact: true }).fill('Draft kept');
  await save(page, { ...view, name: 'Newer saved name' }, record.revision);
  await manager(page).getByRole('button', { name: 'Save activity view', exact: true }).click();
  await expect(manager(page).getByRole('alert')).toContainText('changed');
  await expect(manager(page).getByLabel('Activity name', { exact: true })).toHaveValue('Draft kept');
  await expect(manager(page).getByRole('button', { name: 'Save activity view', exact: true })).toBeDisabled();
  await manager(page).getByRole('button', { name: 'Reload views and discard draft' }).click();
  await expect(manager(page).getByRole('status')).toContainText('loaded');
  let writes = 0;
  await page.route('**/api/v2/activity-views', (route) => {
    if (route.request().method() !== 'POST') return route.continue();
    writes++;
    return route.fulfill({ status: 503, json: { error: 'private provider detail' } });
  });
  await manager(page).getByLabel('Activity name', { exact: true }).fill('Uncertain draft');
  await manager(page).getByRole('button', { name: 'Save activity view', exact: true }).click();
  await expect(manager(page).getByRole('alert')).toContainText('could not be confirmed');
  expect(writes).toBe(1);
  await expect(manager(page).getByLabel('Activity name', { exact: true })).toHaveValue('Uncertain draft');
  await page.unroute('**/api/v2/activity-views');
  await manager(page).getByRole('button', { name: 'Reload views and discard draft' }).click();
  await expect(manager(page).getByRole('status')).toContainText('loaded');
  await manager(page).getByLabel('Activity name', { exact: true }).fill('Malformed response draft');
  await page.route('**/api/v2/activity-views', (route) =>
    route.request().method() === 'POST'
      ? route.fulfill({ status: 200, json: { record: { schemaVersion: 'private malformed detail' } } })
      : route.continue(),
  );
  await manager(page).getByRole('button', { name: 'Save activity view', exact: true }).click();
  await expect(manager(page).getByRole('alert')).toContainText('could not be confirmed');
  await expect(manager(page)).not.toContainText('private malformed detail');
  await expect(manager(page).getByLabel('Activity name', { exact: true })).toHaveValue('Malformed response draft');
  await page.unroute('**/api/v2/activity-views');
  const other = await fakeConsole.newMember('Other activity member', { guild: null, linked: { linked: false } });
  await page.context().setExtraHTTPHeaders({ Cookie: other.cookie });
  expect((await stored(page)).views).toEqual([]);
  await page.goto(`/tasks?activity=${view.id}`);
  await expect(page.getByRole('region', { name: 'Activity view', exact: true }).getByRole('alert')).toContainText(
    'unavailable for your account',
  );
  await expect(page.getByRole('region', { name: 'Personal task list' })).toHaveCount(0);
  expect(
    (
      await page.request.post('/api/v2/activity-views', {
        headers: { Origin: origin },
        data: { action: 'delete', revision: record.revision, id: view.id, confirmed: true },
      })
    ).status(),
  ).toBe(409);
  await page.context().setExtraHTTPHeaders({ Cookie: owner.cookie });
  expect((await stored(page)).views[0].name).toBe('Newer saved name');
  const anonymous = await browser.newContext();
  try {
    const tab = await anonymous.newPage();
    await tab.goto('/activity-views');
    await expect(tab).toHaveURL(/\/login/);
  } finally {
    await anonymous.close();
  }
});
test('deleted planning context never broadens to unrelated plans and cannot be silently resaved', async ({ page }) => {
  await member(page);
  const { plan, record: tasks } = await plans(page);
  const view = {
    ...defaultActivity(),
    id: randomUUID(),
    name: 'Relay planning',
    planning: { kind: 'project' as const, id: plan },
  };
  const saved = await save(page, view);
  expect(
    (
      await page.request.post('/api/v2/personal-data/delete', {
        headers: { Origin: origin },
        data: { scope: 'tasks', revision: tasks.revision, confirmation: 'DELETE MY DATA' },
      })
    ).status(),
  ).toBe(200);
  const empty = (await (await page.request.get('/api/v2/tasks')).json()).record;
  await page.request.post('/api/v2/tasks', {
    headers: { Origin: origin },
    data: {
      action: 'save',
      revision: empty.revision,
      task: {
        id: randomUUID(),
        kind: 'task',
        title: 'Unrelated current task',
        notes: '',
        priority: 'normal',
        dueDate: null,
        target: { type: 'none' },
      },
    },
  });
  await page.goto(`/tasks?activity=${view.id}`);
  const list = page.getByRole('region', { name: 'Personal task list' });
  await expect(list.getByRole('alert')).toContainText('context is no longer available');
  await expect(list.getByRole('article', { name: 'Unrelated current task' })).toHaveCount(0);
  expect(
    (
      await page.request.post('/api/v2/activity-views', {
        headers: { Origin: origin },
        data: { action: 'save', revision: saved.revision, view },
      })
    ).status(),
  ).toBe(409);
});
test('personal data export/erase includes saved views and fences stale restoration while preserving notes', async ({
  page,
}) => {
  await member(page);
  await plans(page);
  const view = { ...defaultActivity(), id: randomUUID(), name: 'Export this setup' };
  const saved = await save(page, view);
  await page.goto('/personal-data');
  const data = page.getByRole('region', { name: 'Personal data center', exact: true });
  await expect(data.getByRole('status')).toContainText('loaded');
  await data.getByRole('checkbox', { name: 'Include notes and plans in export' }).uncheck();
  await data.getByRole('checkbox', { name: 'Include sharing drafts and snapshots in export' }).uncheck();
  const downloadEvent = page.waitForEvent('download');
  await data.getByRole('button', { name: 'Export selected data' }).click();
  const downloaded = JSON.parse(readFileSync((await (await downloadEvent).path())!, 'utf8'));
  expect(downloaded.records).toHaveLength(1);
  expect(downloaded.records[0]).toMatchObject({ scope: 'views', data: { views: [{ name: 'Export this setup' }] } });
  expect(JSON.stringify(downloaded)).not.toContain('Task note not copied');
  await data.getByRole('button', { name: 'Review deletion of saved activity views' }).click();
  await data.getByLabel('Type DELETE MY DATA to confirm').fill('DELETE MY DATA');
  await data.getByRole('button', { name: 'Permanently erase this scope' }).click();
  await expect(data.getByRole('status')).toContainText('content erased');
  expect((await stored(page)).views).toEqual([]);
  expect(
    (
      await page.request.post('/api/v2/activity-views', {
        headers: { Origin: origin },
        data: { action: 'save', revision: saved.revision, view },
      })
    ).status(),
  ).toBe(409);
  expect((await (await page.request.get('/api/v2/tasks')).json()).record.tasks).toHaveLength(3);
  await page.goto(`/portal?activity=${view.id}`);
  await expect(page.getByRole('region', { name: 'Your portal widgets' })).toHaveCount(0);
});
test('editor supports keyboard/touch, responsive WCAG AA and reduced motion with running-app screenshots', async ({
  page,
}, info) => {
  await member(page);
  await page.goto('/activity-views');
  await expect(manager(page).getByRole('status')).toContainText('loaded');
  await manager(page).getByLabel('Activity name', { exact: true }).fill('Desert expedition');
  await manager(page).getByRole('combobox', { name: 'Briefing map', exact: true }).selectOption('DeepDesert');
  await manager(page).getByRole('button', { name: 'Save activity view', exact: true }).tap();
  await expect(manager(page).getByRole('article', { name: 'Desert expedition' })).toBeVisible();
  await manager(page)
    .getByRole('article', { name: 'Desert expedition' })
    .getByRole('button', { name: 'Edit view' })
    .click();
  await expect(manager(page).getByRole('heading', { name: 'Edit activity view' })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(manager(page).getByLabel('Activity name', { exact: true })).toBeFocused();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.evaluate(axeSource);
  for (const width of [320, 393, 412, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    if (width === 320 || width === 1440)
      expect(
        await page.evaluate(
          async () =>
            (
              await (
                window as unknown as { axe: { run(doc: Document, opts: object): Promise<{ violations: unknown[] }> } }
              ).axe.run(document, { runOnly: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'] })
            ).violations,
        ),
      ).toEqual([]);
  }
  for (const [name, width, height] of [
    ['activity-views-desktop.png', 1440, 1000],
    ['activity-views-mobile.png', 393, 852],
  ] as const) {
    await page.setViewportSize({ width, height });
    await page.evaluate(async () => {
      (document.activeElement as HTMLElement | null)?.blur();
      window.scrollTo({ top: 0, behavior: 'instant' });
      await document.fonts.ready;
      await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
    });
    await page.screenshot({ path: info.outputPath(name), fullPage: true, animations: 'disabled' });
  }
});
