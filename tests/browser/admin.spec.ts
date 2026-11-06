import { expect, test } from '../helpers/browser-test';
import operations from '../../src/modules/admin/catalog.json';
const overviewFixture = {
  observedAt: '2026-11-05T23:00:00.000Z',
  metrics: [
    { id: 'health', label: 'Server status', value: 'READY', operation: 'get-server-status' },
    { id: 'cpu', label: 'CPU usage', value: 24.5, unit: '%', operation: 'get-server-performance' },
    { id: 'memory', label: 'Memory usage', value: 62, unit: '%', operation: 'get-server-performance' },
    { id: 'online', label: 'Players online', value: 17, operation: 'get-players-online' },
    { id: 'players', label: 'Total players', value: 250, operation: 'get-players' },
    { id: 'guilds', label: 'Guilds', value: 8, operation: 'get-guilds' },
    { id: 'bases', label: 'Bases', value: 42, operation: 'get-bases' },
    { id: 'vehicles', label: 'Vehicles', value: 12, operation: 'get-vehicles' },
    { id: 'maps', label: 'Maps', value: 3, operation: 'get-maps' },
    { id: 'backups', label: 'Game backups', value: 4, operation: 'get-backups' },
  ],
  services: [
    { name: 'Game service', state: 'Running' },
    { name: 'Database', state: 'Healthy' },
  ],
  sources: [{ operation: 'get-server-status', label: 'Server health', state: 'ready', status: 200, durationMs: 12 }],
  setup: [
    { id: 'console', label: 'Console connection', ready: true, instruction: 'Configure CONSOLE_URL.' },
    {
      id: 'admin-key',
      label: 'Administrative credential',
      ready: true,
      instruction: 'Configure ADMIN_CONSOLE_API_KEY.',
    },
  ],
};
test.beforeEach(async ({ page }) => {
  await page.route('**/api/admin/overview', (route) => route.fulfill({ json: { ok: true, data: overviewFixture } }));
  await page.route('**/api/admin/guild-support-status*', (route) =>
    route.fulfill({ json: { ok: true, data: { total: 0, guilds: {} } } }),
  );
  await page.route('**/api/admin/guilds/*/messages/read', (route) =>
    route.fulfill({ json: { ok: true, data: { unreadCount: 0 } } }),
  );
});

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

test('admin overview shows live statistics, trends and connection setup on desktop and mobile', async ({
  page,
  context,
}) => {
  await context.setExtraHTTPHeaders({ Cookie: '__Host-dashboard_session=browser-admin-session' });
  await page.route('**/api/admin/catalog', (route) =>
    route.fulfill({ json: { ok: true, operations, configured: true, adapterConfigured: true } }),
  );
  let reads = 0;
  await page.route('**/api/admin/overview', (route) => {
    reads++;
    return route.fulfill({
      json: {
        ok: true,
        data: {
          ...overviewFixture,
          metrics: overviewFixture.metrics.map((metric) =>
            metric.id === 'cpu' ? { ...metric, value: reads === 1 ? 24.5 : 35.6 } : metric,
          ),
        },
      },
    });
  });
  await page.goto('/admin');
  const overview = page.getByRole('region', { name: 'Administration overview', exact: true });
  await expect(overview.getByRole('heading', { name: 'Server overview', exact: true })).toBeVisible();
  await expect(overview.getByRole('button', { name: /^Players online/ })).toContainText('17');
  await expect(overview.getByRole('button', { name: /^CPU usage/ })).toContainText('24.5%');
  await expect(overview.getByText('Game service', { exact: true })).toBeVisible();
  await overview.getByRole('button', { name: 'Refresh statistics', exact: true }).click();
  await expect(overview.getByRole('button', { name: /^CPU usage/ })).toContainText('35.6%');
  await expect(overview.getByRole('img', { name: 'Online player trend', exact: true })).toBeVisible();
  await page.screenshot({ path: 'test-results/admin-control-center-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/admin-control-center-mobile.png', fullPage: true });
  await page.getByRole('button', { name: 'Setup & connections', exact: true }).click();
  const setup = page.getByRole('region', { name: 'Administration setup', exact: true });
  await expect(setup.getByRole('heading', { name: 'Setup checklist', exact: true })).toBeVisible();
  await expect(setup).toContainText('ADMIN_CONSOLE_API_KEY');
  await expect(setup.getByRole('heading', { name: 'API connection checks', exact: true })).toBeVisible();
});

test('admin API reference explains and opens tools while retaining write confirmation', async ({ page, context }) => {
  await context.setExtraHTTPHeaders({ Cookie: '__Host-dashboard_session=browser-admin-session' });
  await page.route('**/api/admin/catalog', (route) =>
    route.fulfill({ json: { ok: true, operations, configured: true, adapterConfigured: true } }),
  );
  await page.goto('/admin');
  await page.getByRole('button', { name: 'API reference', exact: true }).click();
  const reference = page.getByRole('region', { name: 'Administration API reference', exact: true });
  await reference.getByRole('combobox', { name: 'Feature group', exact: true }).selectOption('Guilds');
  await reference.getByRole('combobox', { name: 'HTTP method', exact: true }).selectOption('DELETE');
  await expect(reference).toContainText('2 matching APIs');
  const row = reference.getByRole('row').filter({ hasText: 'Disband a guild' });
  await row.getByRole('button', { name: 'Open tool', exact: true }).click();
  const detail = page.getByRole('region', { name: 'Selected operation', exact: true });
  await expect(detail.getByRole('heading', { name: 'Disband a guild', exact: true })).toBeVisible();
  await expect(detail).toContainText('Changes server state');
  await expect(detail.getByRole('button', { name: 'Execute operation', exact: true })).toBeDisabled();
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
  await page.getByRole('button', { name: 'Operations', exact: true }).click();
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
  await page.getByRole('button', { name: 'Operations', exact: true }).click();
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

test('admin reply badges persist and clear only when leader support replies are viewed', async ({ page, context }) => {
  await context.setExtraHTTPHeaders({ Cookie: '__Host-dashboard_session=browser-admin-session' });
  await page.route('**/api/admin/catalog', (route) =>
    route.fulfill({ json: { ok: true, operations, configured: true, adapterConfigured: true } }),
  );
  await page.route('**/api/admin/execute', (route) =>
    route.fulfill({
      json: {
        ok: true,
        data: {
          rows:
            route.request().postDataJSON().operation === 'get-guilds'
              ? [{ guild_id: '2', guild_name: 'Crimson Skies' }]
              : [],
        },
      },
    }),
  );
  await page.route('**/api/admin/guilds/2/applications?*', (route) =>
    route.fulfill({ json: { ok: true, data: { rows: [], hasMore: false, listing: null } } }),
  );
  const messages = [
    {
      id: 'a62f594e-7a04-47d7-b3f9-94f9abf8aaab',
      senderId: 'leader',
      senderName: 'Guild Leader',
      role: 'applicant',
      text: 'Can you help us?',
      sentAt: Date.now(),
    },
    {
      id: 'b62f594e-7a04-47d7-b3f9-94f9abf8aaab',
      senderId: 'leader',
      senderName: 'Guild Leader',
      role: 'applicant',
      text: 'We have a question.',
      sentAt: Date.now(),
    },
    {
      id: 'c62f594e-7a04-47d7-b3f9-94f9abf8aaab',
      senderId: 'admin',
      senderName: 'Administrator',
      role: 'reviewer',
      text: 'My earlier answer.',
      sentAt: Date.now(),
    },
  ];
  const seen = new Set<string>();
  let receipts = 0;
  const unread = () => messages.filter((message) => message.role === 'applicant' && !seen.has(message.id)).length;
  await page.route('**/api/admin/guild-support-status*', (route) => {
    const ids = new URL(route.request().url()).searchParams.get('guildIds')?.split(',') ?? [];
    return route.fulfill({
      json: {
        ok: true,
        data: { total: unread(), guilds: Object.fromEntries(ids.map((id) => [id, id === '2' ? unread() : 0])) },
      },
    });
  });
  await page.route('**/api/admin/guilds/2/messages', (route) =>
    route.fulfill({ json: { ok: true, data: { messages } } }),
  );
  await page.route('**/api/admin/guilds/2/messages/read', (route) => {
    const batch = route.request().postDataJSON().messages;
    expect(batch.some((message: { senderId: string }) => message.senderId === 'admin')).toBe(false);
    batch.forEach((message: { id: string }) => seen.add(message.id));
    receipts++;
    if (receipts === 1)
      messages.push({
        ...messages[0],
        id: 'd62f594e-7a04-47d7-b3f9-94f9abf8aaab',
        text: 'Another reply during acknowledgement.',
      });
    return route.fulfill({ json: { ok: true, data: { unreadCount: unread() } } });
  });
  await page.goto('/admin');
  const tab = page.getByRole('button', { name: 'Guild oversight', exact: true });
  const nav = page.getByRole('link', { name: 'Administration', exact: true });
  await expect(tab.locator('[data-unread-count="2"]')).toBeVisible();
  await expect(nav.locator('[data-unread-count="2"]')).toBeVisible();
  await page.reload();
  await expect(tab.locator('[data-unread-count="2"]')).toBeVisible();
  await tab.click();
  const card = page.getByRole('button', { name: /Crimson Skies/ });
  await expect(card.locator('[data-unread-count="2"]')).toBeVisible();
  await card.click();
  expect(receipts).toBe(0);
  await page.getByRole('button', { name: /^Message guild leader/ }).click();
  await expect(tab.locator('[data-unread-count="1"]')).toBeVisible();
  await expect(
    page.getByRole('region', { name: 'Private chat with guild leader', exact: true }).getByRole('log'),
  ).toContainText('Another reply during acknowledgement.');
  await expect.poll(unread).toBe(0);
  await expect(tab.locator('[data-unread-count]')).toHaveCount(0);
  await page.reload();
  await expect(tab).toBeVisible();
  await expect(tab.locator('[data-unread-count]')).toHaveCount(0);
});
