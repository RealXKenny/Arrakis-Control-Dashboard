import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import { test, expect } from '../helpers/browser-test';
import { fakeConsole } from '../helpers/fake-console-client';
import { defaultNotifications } from '../../src/features/inbox/preferences';
test.use({ hasTouch: true });
test.afterEach(async () => {
  await fakeConsole.reset();
});
const axeSource = readFileSync(createRequire(import.meta.url).resolve('axe-core/axe.min.js'), 'utf8');
const categories = ['assets', 'supply', 'market', 'operations', 'events', 'maintenance', 'assistance'];
async function setup(page: import('@playwright/test').Page) {
  const member = await fakeConsole.newMember('Freshness traveller', { guild: null });
  await page.context().setExtraHTTPHeaders({ Cookie: member.cookie });
  const now = Date.now();
  await page.clock.install({ time: now });
  return now;
}
function inbox(now: number, readAt: string, scope = 'a'.repeat(64)) {
  return {
    data: {
      checkedAt: new Date(now).toISOString(),
      alerts: [
        {
          id: 'private-alert',
          category: 'assets',
          priority: 'urgent',
          title: 'Private base reading',
          detail: 'Reported water is low.',
          action: 'Check base',
          href: '/holdings',
        },
      ],
      sources: categories.map((category) => ({
        category,
        status: category === 'market' ? 'unsupported' : 'checked',
        detail: category === 'market' ? 'Price watch monitoring is unsupported.' : 'Source checked.',
        context: category === 'market' ? null : scope,
        readAt: category === 'market' ? null : readAt,
      })),
    },
    notifications: { record: defaultNotifications(), checkedAt: new Date(now).toISOString() },
  };
}
test('source timestamps age without polling and failed refreshes preserve time without private cards', async ({
  page,
}) => {
  const now = await setup(page);
  const readAt = new Date(now - 20000).toISOString();
  let reads = 0;
  let outage = false;
  await page.route('**/api/v2/inbox', (route) => {
    reads++;
    return outage
      ? route.fulfill({ status: 503, json: { error: 'private provider detail' } })
      : route.fulfill({ json: inbox(now, readAt) });
  });
  await page.goto('/inbox');
  const source = page.getByRole('group', { name: 'Assets source freshness', exact: true });
  await expect(source).toContainText('Fresh');
  await expect(source.locator('time').first()).toHaveAttribute('datetime', readAt);
  await expect(page.getByRole('group', { name: 'Market source freshness', exact: true })).toContainText('Unsupported');
  await page.clock.fastForward(65000);
  await expect(source).toContainText('Stale');
  expect(reads).toBe(1);
  outage = true;
  await page.getByRole('button', { name: 'Refresh inbox', exact: true }).click();
  await expect(source).toContainText('Outage');
  await expect(source.locator('time').first()).toHaveAttribute('datetime', readAt);
  await expect(page.getByRole('article', { name: 'Private base reading' })).toHaveCount(0);
  await expect(page.getByRole('region', { name: 'Actionable inbox' })).not.toContainText('private provider detail');
  expect(reads).toBe(2);
  outage = false;
  await page.getByRole('button', { name: 'Refresh inbox', exact: true }).click();
  await expect(source).toContainText('Stale');
  await expect(source.locator('time').first()).toHaveAttribute('datetime', readAt);
});
test('verified source context changes, unlinked states and hidden documents discard prior success metadata', async ({
  page,
}) => {
  const now = await setup(page);
  const stamp = new Date(now).toISOString();
  let body = inbox(now, stamp);
  await page.route('**/api/v2/inbox', (route) => route.fulfill({ json: body }));
  await page.goto('/inbox');
  const source = page.getByRole('group', { name: 'Supply source freshness', exact: true });
  await expect(source).toContainText(`${stamp.slice(0, 10)} ${stamp.slice(11, 19)} UTC`);
  await expect(source.locator('time').first()).toHaveAttribute('datetime', stamp);
  body = inbox(now, stamp, 'b'.repeat(64));
  body.data.sources[1] = { ...body.data.sources[1], status: 'unavailable', readAt: null };
  await page.getByRole('button', { name: 'Refresh inbox', exact: true }).click();
  await expect(source).toContainText('No successful read');
  body.data.sources[1] = { ...body.data.sources[1], status: 'unlinked', context: null };
  await page.getByRole('button', { name: 'Refresh inbox', exact: true }).click();
  await expect(source).toContainText('Character link required');
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, value: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect(page.getByRole('group', { name: 'Inbox response freshness', exact: true })).toContainText('Paused');
  await expect(page.getByRole('article')).toHaveCount(0);
});
test('pinned counts clear during outages and authorization failures cannot retain a successful history', async ({
  page,
}) => {
  const now = await setup(page);
  const stamp = new Date(now - 10000).toISOString();
  const revision = randomUUID();
  let status = 200;
  await page.route('**/api/v2/items/pins', (route) =>
    route.fulfill({ json: { revision, pins: [{ name: 'Spice', templateId: 'Spice' }] } }),
  );
  await page.route('**/api/v2/items/pins/readings', (route) =>
    status === 200
      ? route.fulfill({
          json: {
            revision,
            counters: [{ templateId: 'Spice', name: 'Spice', quantity: '987654321', complete: true }],
            coverage: {
              startedAt: new Date(now - 20000).toISOString(),
              limited: false,
              sources: [{ name: 'Backpack', status: 'ok', detail: 'Checked', checkedAt: stamp }],
            },
          },
        })
      : route.fulfill({ status, json: { error: 'Counts unavailable.' } }),
  );
  await page.goto('/storage');
  const counter = page.getByRole('list', { name: 'Pinned item counters' });
  const health = page.getByRole('group', { name: 'Pinned counter freshness' });
  await page.getByRole('button', { name: 'Refresh counts', exact: true }).click();
  await expect(counter).toContainText('987654321');
  await expect(health.locator('time').first()).toHaveAttribute('datetime', stamp);
  status = 503;
  await page.getByRole('button', { name: 'Refresh counts', exact: true }).click();
  await expect(counter).not.toContainText('987654321');
  await expect(counter).toContainText('Not checked');
  await expect(health).toContainText('Outage');
  await expect(health.locator('time').first()).toHaveAttribute('datetime', stamp);
  status = 403;
  await page.getByRole('button', { name: 'Refresh counts', exact: true }).click();
  await expect(health).toContainText('No successful read');
});
test('finder freshness uses actual source observations, marks partial coverage and resets for another query', async ({
  page,
}) => {
  const now = await setup(page);
  const stamp = new Date(now - 5000).toISOString();
  let outage = false;
  await page.route('**/api/v2/items/find?*', (route) =>
    outage
      ? route.fulfill({ status: 503, json: { error: 'Search unavailable.' } })
      : route.fulfill({
          json: {
            startedAt: new Date(now - 30000).toISOString(),
            limited: true,
            items: [],
            sources: [
              { name: 'Backpack', status: 'ok', detail: 'Checked', checkedAt: stamp },
              {
                name: 'Unknown source',
                status: 'unavailable',
                detail: 'Unavailable',
                checkedAt: new Date(now).toISOString(),
              },
            ],
          },
        }),
  );
  await page.goto('/storage');
  const query = page.getByRole('searchbox', { name: 'Find across your assets' });
  await query.fill('Spice');
  await page.getByRole('button', { name: 'Find items', exact: true }).click();
  const health = page.getByRole('group', { name: 'Item search freshness' });
  await expect(health).toContainText('partial coverage');
  await expect(health.locator('time').first()).toHaveAttribute('datetime', stamp);
  outage = true;
  await page.getByRole('button', { name: 'Find items', exact: true }).click();
  await expect(health).toContainText('Outage');
  await expect(health.locator('time').first()).toHaveAttribute('datetime', stamp);
  await query.fill('Water');
  await expect(health).toContainText('No successful read');
});
test('command lookup reports freshness without automatic scans and monitoring indicators remain accessible', async ({
  page,
}, info) => {
  const now = await setup(page);
  const stamp = new Date(now - 10000).toISOString();
  let reads = 0;
  await page.route('**/api/v2/commands/assets?*', (route) => {
    reads++;
    return route.fulfill({ json: { checkedAt: stamp, partial: true, assets: [] } });
  });
  await page.goto('/portal');
  await page.waitForFunction(() => document.documentElement.dataset.commandPalette === 'ready');
  await page.keyboard.press('Control+k');
  const dialog = page.getByRole('dialog', { name: 'Command palette' });
  await dialog.getByRole('button', { name: 'Asset lookup', exact: true }).click();
  await dialog.getByRole('searchbox').fill('Scout');
  const health = dialog.getByRole('group', { name: 'Command asset freshness' });
  await expect(health).toContainText('No successful read');
  expect(reads).toBe(0);
  await dialog.getByRole('button', { name: 'Search bases and vehicles' }).click();
  await expect(health).toContainText('partial coverage');
  await page.clock.fastForward(65000);
  await expect(health).toContainText('Stale');
  expect(reads).toBe(1);
  await dialog.getByRole('searchbox').fill('Different');
  await expect(health).toContainText('No successful read');
  await page.keyboard.press('Escape');
  await page.route('**/api/v2/inbox', (route) =>
    route.fulfill({ json: inbox(now, new Date(now - 120000).toISOString()) }),
  );
  await page.goto('/inbox');
  await expect(page.getByRole('group', { name: 'Assets source freshness', exact: true })).toContainText('Stale');
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
    ['freshness-desktop.png', 1440, 1000],
    ['freshness-mobile.png', 393, 852],
  ] as const) {
    await page.setViewportSize({ width, height });
    await page.evaluate(async () => {
      await document.fonts.ready;
      window.scrollTo(0, 0);
    });
    await page.screenshot({ path: info.outputPath(name), fullPage: true, animations: 'disabled' });
  }
});

test("client-side Storage navigation cannot carry another account's counter readings or success history", async ({
  page,
}) => {
  const owner = await fakeConsole.newMember('Freshness owner A', { guild: null });
  const other = await fakeConsole.newMember('Freshness owner B', { guild: null });
  await page.context().setExtraHTTPHeaders({ Cookie: owner.cookie });
  const saved = await page.request.post('/api/v2/items/pins', {
    headers: { Origin: 'http://127.0.0.1:3100' },
    data: { revision: null, pins: [{ templateId: 'Spice', name: 'Private pinned spice' }] },
  });
  expect(saved.status()).toBe(200);
  const record = await saved.json();
  const stamp = new Date().toISOString();
  await page.route('**/api/v2/items/pins/readings', (route) =>
    route.fulfill({
      json: {
        revision: record.revision,
        counters: [{ templateId: 'Spice', name: 'Private pinned spice', quantity: '123456789', complete: true }],
        coverage: {
          startedAt: stamp,
          limited: false,
          sources: [{ name: 'Backpack', status: 'ok', checkedAt: stamp, detail: 'Checked' }],
        },
      },
    }),
  );
  await page.goto('/storage');
  await page.getByRole('button', { name: 'Refresh counts', exact: true }).click();
  const counters = page.getByRole('list', { name: 'Pinned item counters' });
  await expect(counters).toContainText('123456789');
  await page.context().setExtraHTTPHeaders({ Cookie: other.cookie });
  await page.getByRole('group', { name: 'Storage layout' }).getByRole('link', { name: 'list', exact: true }).click();
  await expect(page).toHaveURL(/layout=list/);
  await expect(counters).not.toContainText('Private pinned spice');
  await expect(counters).not.toContainText('123456789');
  await expect(page.getByRole('group', { name: 'Pinned counter freshness' })).toContainText('No successful read');
});
