import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import { test, expect } from '../helpers/browser-test';
import { fakeConsole } from '../helpers/fake-console-client';
test.use({ hasTouch: true });
test.afterEach(async () => {
  await fakeConsole.reset();
});
const origin = 'http://127.0.0.1:3100';
const axeSource = readFileSync(createRequire(import.meta.url).resolve('axe-core/axe.min.js'), 'utf8');
const center = (page: import('@playwright/test').Page) =>
  page.getByRole('region', { name: 'Personal data center', exact: true });
async function seed(page: import('@playwright/test').Page) {
  const member = await fakeConsole.newMember('Personal data owner', { guild: null, linked: { linked: false } });
  await page.context().setExtraHTTPHeaders({ Cookie: member.cookie });
  let record = { revision: null as string | null, tasks: [] };
  for (const kind of ['project', 'goal', 'task']) {
    const response = await page.request.post('/api/v2/tasks', {
      headers: { Origin: origin },
      data: {
        action: 'save',
        revision: record.revision,
        task: {
          id: randomUUID(),
          kind,
          title: `Private ${kind}`,
          notes: 'Only my exported notes',
          priority: 'normal',
          dueDate: null,
          target: { type: 'none' },
        },
      },
    });
    expect(response.status()).toBe(200);
    record = (await response.json()).record;
  }
  const sharing = await page.request.post('/api/v2/privacy', {
    headers: { Origin: origin },
    data: {
      action: 'publish',
      revision: null,
      confirmed: true,
      hours: 1,
      card: { category: 'profile', data: { displayName: 'Chosen sharing profile', about: 'Private sharing snapshot' } },
    },
  });
  expect(sharing.status()).toBe(200);
  const privacy = (await sharing.json()).record;
  await page.goto('/personal-data');
  await expect(center(page).getByRole('status')).toContainText('summary loaded');
  return { member, record, privacy };
}
async function erase(page: import('@playwright/test').Page, label: string) {
  await center(page)
    .getByRole('button', { name: `Review deletion of ${label}` })
    .click();
  await center(page).getByLabel('Type DELETE MY DATA to confirm').fill('DELETE MY DATA');
  await center(page).getByRole('button', { name: 'Permanently erase this scope' }).click();
  await expect(center(page).getByRole('status')).toContainText('content erased');
}
test('exports selected real notes/plans and snapshots, then deletes each scope with link revocation and stale-save fencing', async ({
  page,
}) => {
  const { record, privacy } = await seed(page);
  const sharingCheck = center(page).getByRole('checkbox', { name: 'Include sharing drafts and snapshots in export' });
  await center(page).getByRole('checkbox', { name: 'Include saved activity views in export' }).uncheck();
  await sharingCheck.uncheck();
  let event = page.waitForEvent('download');
  await center(page).getByRole('button', { name: 'Export selected data' }).click();
  let download = await event;
  let file = JSON.parse(readFileSync((await download.path())!, 'utf8'));
  expect(file.records).toHaveLength(1);
  expect(file.records[0].scope).toBe('tasks');
  expect(file.records[0].data.tasks).toHaveLength(3);
  await sharingCheck.check();
  event = page.waitForEvent('download');
  await center(page).getByRole('button', { name: 'Export selected data' }).click();
  download = await event;
  file = JSON.parse(readFileSync((await download.path())!, 'utf8'));
  expect(file.records).toHaveLength(2);
  expect(JSON.stringify(file)).toContain('Private sharing snapshot');
  expect(JSON.stringify(file)).not.toMatch(/shareId|dashboard_session|arrakis:/);
  await center(page).getByRole('button', { name: 'Review deletion of notes and plans' }).click();
  await center(page).getByLabel('Type DELETE MY DATA to confirm').fill('DELETE');
  await expect(center(page).getByRole('button', { name: 'Permanently erase this scope' })).toBeDisabled();
  await center(page).getByLabel('Type DELETE MY DATA to confirm').fill('DELETE MY DATA');
  await center(page).getByRole('button', { name: 'Permanently erase this scope' }).click();
  await expect(center(page).getByRole('status')).toContainText('content erased');
  const cleared = (await (await page.request.get('/api/v2/tasks')).json()).record;
  expect(cleared.tasks).toEqual([]);
  expect(cleared.revision).not.toBe(record.revision);
  expect((await page.request.get(`/api/v2/privacy/shared/${privacy.shareId}`)).status()).toBe(200);
  const stale = await page.request.post('/api/v2/tasks', {
    headers: { Origin: origin },
    data: {
      action: 'save',
      revision: record.revision,
      task: {
        id: randomUUID(),
        kind: 'task',
        title: 'Stale restoration',
        notes: '',
        priority: 'normal',
        dueDate: null,
        target: { type: 'none' },
      },
    },
  });
  expect(stale.status()).toBe(409);
  await erase(page, 'sharing drafts and snapshots');
  expect((await page.request.get(`/api/v2/privacy/shared/${privacy.shareId}`)).status()).toBe(404);
  const blank = (await (await page.request.get('/api/v2/privacy')).json()).record;
  expect(blank.drafts.profile.about).toBe('');
  expect(Object.values(blank.publications).every((v) => v === null)).toBe(true);
  expect(
    (await fakeConsole.requests()).filter(
      (r) =>
        (r.path.startsWith('/api/players/') && !r.path.startsWith('/api/players/online?')) ||
        /add-currency|add-item/.test(r.path),
    ),
  ).toEqual([]);
});
test('another account cannot export or erase the owner data and anonymous access is denied', async ({
  page,
  browser,
}) => {
  const { member, record } = await seed(page);
  const other = await fakeConsole.newMember('Different account', { guild: null, linked: { linked: false } });
  await page.context().setExtraHTTPHeaders({ Cookie: other.cookie });
  await page.goto('/personal-data');
  await expect(center(page)).toContainText('0 saved tasks');
  const summary = await (await page.request.get(`/api/v2/personal-data?owner=${member.discordId}`)).json();
  expect(summary.scopes[0].entries).toBe(0);
  expect(
    (
      await page.request.post('/api/v2/personal-data/delete', {
        headers: { Origin: origin },
        data: { scope: 'tasks', revision: record.revision, confirmation: 'DELETE MY DATA' },
      })
    ).status(),
  ).toBe(409);
  await page.context().setExtraHTTPHeaders({ Cookie: member.cookie });
  expect((await (await page.request.get('/api/v2/tasks')).json()).record.tasks).toHaveLength(3);
  const anonymous = await browser.newContext();
  try {
    const tab = await anonymous.newPage();
    await tab.goto('/personal-data');
    await expect(tab).toHaveURL(/\/login/);
    expect((await anonymous.request.get(`${origin}/api/v2/personal-data`)).status()).toBe(401);
  } finally {
    await anonymous.close();
  }
});
test('stale reviews and failed erasure require an explicit reload without retries or false success', async ({
  page,
}) => {
  const { record } = await seed(page);
  await center(page).getByRole('button', { name: 'Review deletion of notes and plans' }).click();
  await page.request.post('/api/v2/tasks', {
    headers: { Origin: origin },
    data: {
      action: 'save',
      revision: record.revision,
      task: {
        id: randomUUID(),
        kind: 'task',
        title: 'Newer note',
        notes: '',
        priority: 'normal',
        dueDate: null,
        target: { type: 'none' },
      },
    },
  });
  await center(page).getByLabel('Type DELETE MY DATA to confirm').fill('DELETE MY DATA');
  await center(page).getByRole('button', { name: 'Permanently erase this scope' }).click();
  await expect(center(page).getByRole('alert')).toContainText('Data changed');
  await expect(center(page).getByRole('button', { name: 'Permanently erase this scope' })).toBeDisabled();
  await center(page).getByRole('button', { name: 'Reload data summary' }).click();
  await expect(center(page)).toContainText('4 saved tasks');
  let writes = 0;
  await page.route('**/api/v2/personal-data/delete', (route) => {
    writes++;
    return route.fulfill({ status: 503, json: { error: 'private provider detail' } });
  });
  await center(page).getByRole('button', { name: 'Review deletion of notes and plans' }).click();
  await center(page).getByLabel('Type DELETE MY DATA to confirm').fill('DELETE MY DATA');
  await center(page).getByRole('button', { name: 'Permanently erase this scope' }).click();
  await expect(center(page).getByRole('alert')).toContainText('could not be confirmed');
  await expect(center(page)).not.toContainText('private provider detail');
  expect(writes).toBe(1);
  expect((await (await page.request.get('/api/v2/tasks')).json()).record.tasks).toHaveLength(4);
});
test('an already-open task editor cannot restore erased notes with its old revision', async ({ page }) => {
  await seed(page);
  const editor = await page.context().newPage();
  try {
    await editor.goto('/tasks');
    const list = editor.getByRole('region', { name: 'Personal task list' });
    await list
      .getByRole('article', { name: 'Private task', exact: true })
      .getByRole('button', { name: 'Edit entry' })
      .click();
    await list.getByLabel('Entry title').fill('Old tab draft');
    await erase(page, 'notes and plans');
    await list.getByRole('button', { name: 'Save entry' }).click();
    await expect(list.getByRole('alert')).toContainText('another tab');
    await expect(list.getByLabel('Entry title')).toHaveValue('Old tab draft');
    expect((await (await page.request.get('/api/v2/tasks')).json()).record.tasks).toEqual([]);
  } finally {
    await editor.close();
  }
});
test('deletion review supports keyboard, touch, reduced motion and responsive WCAG AA', async ({ page }, info) => {
  await seed(page);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await center(page).getByRole('button', { name: 'Review deletion of notes and plans' }).tap();
  await expect(center(page).getByRole('heading', { name: 'Erase notes and plans?' })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(center(page).getByLabel('Type DELETE MY DATA to confirm')).toBeFocused();
  await page.evaluate(axeSource);
  for (const width of [320, 393, 412, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    if (width === 320 || width === 1440) {
      const violations = await page.evaluate(async () => {
        const axe = (
          window as unknown as { axe: { run(doc: Document, opts: object): Promise<{ violations: unknown[] }> } }
        ).axe;
        return (await axe.run(document, { runOnly: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'] })).violations;
      });
      expect(violations).toEqual([]);
    }
  }
  for (const [name, width, height] of [
    ['personal-data-desktop.png', 1440, 1000],
    ['personal-data-mobile.png', 393, 852],
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
  await center(page).getByRole('button', { name: 'Keep my data' }).click();
  await expect(center(page).getByRole('region', { name: 'Review personal data deletion' })).toHaveCount(0);
  await expect(center(page).getByRole('button', { name: 'Review deletion of notes and plans' })).toBeFocused();
  expect((await (await page.request.get('/api/v2/tasks')).json()).record.tasks).toHaveLength(3);
});
