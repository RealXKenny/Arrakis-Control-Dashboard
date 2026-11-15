import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import { test, expect } from '../helpers/browser-test';
import { fakeConsole } from '../helpers/fake-console-client';
const axeSource = readFileSync(createRequire(import.meta.url).resolve('axe-core/axe.min.js'), 'utf8');
test.use({ hasTouch: true });
test.afterEach(async () => {
  await fakeConsole.reset();
});

test('solo members can inspect real reported asset alerts and filter at mobile widths', async ({
  page,
  context,
}, info) => {
  const member = await fakeConsole.newMember('Solo inbox', {
    guild: null,
    details: {
      vehicles: {
        rows: [
          {
            id: 'personal-vehicle',
            name: 'Solo scout',
            owner_name: 'Solo inbox',
            relationship: 'owner',
            condition_percent: 0,
            fuel_percent: 5,
          },
        ],
      },
    },
  });
  await context.setExtraHTTPHeaders({ Cookie: member.cookie });
  await page.goto('/inbox');
  const inbox = page.getByRole('region', { name: 'Actionable inbox' });
  await expect(inbox.getByRole('article', { name: 'Solo scout: check condition' })).toBeVisible();
  await expect(inbox.getByText(/Personal market-price alerts/)).toBeVisible();
  await inbox.getByLabel('Urgent only').check();
  await expect(inbox.getByRole('article')).toHaveCount(1);
  await inbox.getByLabel('Alert category').selectOption('market');
  await expect(inbox.getByRole('article')).toHaveCount(0);
  await expect(inbox.getByText(/No actionable alerts match/)).toBeVisible();
  await inbox.getByLabel('Alert category').selectOption('all');
  await inbox.getByLabel('Urgent only').uncheck();
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
  await page.screenshot({ path: info.outputPath('inbox-desktop.png'), fullPage: true });
  await page.setViewportSize({ width: 393, height: 852 });
  await page.screenshot({ path: info.outputPath('inbox-mobile.png'), fullPage: true });
  await inbox.getByRole('article', { name: 'Solo scout: check condition' }).getByRole('link').click();
  await expect(page).toHaveURL(/\/vehicles#vehicle-personal-vehicle/);
  const requests = await fakeConsole.requests();
  expect(
    requests
      // The existing adapter resolves a character through POST /players/me; it does not mutate the game.
      .filter(
        (r) => r.path.startsWith('/api/') && r.path !== '/api/integrations/discord/players/me' && r.method !== 'GET',
      )
      .map(({ method, path }) => ({ method, path })),
  ).toEqual([]);
});

test('verified guild operations appear with working briefings but never leak to another member', async ({
  page,
  context,
}) => {
  const member = await fakeConsole.newMember('Inbox leader', { guild: { id: '2', role: 100 } });
  await context.setExtraHTTPHeaders({ Cookie: member.cookie });
  const save = await page.request.post('/api/v2/guilds/2/operations', {
    headers: { Origin: 'http://127.0.0.1:3100' },
    data: {
      action: 'save',
      revision: null,
      operation: {
        id: randomUUID(),
        title: 'Private inbox sortie',
        kind: 'deep-desert',
        details: 'Private briefing',
        meetingPoint: 'Guild base',
        startsAt: new Date(Date.now() + 3600000).toISOString(),
        endsAt: new Date(Date.now() + 7200000).toISOString(),
        roles: [{ role: 'scout', capacity: 2 }],
      },
    },
  });
  expect(save.status()).toBe(200);
  await page.goto('/inbox');
  const article = page.getByRole('article', { name: 'Private inbox sortie' });
  await expect(article).toBeVisible();
  await article.getByRole('link', { name: /Read operation briefing/ }).click();
  await expect(page).toHaveURL(/tab=operations/);
  await expect(page.getByRole('article', { name: 'Private inbox sortie' })).toBeVisible();
  const solo = await fakeConsole.newMember('Isolated inbox', { guild: null });
  await context.setExtraHTTPHeaders({ Cookie: solo.cookie });
  await page.goto('/inbox');
  await expect(page.getByRole('region', { name: 'Actionable inbox' }).getByRole('status')).toContainText(
    'Sources checked',
  );
  await expect(article).toHaveCount(0);
  expect(JSON.stringify(await (await page.request.get('/api/v2/inbox?guildId=2')).json())).not.toContain(
    'Private inbox sortie',
  );
});

test('failed refresh removes previous details, preserves filters and permits an explicit retry', async ({
  page,
  context,
}) => {
  const member = await fakeConsole.newMember('Inbox failure', { guild: null });
  await context.setExtraHTTPHeaders({ Cookie: member.cookie });
  await page.goto('/inbox');
  const inbox = page.getByRole('region', { name: 'Actionable inbox' });
  await expect(inbox.getByRole('status')).toContainText('Sources checked');
  await inbox.getByLabel('Alert category').selectOption('supply');
  await page.route('**/api/v2/inbox', (route) =>
    route.fulfill({ status: 503, json: { error: 'private upstream failure' } }),
  );
  await inbox.getByRole('button', { name: 'Refresh inbox' }).click();
  await expect(inbox.getByRole('alert')).toContainText('could not be checked');
  await expect(inbox.getByRole('heading', { name: /Assets ·/ })).toHaveCount(0);
  await expect(inbox.getByLabel('Alert category')).toHaveValue('supply');
  await expect(inbox.getByRole('button', { name: 'Refresh inbox' })).toBeEnabled();
  await page.unroute('**/api/v2/inbox');
  await inbox.getByRole('button', { name: 'Refresh inbox' }).click();
  await expect(inbox.getByRole('status')).toContainText('Sources checked');
  await page.getByRole('button', { name: 'Notifications', exact: true }).click();
  await expect(page.getByRole('menuitem', { name: /Actionable inbox/ })).toBeVisible();
});
