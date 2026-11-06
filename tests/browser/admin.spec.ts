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
  await page.getByRole('link', { name: 'Configuration & advanced', exact: true }).click();
  await page.getByRole('link', { name: 'Setup & connections', exact: true }).click();
  await expect(page).toHaveURL(/tab=setup/);
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
  await page.goto('/admin?tab=reference');
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
  await page.goto('/admin?tab=players&advanced=1');
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
  await page.goto('/admin?tab=guild-oversight');
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
  await page.goto('/admin?tab=server&advanced=1');
  await expect(page.getByRole('heading', { name: 'Server', exact: true })).toBeVisible();
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
  await page.goto('/admin?tab=console');
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
  await page.goto('/admin?tab=players&advanced=1');
  const tab = page.getByRole('link', { name: 'Guilds', exact: true });
  const nav = page.getByRole('navigation', { name: 'Main navigation' }).getByRole('link', { name: 'Administration' });
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

test('admin navigation groups sections, syncs the URL and honours browser history', async ({ page, context }) => {
  await context.setExtraHTTPHeaders({ Cookie: '__Host-dashboard_session=browser-admin-session' });
  await page.route('**/api/admin/catalog', (route) =>
    route.fulfill({
      json: { ok: true, operations, configured: true, adapterConfigured: true, consoleOrigin: 'https://console.test' },
    }),
  );
  await page.goto('/admin');
  const sections = page.getByRole('navigation', { name: 'Administration sections' });
  for (const name of [
    'Control center',
    'Players & community',
    'Game assets',
    'World & economy',
    'Operations',
    'Configuration & advanced',
  ])
    await expect(sections.getByRole('link', { name, exact: true })).toBeVisible();
  await sections.getByRole('link', { name: 'World & economy', exact: true }).click();
  await page.getByRole('link', { name: 'Market', exact: true }).click();
  await expect(page).toHaveURL(/tab=market/);
  await expect(page.getByRole('navigation', { name: 'Breadcrumb' })).toContainText('World & economy');
  await expect(page.getByRole('group', { name: 'Market views' })).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(/tab=maps/);
  await expect(page.getByRole('heading', { name: 'Maps & worlds', exact: true })).toBeVisible();
  await page.goto('/admin?tab=console');
  const panel = page.getByRole('region', { name: 'Console-only administration' });
  await expect(panel).toContainText('Database');
  await expect(panel.getByRole('link', { name: 'Open Console ↗' })).toHaveAttribute('href', 'https://console.test');
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('players screen searches, opens a record, keeps history and confirms moderation in a dialog', async ({
  page,
  context,
}) => {
  await context.setExtraHTTPHeaders({ Cookie: '__Host-dashboard_session=browser-admin-session' });
  await page.route('**/api/admin/catalog', (route) =>
    route.fulfill({ json: { ok: true, operations, configured: true, adapterConfigured: true } }),
  );
  const calls: Record<string, any>[] = [];
  await page.route('**/api/admin/execute', (route) => {
    const input = route.request().postDataJSON();
    calls.push(input);
    const data: Record<string, unknown> = {
      'get-players': {
        rows: [{ player_id: '9007199254740993123', character_name: 'Scout', online: true }],
        hasMore: false,
      },
      'get-players-playerid': { character_name: 'Scout', level: 12 },
      'get-players-playerid-ban': { banned: false },
    };
    return route.fulfill({ json: { ok: true, upstreamStatus: 200, data: data[input.operation] ?? {} } });
  });
  await page.goto('/admin?tab=players');
  await page.getByRole('searchbox', { name: 'Search players' }).fill('Sco');
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await expect(page).toHaveURL(/q=Sco/);
  await page.getByRole('button', { name: 'Open Scout' }).click();
  await expect(page).toHaveURL(/player=9007199254740993123/);
  await expect(page.getByRole('heading', { name: 'Scout', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Moderation', exact: true }).click();
  await expect(page.getByText('Not banned')).toBeVisible();
  await page.getByRole('button', { name: 'Ban…', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('9007199254740993123');
  await expect(dialog.getByRole('button', { name: 'Ban player', exact: true })).toBeDisabled();
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(dialog).toBeHidden();
  expect(calls.some((call) => call.operation === 'post-players-playerid-ban')).toBe(false);
  await page.getByRole('button', { name: 'Ban…', exact: true }).click();
  await page.getByRole('dialog').getByRole('textbox').fill('BAN PLAYER');
  await page.getByRole('dialog').getByRole('button', { name: 'Ban player', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Ban requested.' })).toBeVisible();
  const ban = calls.find((call) => call.operation === 'post-players-playerid-ban');
  expect(ban.path.playerId).toBe('9007199254740993123');
  expect(ban.body.confirmation).toBe('BAN PLAYER');
  expect(ban.acknowledgement).toBe('POST /api/players/{playerId}/ban');
  await page.goBack();
  await page.goBack();
  await expect(page.getByRole('searchbox', { name: 'Search players' })).toBeVisible();
  await page.getByRole('link', { name: /Advanced tools/ }).click();
  await expect(page).toHaveURL(/advanced=1/);
});

test('vehicles screen shows cargo removal and pending deletions with cancel-safe dialogs', async ({
  page,
  context,
}) => {
  await context.setExtraHTTPHeaders({ Cookie: '__Host-dashboard_session=browser-admin-session' });
  await page.route('**/api/admin/catalog', (route) =>
    route.fulfill({ json: { ok: true, operations, configured: true, adapterConfigured: true } }),
  );
  const calls: Record<string, any>[] = [];
  await page.route('**/api/admin/execute', (route) => {
    const input = route.request().postDataJSON();
    calls.push(input);
    const data: Record<string, unknown> = {
      'get-vehicles': { rows: [{ vehicle_id: '11', name: 'Sandbike' }], hasMore: false },
      'get-vehicles-vehicleid-storage': { rows: [{ item_id: '5', name: 'Spice' }] },
      'get-vehicles-pending-deletes': { rows: [{ vehicle_id: '12', name: 'Buggy' }] },
    };
    return route.fulfill({ json: { ok: true, upstreamStatus: 200, data: data[input.operation] ?? {} } });
  });
  await page.goto('/admin?tab=vehicles');
  await page.getByRole('button', { name: 'Open Sandbike' }).click();
  await page.getByRole('button', { name: 'Cargo', exact: true }).click();
  await expect(page.getByRole('cell', { name: 'Spice' })).toBeVisible();
  await page.getByRole('button', { name: 'Empty all cargo…' }).click();
  await expect(page.getByRole('dialog')).toContainText('cannot be undone');
  await page.getByRole('dialog').getByRole('button', { name: 'Cancel', exact: true }).click();
  expect(calls.some((call) => call.operation.startsWith('delete-'))).toBe(false);
  await page.goto('/admin?tab=vehicles&view=pending');
  await expect(page.getByText('queued, not completed')).toBeVisible();
  await page.getByRole('button', { name: 'Cancel deletion' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Cancel deletion' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Cancellation requested.' })).toBeVisible();
  expect(calls.at(-2)?.operation ?? calls.at(-1)?.operation).toContain('queued-delete');
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('bases screen shows maintenance, queued work and cancel-safe removal', async ({ page, context }) => {
  await context.setExtraHTTPHeaders({ Cookie: '__Host-dashboard_session=browser-admin-session' });
  await page.route('**/api/admin/catalog', (route) =>
    route.fulfill({ json: { ok: true, operations, configured: true, adapterConfigured: true } }),
  );
  const calls: Record<string, any>[] = [];
  await page.route('**/api/admin/execute', (route) => {
    const input = route.request().postDataJSON();
    calls.push(input);
    const data: Record<string, unknown> = {
      'get-bases': { rows: [{ base_id: '9007199254740993123', name: 'Hagga Outpost' }], hasMore: false },
      'get-bases-auto-refill': { rows: [] },
      'get-bases-auto-refill-water': { rows: [{ base_id: '9007199254740993123', name: 'Hagga Outpost' }] },
      'get-bases-baseid-water': { stored: 120 },
      'get-bases-pending-refills': { rows: [{ base_id: '4', name: 'Queued Base' }] },
    };
    return route.fulfill({ json: { ok: true, upstreamStatus: 202, data: data[input.operation] ?? {} } });
  });
  await page.goto('/admin?tab=bases');
  await page.getByRole('button', { name: 'Open Hagga Outpost' }).click();
  await expect(page).toHaveURL(/base=9007199254740993123/);
  await page.getByRole('button', { name: 'Generators & water', exact: true }).click();
  await expect(page.getByText('Generators: Not enrolled')).toBeVisible();
  await expect(page.getByText('Water: Enrolled')).toBeVisible();
  await page.getByRole('button', { name: 'Refill generators…' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Refill generators', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'has not completed yet' })).toBeVisible();
  const refill = calls.find((call) => call.operation === 'post-bases-baseid-refill-generators');
  expect(refill.path.baseId).toBe('9007199254740993123');
  await page.getByRole('button', { name: 'Export & removal', exact: true }).click();
  await page.getByRole('button', { name: 'Delete base…' }).click();
  await expect(page.getByRole('dialog').getByRole('button', { name: 'Delete base', exact: true })).toBeDisabled();
  await page.getByRole('dialog').getByRole('button', { name: 'Cancel', exact: true }).click();
  expect(calls.some((call) => call.operation === 'delete-bases-baseid')).toBe(false);
  await page.goto('/admin?tab=bases&view=queues');
  await expect(page.getByText('queued, not completed')).toBeVisible();
  await expect(page.getByRole('cell', { name: 'Queued Base' })).toBeVisible();
});

test('backups screen previews a system restore before apply and never reuses the passphrase', async ({
  page,
  context,
}) => {
  await context.setExtraHTTPHeaders({ Cookie: '__Host-dashboard_session=browser-admin-session' });
  await page.route('**/api/admin/catalog', (route) =>
    route.fulfill({ json: { ok: true, operations, configured: true, adapterConfigured: true } }),
  );
  const calls: Record<string, any>[] = [];
  await page.route('**/api/admin/execute', (route) => {
    const input = route.request().postDataJSON();
    calls.push(input);
    const data: Record<string, unknown> = {
      'get-backups': { rows: [{ backup: 'world-1.tar', size: 10 }] },
      'get-backups-system': { rows: [{ name: 'system-1.arc', created: 'today' }] },
      'post-backups-system-name-restore': { willReplace: 'users', files: 4 },
    };
    return route.fulfill({ json: { ok: true, upstreamStatus: 200, data: data[input.operation] ?? {} } });
  });
  await page.goto('/admin?tab=backups');
  await page.getByRole('button', { name: 'Restore…' }).click();
  await expect(page.getByRole('dialog')).toContainText('Replaces the current game data');
  await page.getByRole('dialog').getByRole('button', { name: 'Cancel', exact: true }).click();
  expect(calls.some((call) => call.operation === 'post-backups-restore')).toBe(false);
  await page.getByRole('button', { name: 'System backups', exact: true }).click();
  await expect(page).toHaveURL(/view=system/);
  await expect(page.getByRole('button', { name: 'Apply restore…' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Preview restore…' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('button', { name: 'Show preview', exact: true })).toBeDisabled();
  await dialog.getByLabel('Archive passphrase').fill('correct horse battery');
  await dialog.getByRole('button', { name: 'Show preview', exact: true }).click();
  const preview = page.getByRole('region', { name: 'Restore preview' });
  await expect(preview).toContainText('nothing has changed');
  expect(calls.find((call) => call.operation === 'post-backups-system-name-restore').body.apply).toBe(false);
  await preview.getByRole('combobox', { name: /Identity data/ }).selectOption('adopt-backup');
  await preview.getByRole('button', { name: 'Apply restore…' }).click();
  await expect(page.getByRole('dialog')).toContainText('replaced by the backup');
  await expect(page.getByRole('dialog').getByRole('button', { name: 'Apply restore', exact: true })).toBeDisabled();
  await page.getByRole('dialog').getByRole('textbox').fill('APPLY RESTORE');
  await page.getByRole('dialog').getByRole('button', { name: 'Apply restore', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Restore requested.' })).toBeVisible();
  const applied = calls.filter((call) => call.operation === 'post-backups-system-name-restore').at(-1);
  expect(applied.body).toMatchObject({ apply: true, identityMode: 'adopt-backup', auditLogMode: 'keep-current' });
  await expect(page.getByRole('region', { name: 'Restore preview' })).toHaveCount(0);
  await expect(page.locator('input[type="password"]')).toHaveCount(0);
});

test('maps screen separates read-only status from confirmed controls', async ({ page, context }) => {
  await context.setExtraHTTPHeaders({ Cookie: '__Host-dashboard_session=browser-admin-session' });
  await page.route('**/api/admin/catalog', (route) =>
    route.fulfill({ json: { ok: true, operations, configured: true, adapterConfigured: true } }),
  );
  const calls: Record<string, any>[] = [];
  await page.route('**/api/admin/execute', (route) => {
    const input = route.request().postDataJSON();
    calls.push(input);
    const data: Record<string, unknown> = { 'get-maps': { rows: [{ map: 'Survival_1', state: 'running' }] } };
    return route.fulfill({ json: { ok: true, upstreamStatus: 200, data: data[input.operation] ?? {} } });
  });
  await page.goto('/admin?tab=maps');
  await expect(page.getByRole('cell', { name: 'Survival_1' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Restart a map' })).toBeVisible();
  await page.getByRole('button', { name: 'Memory & scaling', exact: true }).click();
  await page.getByRole('button', { name: 'Turn off…' }).click();
  await expect(page.getByRole('dialog')).toContainText('Memory balancer for all maps');
  await page.getByRole('dialog').getByRole('button', { name: 'Cancel', exact: true }).click();
  expect(calls.some((call) => call.operation === 'post-maps-memory-balancer')).toBe(false);
  await page.getByRole('link', { name: 'open the autoscaler tool' }).click();
  await expect(page).toHaveURL(/operation=post-maps-autoscaler/);
  await expect(page.getByRole('region', { name: 'Selected operation' })).toContainText('AUTOSCALER CHANGE');
});

test('market screen filters transactions, separates probes from runs and guards safety backups', async ({
  page,
  context,
}) => {
  await context.setExtraHTTPHeaders({ Cookie: '__Host-dashboard_session=browser-admin-session' });
  await page.route('**/api/admin/catalog', (route) =>
    route.fulfill({ json: { ok: true, operations, configured: true, adapterConfigured: true } }),
  );
  const calls: Record<string, any>[] = [];
  await page.route('**/api/admin/execute', (route) => {
    const input = route.request().postDataJSON();
    calls.push(input);
    const data: Record<string, unknown> = {
      'get-exchange-stats': { activeListings: 42 },
      'get-exchange-transactions': { rows: [{ item: 'Spice', price: 100 }], hasMore: false },
      'post-exchange-market-buyback-probe': { wouldBuy: 3 },
    };
    return route.fulfill({ json: { ok: true, upstreamStatus: 200, data: data[input.operation] ?? {} } });
  });
  await page.goto('/admin?tab=market');
  await expect(page.getByText('Active Listings')).toBeVisible();
  await page.getByRole('button', { name: 'Transactions', exact: true }).click();
  await page.getByRole('combobox', { name: 'Time range' }).selectOption('24');
  await expect(page).toHaveURL(/hours=24/);
  await expect
    .poll(() => calls.some((call) => call.operation === 'get-exchange-transactions' && call.query.hours === 24))
    .toBe(true);
  await expect(page.getByRole('cell', { name: 'Spice' })).toBeVisible();
  await page.getByRole('button', { name: 'Buyback & seeding', exact: true }).click();
  await page.getByRole('button', { name: 'Run probe' }).click();
  await expect(page.getByText('Nothing was bought or changed')).toBeVisible();
  await page.getByRole('button', { name: 'Run buyback…' }).click();
  await expect(page.getByRole('dialog')).toContainText('cannot be reversed');
  await page.getByRole('dialog').getByRole('button', { name: 'Cancel', exact: true }).click();
  expect(calls.some((call) => call.operation === 'post-exchange-market-buyback-run')).toBe(false);
  await page.getByRole('button', { name: 'Turn off…' }).click();
  await expect(page.getByRole('dialog').getByRole('button', { name: 'Turn off', exact: true })).toBeDisabled();
  await page.getByRole('dialog').getByRole('textbox').fill('DISABLE MARKET BOT BACKUPS');
  await page.getByRole('dialog').getByRole('button', { name: 'Turn off', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Safety backups disabled.' })).toBeVisible();
  expect(calls.find((call) => call.operation === 'post-exchange-market-settings').body).toMatchObject({
    safetyBackups: false,
    confirmation: 'DISABLE MARKET BOT BACKUPS',
  });
  await page.getByRole('button', { name: 'Sellers', exact: true }).click();
  await page.getByLabel('Blacklisted owner IDs').fill('abc');
  await page.getByRole('button', { name: 'Review…' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Owner IDs must be numbers' })).toBeVisible();
});

test('server screen guards restarts and keeps the Funcom token out of view', async ({ page, context }) => {
  await context.setExtraHTTPHeaders({ Cookie: '__Host-dashboard_session=browser-admin-session' });
  await page.route('**/api/admin/catalog', (route) =>
    route.fulfill({ json: { ok: true, operations, configured: true, adapterConfigured: true } }),
  );
  const calls: Record<string, any>[] = [];
  await page.route('**/api/admin/execute', (route) => {
    const input = route.request().postDataJSON();
    calls.push(input);
    const data: Record<string, unknown> = {
      'get-server-status': { state: 'READY' },
      'get-server-services': { rows: [{ name: 'game-1', state: 'running' }] },
      'get-server-restart-queue': { rows: [{ id: 'q1', reason: 'Scheduled' }] },
    };
    return route.fulfill({ json: { ok: true, upstreamStatus: 200, data: data[input.operation] ?? {} } });
  });
  await page.goto('/admin?tab=server');
  await expect(page.getByText('READY')).toBeVisible();
  await page.getByRole('button', { name: 'Restart…', exact: true }).click();
  await expect(page.getByRole('dialog').getByRole('button', { name: 'Restart server', exact: true })).toBeDisabled();
  await page.getByRole('dialog').getByRole('button', { name: 'Cancel', exact: true }).click();
  await page.getByRole('button', { name: 'Restart game-1…' }).click();
  await expect(page.getByRole('dialog')).toContainText('game-1');
  await page.getByRole('dialog').getByRole('button', { name: 'Cancel', exact: true }).click();
  expect(calls.some((call) => call.operation.startsWith('post-server-restart'))).toBe(false);
  await page.getByRole('button', { name: 'Restarts & automation', exact: true }).click();
  await expect(page.getByText('pending, not completed')).toBeVisible();
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Cancel countdown' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Countdown cancelled.' })).toBeVisible();
  expect(calls.find((call) => call.operation === 'post-server-restart-queue-cancel').body).toEqual({ id: 'q1' });
  await page.getByRole('button', { name: 'Title & Funcom token', exact: true }).click();
  await page.getByLabel('Token', { exact: true }).fill('fixture-token-value');
  await page.getByRole('button', { name: 'Submit token…' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Submit token', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Token submitted.' })).toBeVisible();
  await expect(page.getByLabel('Token', { exact: true })).toHaveValue('');
  expect(calls.find((call) => call.operation === 'post-server-funcom-token').body.token).toBe('fixture-token-value');
});

test('logs screen selects a service, reads bounded output and streams with stop and reconnect', async ({
  page,
  context,
}) => {
  await context.setExtraHTTPHeaders({ Cookie: '__Host-dashboard_session=browser-admin-session' });
  await page.route('**/api/admin/catalog', (route) =>
    route.fulfill({ json: { ok: true, operations, configured: true, adapterConfigured: true } }),
  );
  let streams = 0;
  await page.route('**/api/admin/execute', (route) => {
    const input = route.request().postDataJSON();
    if (input.operation === 'get-logs-service-stream') {
      streams++;
      return route.fulfill({
        status: 200,
        headers: { 'Content-Type': 'text/event-stream' },
        body: `data: {"message":"live line ${streams}"}\n\n`,
      });
    }
    const data: Record<string, unknown> = {
      'get-logs-services': { services: ['game-1', 'database'] },
      'get-logs-service': { logs: ['boot ok', 'map ready'] },
    };
    return route.fulfill({ json: { ok: true, upstreamStatus: 200, data: data[input.operation] ?? {} } });
  });
  await page.goto('/admin?tab=logs');
  await page.getByRole('combobox', { name: 'Service' }).selectOption('game-1');
  await expect(page).toHaveURL(/service=game-1/);
  await expect(page.getByText('map ready')).toBeVisible();
  await page.getByRole('button', { name: 'Start live stream' }).click();
  await expect(page.getByLabel('Live log output')).toContainText('live line 1');
  await expect(page.getByRole('status').filter({ hasText: 'stream ended' })).toBeVisible();
  await page.getByRole('button', { name: 'Reconnect' }).click();
  await expect(page.getByLabel('Live log output')).toContainText('live line 2');
  expect(streams).toBe(2);
});

test('care package screen keeps scans, enablement and undocumented grants clearly separated', async ({
  page,
  context,
}) => {
  await context.setExtraHTTPHeaders({ Cookie: '__Host-dashboard_session=browser-admin-session' });
  await page.route('**/api/admin/catalog', (route) =>
    route.fulfill({ json: { ok: true, operations, configured: true, adapterConfigured: true } }),
  );
  const calls: Record<string, any>[] = [];
  await page.route('**/api/admin/execute', (route) => {
    const input = route.request().postDataJSON();
    calls.push(input);
    const data: Record<string, unknown> = {
      'get-care-package-config': { enabled: false },
      'get-care-package-eligible': { rows: [{ player_id: '9007199254740993123', name: 'Newcomer', eligible: true }] },
    };
    return route.fulfill({ json: { ok: true, upstreamStatus: 200, data: data[input.operation] ?? {} } });
  });
  await page.goto('/admin?tab=care');
  await page.getByRole('button', { name: 'Run scan…' }).click();
  await expect(page.getByRole('dialog').getByRole('button', { name: 'Run scan', exact: true })).toBeDisabled();
  await page.getByRole('dialog').getByRole('button', { name: 'Cancel', exact: true }).click();
  expect(calls.some((call) => call.operation === 'post-care-package-run')).toBe(false);
  await page.getByRole('button', { name: 'Disable…' }).click();
  await page.getByRole('dialog').getByRole('textbox').fill('DISABLE CARE PACKAGE');
  await page.getByRole('dialog').getByRole('button', { name: 'Disable', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Care packages disabled.' })).toBeVisible();
  expect(calls.find((call) => call.operation === 'post-care-package-disable').body.confirmation).toBe(
    'DISABLE CARE PACKAGE',
  );
  await expect(page.getByRole('link', { name: 'grant to one player' })).toBeVisible();
  await page.getByRole('button', { name: 'Eligible players', exact: true }).click();
  await expect(page.getByRole('cell', { name: 'Newcomer' })).toBeVisible();
  await page.getByLabel(/Only players who are eligible now/).click();
  await expect(page).toHaveURL(/only=1/);
  await expect
    .poll(() =>
      calls.some((call) => call.operation === 'get-care-package-eligible' && call.query.onlyEligible === true),
    )
    .toBe(true);
});

test('admin tools screen validates broadcasts, searches catalogs and confirms history clearing', async ({
  page,
  context,
}) => {
  await context.setExtraHTTPHeaders({ Cookie: '__Host-dashboard_session=browser-admin-session' });
  await page.route('**/api/admin/catalog', (route) =>
    route.fulfill({ json: { ok: true, operations, configured: true, adapterConfigured: true } }),
  );
  const calls: Record<string, any>[] = [];
  await page.route('**/api/admin/execute', (route) => {
    const input = route.request().postDataJSON();
    calls.push(input);
    const data: Record<string, unknown> = {
      'get-admin-items-catalog': { rows: [{ template_id: '7', name: 'Spice Melange' }] },
    };
    return route.fulfill({ json: { ok: true, upstreamStatus: 200, data: data[input.operation] ?? {} } });
  });
  await page.goto('/admin?tab=tools');
  await page.getByRole('button', { name: 'Review…' }).first().click();
  await expect(page.getByRole('status').filter({ hasText: 'Enter a title, a message' })).toBeVisible();
  await page.getByLabel('Title', { exact: true }).fill('Maintenance');
  await page.getByLabel('Message', { exact: true }).first().fill('Restart soon');
  await page.getByRole('button', { name: 'Review…' }).first().click();
  await expect(page.getByRole('dialog')).toContainText('cannot recall');
  await page.getByRole('dialog').getByRole('button', { name: 'Cancel', exact: true }).click();
  expect(calls.some((call) => call.operation === 'post-admin-broadcast')).toBe(false);
  await page.getByRole('button', { name: 'Catalogs', exact: true }).click();
  await expect(page.getByRole('cell', { name: 'Spice Melange' })).toBeVisible();
  await page.getByRole('button', { name: 'Administrator history', exact: true }).click();
  await expect(page.getByText('not a full audit')).toBeVisible();
  await page.getByRole('button', { name: 'Clear tool history…' }).click();
  await expect(page.getByRole('dialog').getByRole('button', { name: 'Clear history', exact: true })).toBeDisabled();
  await page.getByRole('dialog').getByRole('button', { name: 'Cancel', exact: true }).click();
  expect(calls.some((call) => call.operation === 'post-admin-history-clear')).toBe(false);
});

test('updates and addons screens check read-only and hand restricted writes to the Console', async ({
  page,
  context,
}) => {
  await context.setExtraHTTPHeaders({ Cookie: '__Host-dashboard_session=browser-admin-session' });
  await page.route('**/api/admin/catalog', (route) =>
    route.fulfill({
      json: { ok: true, operations, configured: true, adapterConfigured: true, consoleOrigin: 'https://console.test' },
    }),
  );
  const calls: Record<string, any>[] = [];
  await page.route('**/api/admin/execute', (route) => {
    const input = route.request().postDataJSON();
    calls.push(input);
    const data: Record<string, unknown> = {
      'post-updates-check-game': { updateAvailable: false },
      'get-addons-installed': { rows: [{ id: 'sample-addon', version: '1.0.0' }] },
      'get-addons-installed-id-content-path': 'Sample addon readme',
    };
    return route.fulfill({ json: { ok: true, upstreamStatus: 200, data: data[input.operation] ?? {} } });
  });
  await page.goto('/admin?tab=updates');
  const handoff = page.getByRole('region', { name: 'Applying updates and repairs' });
  await expect(handoff).toContainText('Console API keys cannot perform update or addon writes');
  await expect(handoff.getByRole('button')).toHaveCount(0);
  await expect(handoff.getByRole('link', { name: 'Open Console ↗' })).toHaveAttribute('href', 'https://console.test');
  await page.getByRole('region', { name: 'Game update check' }).getByRole('button', { name: 'Check now' }).click();
  await expect(page.getByText('Checked at')).toBeVisible();
  expect(calls.find((call) => call.operation === 'post-updates-check-game')).toBeTruthy();
  expect(calls.some((call) => call.operation === 'post-updates-apply-game')).toBe(false);
  await page.goto('/admin?tab=addons');
  await page.getByRole('button', { name: 'Inspect sample-addon' }).click();
  await page.getByLabel('File path inside the addon').fill('../secret');
  await expect(page.getByRole('button', { name: 'Read file' })).toBeDisabled();
  await page.getByLabel('File path inside the addon').fill('README.md');
  await page.getByRole('button', { name: 'Read file' }).click();
  await expect(page.getByText('Sample addon readme')).toBeVisible();
  expect(calls.find((call) => call.operation === 'get-addons-installed-id-content-path').path).toEqual({
    id: 'sample-addon',
    path: 'README.md',
  });
  await expect(page.getByRole('region', { name: 'Installing, updating and removing addons' })).toBeVisible();
});

test('guild membership screen separates ranks and confirms leadership, removal and disbanding', async ({
  page,
  context,
}) => {
  await context.setExtraHTTPHeaders({ Cookie: '__Host-dashboard_session=browser-admin-session' });
  await page.route('**/api/admin/catalog', (route) =>
    route.fulfill({ json: { ok: true, operations, configured: true, adapterConfigured: true } }),
  );
  const calls: Record<string, any>[] = [];
  await page.route('**/api/admin/execute', (route) => {
    const input = route.request().postDataJSON();
    calls.push(input);
    const data: Record<string, unknown> = {
      'get-guilds': { rows: [{ guild_id: '2', guild_name: 'Crimson Skies' }], hasMore: false },
      'get-guilds-guildid-members': {
        rows: [
          { player_id: '4', character_name: 'Leader', role_id: '100' },
          { player_id: '7', character_name: 'Scout', role_id: '50' },
          { player_id: '9', character_name: 'Rookie', role_id: '1' },
        ],
      },
    };
    return route.fulfill({ json: { ok: true, upstreamStatus: 200, data: data[input.operation] ?? {} } });
  });
  await page.goto('/admin?tab=guild-tools');
  await page.getByRole('button', { name: 'Manage Crimson Skies' }).click();
  await expect(page).toHaveURL(/guild=2/);
  const roster = page.getByRole('region', { name: 'Guild roster' });
  await expect(roster.getByRole('row', { name: /Leader Leader/ }).getByRole('button')).toHaveCount(0);
  await expect(roster.getByRole('row', { name: /Scout Officer/ })).toBeVisible();
  await roster.getByRole('row', { name: /Scout/ }).getByRole('button', { name: 'Make leader…' }).click();
  await expect(page.getByRole('dialog')).toContainText('transfers leadership');
  await expect(page.getByRole('dialog').getByRole('button', { name: 'Transfer leadership' })).toBeDisabled();
  await page.getByRole('dialog').getByRole('button', { name: 'Cancel', exact: true }).click();
  await roster
    .getByRole('row', { name: /Rookie/ })
    .getByRole('button', { name: 'Remove…' })
    .click();
  await page.getByRole('dialog').getByRole('button', { name: 'Cancel', exact: true }).click();
  await page.getByRole('button', { name: 'Disband guild…' }).click();
  await expect(page.getByRole('dialog').getByRole('button', { name: 'Disband guild', exact: true })).toBeDisabled();
  await page.getByRole('dialog').getByRole('button', { name: 'Cancel', exact: true }).click();
  expect(calls.some((call) => call.method !== undefined || /promote|demote|delete-/.test(call.operation))).toBe(false);
  await roster
    .getByRole('row', { name: /Rookie/ })
    .getByRole('button', { name: 'Promote…' })
    .click();
  await page.getByRole('dialog').getByRole('button', { name: 'Promote', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Promotion requested.' })).toBeVisible();
  expect(calls.find((call) => call.operation === 'post-guilds-guildid-members-playerid-promote').path).toEqual({
    guildId: '2',
    playerId: '9',
  });
});

test('discord and directory screens report configuration honestly and never offer restricted forms', async ({
  page,
  context,
}) => {
  await context.setExtraHTTPHeaders({ Cookie: '__Host-dashboard_session=browser-admin-session' });
  let adapter = false;
  await page.route('**/api/admin/catalog', (route) =>
    route.fulfill({
      json: {
        ok: true,
        operations,
        configured: true,
        adapterConfigured: adapter,
        consoleOrigin: 'https://console.test',
      },
    }),
  );
  await page.route('**/api/admin/execute', (route) => {
    const input = route.request().postDataJSON();
    if (input.operation === 'get-integrations-discord-population')
      return route.fulfill({ status: 403, json: { ok: false, error: 'The adapter denied population:read.' } });
    return route.fulfill({ json: { ok: true, upstreamStatus: 200, data: { status: 'ok' } } });
  });
  await page.goto('/admin?tab=discord');
  await expect(page.getByText('The Discord adapter is not configured')).toBeVisible();
  adapter = true;
  await page.goto('/admin?tab=discord');
  await expect(page.getByRole('region', { name: 'Health' })).toContainText('Status');
  await page.getByRole('button', { name: 'Population & activity', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Population' }).getByRole('alert')).toContainText('population:read');
  await page.getByRole('button', { name: 'Links & lookups', exact: true }).click();
  const blocked = page.getByRole('region', { name: 'Not available through this dashboard' });
  await expect(blocked.getByRole('button')).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Verify an account link' })).toBeVisible();
  await page.goto('/admin?tab=directory');
  await expect(page.getByRole('region', { name: 'Public directory status' })).toBeVisible();
  await expect(
    page.getByRole('region', { name: 'Editing, claiming and global settings' }).getByRole('button'),
  ).toHaveCount(0);
});

test('live map screen scopes layers to a chosen partition and never teleports without one', async ({
  page,
  context,
}) => {
  await context.setExtraHTTPHeaders({ Cookie: '__Host-dashboard_session=browser-admin-session' });
  await page.route('**/api/admin/catalog', (route) =>
    route.fulfill({ json: { ok: true, operations, configured: true, adapterConfigured: true } }),
  );
  const calls: Record<string, any>[] = [];
  await page.route('**/api/admin/execute', (route) => {
    const input = route.request().postDataJSON();
    calls.push(input);
    const data: Record<string, unknown> = {
      'get-map-partitions': {
        rows: [
          { map: 'Survival_1', partition_id: '0' },
          { map: 'Survival_1', partition_id: '1' },
          { map: 'DeepDesert_1', partition_id: '0' },
        ],
      },
      'get-map-players': { rows: [{ player_id: '9007199254740993123', name: 'Scout' }] },
      'get-map-markers': { rows: [{ id: 'm1', kind: 'spice' }] },
    };
    return route.fulfill({ json: { ok: true, upstreamStatus: 200, data: data[input.operation] ?? {} } });
  });
  await page.goto('/admin?tab=live-map');
  await expect(page.getByRole('combobox', { name: 'Map' })).toHaveValue('');
  expect(calls.some((call) => call.operation === 'get-map-players')).toBe(false);
  await page.getByRole('combobox', { name: 'Map' }).selectOption('Survival_1');
  await expect(page).toHaveURL(/map=Survival_1/);
  await expect(page.getByRole('combobox', { name: 'Partition' }).locator('option')).toHaveCount(3);
  await expect(page.getByRole('cell', { name: 'Scout' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Open player' })).toHaveAttribute('href', /player=9007199254740993123/);
  await page.getByRole('combobox', { name: 'Partition' }).selectOption('1');
  await page.getByRole('button', { name: 'Markers', exact: true }).click();
  await expect
    .poll(() =>
      calls.some(
        (call) =>
          call.operation === 'get-map-markers' && call.query.partitionId === '1' && call.query.map === 'Survival_1',
      ),
    )
    .toBe(true);
  await page.getByLabel('Player ID').fill('4');
  for (const [label, value] of [
    ['X', '1'],
    ['Y', '2'],
    ['Z', '3'],
  ])
    await page.getByLabel(label, { exact: true }).fill(value);
  await page.getByRole('button', { name: 'Review…' }).click();
  await expect(page.getByRole('dialog')).toContainText('partition 1');
  await page.getByRole('dialog').getByRole('button', { name: 'Cancel', exact: true }).click();
  expect(calls.some((call) => call.operation === 'post-map-teleport-player')).toBe(false);
  await page.getByRole('combobox', { name: 'Partition' }).selectOption('');
  await page.getByRole('button', { name: 'Review…' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'never picks one for you' })).toBeVisible();
  expect(calls.some((call) => call.operation === 'post-map-teleport-player')).toBe(false);
});

test('statistics screen labels sources, shows zero separately from unavailable and keeps trends session-only', async ({
  page,
  context,
}) => {
  await context.setExtraHTTPHeaders({ Cookie: '__Host-dashboard_session=browser-admin-session' });
  await page.route('**/api/admin/catalog', (route) =>
    route.fulfill({ json: { ok: true, operations, configured: true, adapterConfigured: false } }),
  );
  await page.route('**/api/admin/overview', (route) =>
    route.fulfill({
      json: {
        ok: true,
        data: {
          observedAt: new Date().toISOString(),
          metrics: [
            { id: 'online', label: 'Players online', value: 0, operation: 'get-players-online' },
            { id: 'players', label: 'Total players', value: null, operation: 'get-players' },
            { id: 'guilds', label: 'Guilds', value: null, operation: 'get-guilds' },
          ],
          services: [],
          sources: [
            { operation: 'get-players-online', label: 'Online', state: 'ready', status: 200, durationMs: 4 },
            { operation: 'get-players', label: 'Players', state: 'ready', status: 200, durationMs: 4 },
            {
              operation: 'get-guilds',
              label: 'Guilds',
              state: 'error',
              status: 403,
              durationMs: 4,
              error: 'Missing scope.',
            },
          ],
          setup: [],
        },
      },
    }),
  );
  await page.route('**/api/admin/execute', (route) => {
    const input = route.request().postDataJSON();
    return route.fulfill({
      json: {
        ok: true,
        upstreamStatus: 200,
        data: input.operation === 'get-exchange-stats' ? { activeListings: 0 } : {},
      },
    });
  });
  await page.goto('/admin?tab=statistics');
  await expect(page.getByRole('heading', { name: 'Statistics', level: 1 })).toBeVisible();
  const table = page.getByRole('table', { name: 'Current administration readings' });
  await expect(table.getByRole('row', { name: /Players online 0 Available/ })).toBeVisible();
  await expect(table.getByRole('row', { name: /Total players — Not reported/ })).toBeVisible();
  await expect(table.getByRole('row', { name: /Guilds — Source failed — Missing scope\./ })).toBeVisible();
  await expect(page.getByText('Last reading')).toBeVisible();
  await expect(page.getByText('Long-term history is not stored')).toBeVisible();
  await expect(page.getByRole('region', { name: 'Market' })).toContainText('Source:');
  await expect(page.getByText('Adapter statistics (population')).toBeVisible();
  await expect(page.getByRole('link', { name: /Advanced tools/ })).toHaveCount(0);
});
