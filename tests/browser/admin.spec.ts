import { expect, test } from '../helpers/browser-test';
import operations from '../../src/modules/admin/catalog.json';

test('ordinary members cannot load administration or execute privileged operations', async ({ browser }) => {
  const context = await browser.newContext();
  await context.setExtraHTTPHeaders({ Cookie: '__Host-dashboard_session=browser-member-session' });
  const page = await context.newPage();
  const response = await page.goto('/admin');
  expect(response?.status()).toBe(404);
  expect((await context.request.get('/api/admin/catalog')).status()).toBe(403);
  const execute = await context.request.post('/api/admin/execute', {
    headers: { Origin: 'http://127.0.0.1:3100' },
    data: { operation: 'get-server-status' },
  });
  expect(execute.status()).toBe(403);
  await context.close();
});

test('admin forms paginate players and prefill related actions without raw JSON', async ({ page, context }) => {
  await context.setExtraHTTPHeaders({ Cookie: '__Host-dashboard_session=browser-admin-session' });
  await page.route('**/api/admin/catalog', (route) =>
    route.fulfill({ json: { ok: true, operations, configured: true, adapterConfigured: true } }),
  );
  const submitted: Record<string, any>[] = [];
  await page.route('**/api/admin/execute', (route) => {
    const input = route.request().postDataJSON();
    submitted.push(input);
    return route.fulfill({
      json: {
        ok: true,
        data: {
          rows: [
            { player_id: '9007199254740993123', name: 'Scout' },
            { player_id: '8', name: 'Builder' },
          ],
          hasMore: input.query.page === 0,
        },
      },
    });
  });
  await page.goto('/admin');
  await page.getByRole('searchbox', { name: 'Find an operation' }).fill('/api/players');
  await page.getByRole('button', { name: /GET List players/ }).click();
  await page.getByLabel(/^Search query/).fill('Scout');
  await page.getByLabel(/^Page Size/).fill('2');
  await page.getByLabel(/^Status/).selectOption('online');
  await page.getByRole('button', { name: 'Run read', exact: true }).click();
  await expect(page.getByRole('cell', { name: 'Scout', exact: true })).toBeVisible();
  expect(submitted[0].query).toMatchObject({ q: 'Scout', page: 0, pageSize: 2, status: 'online' });
  await page.getByRole('button', { name: 'Next page', exact: true }).click();
  await expect.poll(() => submitted.length).toBe(2);
  expect(submitted[1].query.page).toBe(1);
  await page.getByRole('combobox', { name: 'Actions for row 1' }).selectOption('post-players-playerid-add-xp');
  await expect(page.getByRole('textbox', { name: 'player Id', exact: true })).toHaveValue('9007199254740993123');
  await page.getByLabel(/^Amount/).fill('100');
  await expect(page.getByRole('button', { name: 'Execute operation', exact: true })).toBeDisabled();
  await page.getByLabel(/^Amount/).fill('NaN');
  await page
    .getByRole('textbox', { name: 'Confirm operation', exact: true })
    .fill('POST /api/players/{playerId}/add-xp');
  await expect(page.getByRole('alert').filter({ hasText: 'Amount needs valid input' })).toContainText(
    'Amount needs valid input',
  );
  await expect(page.getByRole('button', { name: 'Execute operation', exact: true })).toBeDisabled();
  expect(submitted).toHaveLength(2);
});

test('admin guild oversight inspects conversations, messages leaders and prepares rank controls', async ({
  page,
  context,
}) => {
  await context.setExtraHTTPHeaders({ Cookie: '__Host-dashboard_session=browser-admin-session' });
  await page.route('**/api/admin/catalog', (route) =>
    route.fulfill({ json: { ok: true, operations, configured: true, adapterConfigured: true } }),
  );
  await page.route('**/api/admin/execute', (route) => {
    const input = route.request().postDataJSON();
    return route.fulfill({
      json: {
        ok: true,
        data: {
          rows:
            input.operation === 'get-guilds'
              ? [{ guild_id: '2', guild_name: 'Crimson Skies' }]
              : [
                  { player_id: '4', character_name: 'Leader', role_id: '100' },
                  { player_id: '7', character_name: 'Scout', role_id: '1' },
                ],
        },
      },
    });
  });
  const id = 'a'.repeat(64);
  await page.route('**/api/admin/guilds/2/applications?*', (route) =>
    route.fulfill({
      json: {
        ok: true,
        data: {
          rows: [
            {
              id,
              characterName: 'Explorer',
              discordName: 'Applicant',
              discordId: 'applicant',
              status: 'pending',
              customAnswers: [{ questionId: 'one', question: 'Preferred role?', answer: 'Builder' }],
            },
          ],
          hasMore: false,
          listing: { published: true, requirements: 'Be friendly' },
        },
      },
    }),
  );
  await page.route('**/api/admin/guilds/2/applications/*/messages', (route) =>
    route.fulfill({
      json: {
        ok: true,
        data: {
          messages: [
            {
              id: 'a',
              senderId: 'reviewer',
              senderName: 'Leader',
              text: 'When can you join?',
              role: 'reviewer',
              sentAt: Date.now(),
            },
          ],
        },
      },
    }),
  );
  const messages: Record<string, unknown>[] = [];
  await page.route('**/api/admin/guilds/2/messages', (route) =>
    route.fulfill({ json: { ok: true, data: { messages } } }),
  );
  await page.route('**/api/admin/guilds/2/messages/send', (route) => {
    const input = route.request().postDataJSON();
    const message = {
      id: input.clientMessageId,
      text: input.text,
      senderId: 'admin',
      senderName: 'Administrator',
      role: 'reviewer',
      sentAt: Date.now(),
    };
    messages.push(message);
    return route.fulfill({ json: { ok: true, data: message } });
  });
  await page.goto('/admin');
  await page.getByRole('button', { name: 'Guild oversight', exact: true }).click();
  await page.getByRole('button', { name: /Crimson Skies/ }).click();
  const guild = page.getByRole('region', { name: 'Managing Crimson Skies', exact: true });
  await expect(guild.getByRole('cell', { name: 'Scout', exact: true })).toBeVisible();
  await guild.getByText('Explorer · pending', { exact: true }).click();
  await guild.getByRole('button', { name: 'Inspect application chat', exact: true }).click();
  await expect(guild.getByRole('region', { name: 'Application chat with Explorer' })).toContainText(
    'When can you join?',
  );
  await guild.getByRole('button', { name: 'Message guild leader', exact: true }).click();
  const chat = guild.getByRole('region', { name: 'Private chat with guild leader', exact: true });
  await expect(chat.getByText('Live · private conversation', { exact: true })).toBeVisible();
  await chat.getByRole('textbox', { name: 'Message', exact: true }).fill('Please check your recruitment listing.');
  await chat.getByRole('button', { name: 'Send message', exact: true }).click();
  await expect(chat.getByRole('log')).toContainText('Please check your recruitment listing.');
  await page.screenshot({ path: 'test-results/admin-guild-oversight-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/admin-guild-oversight-mobile.png', fullPage: true });
  await guild
    .getByRole('combobox', { name: 'Actions for row 2' })
    .selectOption('post-guilds-guildid-members-playerid-promote');
  await expect(page.getByRole('textbox', { name: 'guild Id', exact: true })).toHaveValue('2');
  await expect(page.getByRole('textbox', { name: 'player Id', exact: true })).toHaveValue('7');
  await expect(page.getByRole('button', { name: 'Execute operation', exact: true })).toBeDisabled();
});

test('administrator can browse operations, read data, and review changes on desktop and mobile', async ({
  page,
  context,
}) => {
  await context.setExtraHTTPHeaders({ Cookie: '__Host-dashboard_session=browser-admin-session' });
  await page.route('**/api/admin/catalog', (route) =>
    route.fulfill({
      json: { ok: true, operations, configured: true, adapterConfigured: true, consoleOrigin: 'https://console.test' },
    }),
  );
  const submitted: Record<string, unknown>[] = [];
  await page.route('**/api/admin/execute', async (route) => {
    submitted.push(route.request().postDataJSON());
    await route.fulfill({
      json: { ok: true, upstreamStatus: 200, data: { rows: [{ name: 'Example player', online: true }] } },
    });
  });
  await page.goto('/admin');
  await expect(page.getByRole('heading', { name: 'Your server. Under control.' })).toBeVisible();
  await page.getByRole('button', { name: 'Run read', exact: true }).click();
  await expect(page.getByRole('cell', { name: 'Example player' })).toBeVisible();
  expect(submitted[0].operation).toBe('get-server-status');
  await page.getByRole('searchbox', { name: 'Find an operation' }).fill('/api/server/restart');
  await page.getByRole('button', { name: /POST Restart all services/ }).click();
  const execute = page.getByRole('button', { name: 'Execute operation', exact: true });
  await expect(execute).toBeDisabled();
  await page.getByRole('textbox', { name: 'Confirm operation', exact: true }).fill('POST /api/server/restart');
  await expect(execute).toBeEnabled();
  // Selecting a write never submits it; the test deliberately does not execute server changes.
  expect(submitted).toHaveLength(1);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: 'test-results/admin-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: 'test-results/admin-mobile.png', fullPage: true });
  await page.getByRole('searchbox', { name: 'Find an operation' }).fill('/api/settings/api-keys');
  await page.getByRole('button', { name: /POST Create a key/ }).click();
  await expect(page.getByRole('status').filter({ hasText: /browser session/ })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Execute operation', exact: true })).toHaveCount(0);
});
