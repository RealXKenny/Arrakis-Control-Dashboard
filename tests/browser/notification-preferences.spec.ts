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
async function setup(page: import('@playwright/test').Page) {
  const member = await fakeConsole.newMember('Notification traveller', {
    guild: null,
    details: {
      vehicles: {
        rows: [
          {
            id: 'prefs-vehicle',
            name: 'Scout',
            owner_name: 'Notification traveller',
            relationship: 'owner',
            condition_percent: 0,
            fuel_percent: 5,
          },
        ],
      },
    },
  });
  await page.context().setExtraHTTPHeaders({ Cookie: member.cookie });
  await page.goto('/inbox');
  await expect(page.getByRole('article', { name: 'Scout: check condition' })).toBeVisible();
  return page.getByRole('region', { name: 'Actionable inbox' });
}
test('dismiss, snooze, restore and reviewed cooldowns persist privately across reload', async ({ page }) => {
  const inbox = await setup(page);
  const condition = inbox.getByRole('article', { name: 'Scout: check condition' });
  await condition.getByRole('button', { name: 'Dismiss', exact: true }).tap();
  await expect(condition).toHaveCount(0);
  await inbox.getByLabel('Show muted alerts').check();
  await expect(condition.getByText('Dismissed', { exact: true })).toBeVisible();
  await page.reload();
  await inbox.getByLabel('Show muted alerts').check();
  await expect(condition.getByText('Dismissed', { exact: true })).toBeVisible();
  await condition.getByRole('button', { name: 'Restore alert' }).click();
  await expect(condition.getByText('Dismissed', { exact: true })).toHaveCount(0);
  await condition.getByRole('button', { name: 'Snooze', exact: true }).click();
  await expect(condition).toContainText('Snoozed until');
  await condition.getByRole('button', { name: 'Restore alert' }).click();
  await inbox.getByText('Notification preferences', { exact: true }).click();
  await inbox.getByLabel('Assets cooldown (minutes)').fill('60');
  await inbox.getByRole('button', { name: 'Save notification preferences' }).click();
  await condition.getByRole('button', { name: 'Reviewed', exact: true }).click();
  await expect(condition).toContainText('Cooldown until');
  await inbox.getByLabel('Show muted alerts').uncheck();
  await expect(condition).toHaveCount(0);
  const other = await fakeConsole.newMember('Other preferences', { guild: null });
  await page.context().setExtraHTTPHeaders({ Cookie: other.cookie });
  const record = await (await page.request.get('/api/v2/inbox/preferences')).json();
  expect(record.record.states).toEqual([]);
  expect(record.record.config.features.assets.cooldownMinutes).toBe(0);
});
test('category preferences and timezone quiet hours mute urgent alerts without hiding source coverage at 320px', async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 320, height: 780 });
  const inbox = await setup(page);
  await inbox.getByText('Notification preferences', { exact: true }).click();
  await inbox.getByLabel('Assets notifications', { exact: true }).uncheck();
  await inbox.getByRole('button', { name: 'Save notification preferences' }).click();
  await expect(inbox.getByRole('article')).toHaveCount(0);
  await inbox.getByLabel('Show muted alerts').check();
  await expect(inbox.getByRole('article').first()).toContainText('Category disabled');
  await inbox.getByLabel('Assets notifications', { exact: true }).check();
  const record = await (await page.request.get('/api/v2/inbox/preferences')).json();
  const hour = new Date(record.checkedAt).getUTCHours();
  await inbox.getByLabel('Enable quiet hours').check();
  await inbox.getByLabel('Quiet hours timezone').fill('UTC');
  await inbox.getByLabel('Quiet hours start').fill(`${String(hour).padStart(2, '0')}:00`);
  await inbox.getByLabel('Quiet hours end').fill(`${String((hour + 2) % 24).padStart(2, '0')}:00`);
  await inbox.getByRole('button', { name: 'Save notification preferences' }).click();
  await expect(inbox.getByRole('article').first()).toContainText('Quiet hours');
  await expect(inbox.getByRole('heading', { name: 'Market · unsupported' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
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
  await page.getByRole('heading', { name: 'Actionable inbox', exact: true }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: info.outputPath('notifications-desktop.png'), fullPage: true });
  await page.setViewportSize({ width: 393, height: 852 });
  await page.screenshot({ path: info.outputPath('notifications-mobile.png'), fullPage: true });
});
test('stale saves and failures retain preference drafts until an explicit reload without retry', async ({ page }) => {
  const inbox = await setup(page);
  await inbox.getByText('Notification preferences', { exact: true }).click();
  await inbox.getByLabel('Assets cooldown (minutes)').fill('45');
  const old = await (await page.request.get('/api/v2/inbox/preferences')).json();
  const saved = await page.request.post('/api/v2/inbox/preferences', {
    headers: { Origin: 'http://127.0.0.1:3100' },
    data: {
      action: 'configure',
      revision: old.record.revision,
      config: {
        ...old.record.config,
        features: { ...old.record.config.features, assets: { enabled: true, cooldownMinutes: 15 } },
      },
    },
  });
  expect(saved.status()).toBe(200);
  await inbox.getByRole('button', { name: 'Save notification preferences' }).click();
  await expect(inbox.getByRole('alert')).toContainText('another tab');
  await expect(inbox.getByLabel('Assets cooldown (minutes)')).toHaveValue('45');
  await inbox.getByRole('button', { name: 'Reload saved settings' }).click();
  await inbox.getByText('Notification preferences', { exact: true }).click();
  await expect(inbox.getByLabel('Assets cooldown (minutes)')).toHaveValue('15');
  await inbox.getByLabel('Assets cooldown (minutes)').fill('90');
  let attempts = 0;
  await page.route('**/api/v2/inbox/preferences', async (route) => {
    attempts++;
    await route.fulfill({ status: 503, json: { error: randomUUID() } });
  });
  await inbox.getByRole('button', { name: 'Save notification preferences' }).click();
  await expect(inbox.getByRole('alert')).toContainText('could not be confirmed');
  await expect(inbox.getByLabel('Assets cooldown (minutes)')).toHaveValue('90');
  expect(attempts).toBe(1);
});
