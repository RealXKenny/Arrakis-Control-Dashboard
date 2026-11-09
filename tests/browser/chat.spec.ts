import type { Page, Request, Route } from '@playwright/test';
import { test, expect } from '../helpers/browser-test';

// The fixture session `browser-member-session` belongs to this Discord ID (tests/helpers/browser-server.mjs).
const MEMBER_ID = '123456789000000000';
const A = 'hagga-basin';
const B = 'deep-desert';

const gameMessage = {
  id: 'game-event-1',
  streamId: '1000-0',
  serverId: A,
  senderId: 'Player#1234',
  senderName: 'Desert Walker',
  source: 'game',
  content: 'Hello from game',
  timestamp: '2026-11-08T20:00:00.000Z',
  correlationId: 'game-event-1',
  externalEventId: 'game-event-1',
};

function game(serverId: string, id: string, content: string, streamId = '1000-0') {
  return { ...gameMessage, id, serverId, content, streamId, correlationId: id, externalEventId: id };
}

function dashboardMessage(serverId: string, clientKey: string, content: string, delivery: string) {
  const id = clientKey.replaceAll('-', '').toUpperCase();
  return {
    id,
    streamId: '2000-0',
    serverId,
    senderId: MEMBER_ID,
    senderName: 'Test member',
    source: 'dashboard',
    content,
    timestamp: '2026-11-08T20:01:00.000Z',
    correlationId: clientKey,
    externalEventId: id,
    delivery,
  };
}

/** SSE body. `retry` controls how soon the real EventSource reconnects after the body ends. */
function sse(events: Array<{ event: string; data: unknown; id?: string }>, retry = 600_000): string {
  return (
    `retry: ${retry}\n\n` +
    events
      .map(({ event, data, id }) => `${id ? `id: ${id}\n` : ''}event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
      .join('')
  );
}

const history = (messages: unknown[], nextCursor: string | null = null) =>
  sse([{ event: 'history', data: { messages, nextCursor }, id: '1000-0' }]);

function deferred<T = void>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => (resolve = done));
  return { promise, resolve };
}

/** Fulfil a held request; the browser may already have cancelled it, which is the point. */
async function fulfillLate(route: Route, options: Parameters<Route['fulfill']>[0]): Promise<void> {
  await route.fulfill(options).catch(() => undefined);
}

type StreamHandler = (route: Route, serverId: string, index: number) => Promise<void>;

async function routeStreams(page: Page, handler: StreamHandler): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  await page.route('**/api/v2/chat/stream?*', async (route) => {
    const serverId = new URL(route.request().url()).searchParams.get('server') ?? '';
    const index = counts.get(serverId) ?? 0;
    counts.set(serverId, index + 1);
    await handler(route, serverId, index);
  });
  return counts;
}

async function signIn(page: Page) {
  await page.context().setExtraHTTPHeaders({ Cookie: '__Host-dashboard_session=browser-member-session' });
}

const rows = (page: Page) => page.getByRole('log', { name: 'Chat messages' }).locator('article');
const destination = (page: Page) => page.getByRole('combobox', { name: 'Game destination' });

async function openChat(page: Page) {
  await signIn(page);
  await routeStreams(page, (route, serverId) =>
    route.fulfill({
      status: 200,
      headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store' },
      body: history([game(serverId, `game-${serverId}`, serverId === B ? 'Deep Desert only' : 'Hello from game')]),
    }),
  );
  await page.goto('/chat');
  await expect(page.getByRole('heading', { name: 'Live chat', exact: true })).toBeVisible();
}

test('renders safe game history and shows a plain-language Sent status', async ({ page }) => {
  await openChat(page);
  await expect(page.getByText('Hello from game', { exact: true })).toBeVisible();
  await expect(page.getByText('Desert Walker', { exact: true })).toBeVisible();

  await page.route('**/api/v2/chat/messages', async (route) => {
    const input = route.request().postDataJSON();
    await route.fulfill({
      status: 201,
      json: { ok: true, message: dashboardMessage(input.serverId, input.clientKey, input.content, 'published') },
    });
  });
  const composer = page.getByRole('textbox', { name: 'Message Hagga Basin' });
  await composer.fill('Hello <img src=x onerror=alert(1)>');
  await composer.press('Enter');
  await expect(page.getByText('Hello <img src=x onerror=alert(1)>', { exact: true })).toBeVisible();
  await expect(page.locator('img[src="x"]')).toHaveCount(0);
  await expect(page.getByText('Sent', { exact: true })).toBeVisible();
  // The optimistic placeholder was replaced, not duplicated.
  await expect(page.getByText('Hello <img src=x onerror=alert(1)>', { exact: true })).toHaveCount(1);
  await expect(composer).toHaveValue('');
  await expect(page.locator('main')).not.toContainText(/RabbitMQ|broker receipt/i);
});

test('shows a new game event automatically once and restores it after refresh', async ({ page }) => {
  await signIn(page);
  const incoming = game(A, 'live-game-event', 'Fresh game message', '1001-0');
  let persisted = false;
  await routeStreams(page, async (route, serverId) => {
    const messages = [game(serverId, `stored-${serverId}`, 'Stored history')];
    if (persisted && serverId === A) messages.push(incoming);
    const events: Array<{ event: string; data: unknown; id?: string }> = [
      { event: 'history', data: { messages, nextCursor: null }, id: '1000-0' },
    ];
    if (!persisted && serverId === A) {
      events.push({ event: 'message', data: incoming }, { event: 'message', data: incoming });
      persisted = true;
    }
    await route.fulfill({ status: 200, headers: { 'Content-Type': 'text/event-stream' }, body: sse(events) });
  });
  await page.goto('/chat');
  await expect(page.getByText('Fresh game message', { exact: true })).toHaveCount(1);
  await expect(rows(page).filter({ hasText: 'Fresh game message' })).toContainText('Desert Walker');
  await page.reload();
  await expect(page.getByText('Fresh game message', { exact: true })).toHaveCount(1);
  await destination(page).selectOption(B);
  await expect(page.getByText('Stored history', { exact: true })).toBeVisible();
  await expect(page.getByText('Fresh game message', { exact: true })).toHaveCount(0);
});

test('shows Discord relays with the relayed name while genuine game messages keep Game', async ({ page }) => {
  await signIn(page);
  await routeStreams(page, (route) =>
    route.fulfill({
      status: 200,
      headers: { 'Content-Type': 'text/event-stream' },
      body: history([
        {
          ...game(A, 'discord-relay', '[Discord] [Owner] Kenny: Test <img src=x>'),
          source: 'discord',
          senderId: 'Relay#1234',
          senderName: 'Kenny',
          relayContent: 'Test <img src=x>',
        },
        game(A, 'genuine-player', '[Discord] Kenny: Player-typed text'),
      ]),
    }),
  );
  await page.goto('/chat');
  const discord = rows(page).filter({ hasText: 'Test <img src=x>' });
  await expect(discord.getByText('Discord', { exact: true })).toBeVisible();
  await expect(discord.getByText('Kenny', { exact: true })).toBeVisible();
  await expect(discord.getByText('Test <img src=x>', { exact: true })).toBeVisible();
  await expect(discord.getByText('[Discord] [Owner] Kenny: Test <img src=x>', { exact: true })).toHaveCount(0);
  await expect(page.locator('img[src="x"]')).toHaveCount(0);
  const gameRow = rows(page).filter({ hasText: 'Player-typed text' });
  await expect(gameRow.getByText('Game', { exact: true })).toBeVisible();
  await expect(gameRow.getByText('Desert Walker', { exact: true })).toBeVisible();
  await page.reload();
  await expect(rows(page).filter({ hasText: 'Test <img src=x>' }).getByText('Discord', { exact: true })).toBeVisible();
});

test('switches destinations end to end without leaking history, late events or sends', async ({ page }) => {
  await signIn(page);
  const heldReconnect = deferred<Route>();
  const counts = await routeStreams(page, async (route, serverId, index) => {
    const headers = { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store' };
    if (serverId === A && index === 0) {
      // A short retry makes the real EventSource reconnect to A, and that reconnect is held open.
      await route.fulfill({
        status: 200,
        headers,
        body: sse([{ event: 'history', data: { messages: [game(A, 'a-1', 'A history')], nextCursor: null } }], 100),
      });
    } else if (serverId === A && index === 1) {
      heldReconnect.resolve(route);
    } else {
      const message = serverId === A ? game(A, 'a-1', 'A history') : game(B, 'b-1', 'B history');
      await route.fulfill({ status: 200, headers, body: history([message]) });
    }
  });
  const sent: Array<{ serverId: string; clientKey: string }> = [];
  await page.route('**/api/v2/chat/messages', async (route) => {
    const input = route.request().postDataJSON();
    sent.push(input);
    await route.fulfill({
      status: 201,
      json: { ok: true, message: dashboardMessage(input.serverId, input.clientKey, input.content, 'published') },
    });
  });

  // 1–2. Open A and load its history.
  await page.goto('/chat');
  await expect(page.getByText('A history', { exact: true })).toBeVisible();
  const lateRoute = await heldReconnect.promise;

  // 3–5. Switch to B: B's history replaces A's.
  await destination(page).selectOption(B);
  await expect(page.getByText('B history', { exact: true })).toBeVisible();
  await expect(page.getByText('A history', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('textbox', { name: 'Message Deep Desert' })).toBeVisible();

  // 6. A's held stream now delivers a live A event; B must not show it.
  await fulfillLate(lateRoute, {
    status: 200,
    headers: { 'Content-Type': 'text/event-stream' },
    body: sse([{ event: 'message', data: game(A, 'a-late', 'Late A event', '1001-0'), id: '1001-0' }]),
  });
  await page.waitForTimeout(500);
  await expect(page.getByText('Late A event', { exact: true })).toHaveCount(0);

  // 7. Outgoing messages target B.
  await page.getByRole('textbox', { name: 'Message Deep Desert' }).fill('Hello B');
  await page.getByRole('button', { name: 'Send', exact: true }).click();
  await expect(page.getByText('Hello B', { exact: true })).toHaveCount(1);
  await expect(page.getByText('Sent', { exact: true })).toBeVisible();
  expect(sent).toHaveLength(1);
  expect(sent[0].serverId).toBe(B);
  expect(sent[0].clientKey).toMatch(/^[0-9a-f-]{36}$/);

  // 8–9. Back to A: A's history loads again; nothing from B or the late event remains.
  const before = new Map(counts);
  await destination(page).selectOption(A);
  await expect(page.getByText('A history', { exact: true })).toHaveCount(1);
  await expect(page.getByText('B history', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Hello B', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Late A event', { exact: true })).toHaveCount(0);

  // 10. Exactly one new subscription, for A; B's closed stream did not reconnect.
  await page.waitForTimeout(500);
  expect(counts.get(A)).toBe((before.get(A) ?? 0) + 1);
  expect(counts.get(B)).toBe(before.get(B));
  await expect(rows(page)).toHaveCount(1);
});

test('rapid switching ignores stale history pages, sends and stream responses', async ({ page }) => {
  await signIn(page);
  const heldStreams: Route[] = [];
  await routeStreams(page, async (route, serverId, index) => {
    const headers = { 'Content-Type': 'text/event-stream' };
    // Every A subscription after the first is held, then answered after the user has left A.
    if (serverId === A && index > 0) {
      heldStreams.push(route);
      return;
    }
    const message = serverId === A ? game(A, 'a-1', 'A history') : game(B, 'b-1', 'B history');
    await route.fulfill({ status: 200, headers, body: history([message], serverId === A ? '1000-0' : null) });
  });
  const olderRequested = deferred<Route>();
  await page.route('**/api/v2/chat/history?*', (route) => olderRequested.resolve(route));
  const sendRequested = deferred<Route>();
  await page.route('**/api/v2/chat/messages', (route) => sendRequested.resolve(route));

  await page.goto('/chat');
  await expect(page.getByText('A history', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Load older messages' }).click();
  const olderRoute = await olderRequested.promise;
  await page.getByRole('textbox', { name: 'Message Hagga Basin' }).fill('Stale send to A');
  await page.getByRole('button', { name: 'Send', exact: true }).click();
  const sendRoute = await sendRequested.promise;
  const sendInput = sendRoute.request().postDataJSON();
  expect(sendInput.serverId).toBe(A);

  // A → B → A → B in quick succession.
  for (const target of [B, A, B]) await destination(page).selectOption(target);
  await expect(page.getByText('B history', { exact: true })).toHaveCount(1);

  // Everything A started now resolves late.
  await fulfillLate(olderRoute, {
    json: { ok: true, messages: [game(A, 'a-old', 'Stale older A', '999-0')], nextCursor: null },
  });
  await fulfillLate(sendRoute, {
    status: 201,
    json: { ok: true, message: dashboardMessage(A, sendInput.clientKey, 'Stale send to A', 'published') },
  });
  for (const route of heldStreams)
    await fulfillLate(route, {
      status: 200,
      headers: { 'Content-Type': 'text/event-stream' },
      body: history([game(A, 'a-stale', 'Stale A stream')]),
    });
  await page.waitForTimeout(500);

  for (const text of ['A history', 'Stale older A', 'Stale send to A', 'Stale A stream'])
    await expect(page.getByText(text, { exact: true })).toHaveCount(0);
  await expect(page.getByText('B history', { exact: true })).toHaveCount(1);
  await expect(rows(page)).toHaveCount(1);
  await expect(page.getByRole('textbox', { name: 'Message Deep Desert' })).toBeVisible();
});

test('an interrupted send is unknown, never failed, and its status check reuses the same key', async ({ page }) => {
  await openChat(page);
  await expect(page.getByText('Hello from game', { exact: true })).toBeVisible();
  const requests: Request[] = [];
  await page.route('**/api/v2/chat/messages', async (route) => {
    requests.push(route.request());
    if (requests.length === 1) return route.abort('connectionreset');
    const input = route.request().postDataJSON();
    await route.fulfill({
      status: 201,
      json: { ok: true, message: dashboardMessage(input.serverId, input.clientKey, input.content, 'published') },
    });
  });
  await page.getByRole('textbox', { name: 'Message Hagga Basin' }).fill('Maybe sent');
  await page.getByRole('button', { name: 'Send', exact: true }).click();
  await expect(page.getByText('Unconfirmed', { exact: true })).toBeVisible();
  await expect(page.getByText('Not sent', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Send as a new message' })).toHaveCount(0);
  await expect(page.getByRole('alert').filter({ hasText: 'not retried automatically' })).toBeVisible();
  await page.waitForTimeout(300);
  expect(requests).toHaveLength(1);

  await page.getByRole('button', { name: 'Check status' }).click();
  await expect(page.getByText('Sent', { exact: true })).toBeVisible();
  await expect(page.getByText('Maybe sent', { exact: true })).toHaveCount(1);
  expect(requests).toHaveLength(2);
  expect(requests[1].postDataJSON().clientKey).toBe(requests[0].postDataJSON().clientKey);
});

test('a rejected send leaves the shared timeline and shows a dismissible private notice', async ({ page }) => {
  await openChat(page);
  await page.route('**/api/v2/chat/messages', (route) =>
    route.fulfill({
      status: 429,
      json: { ok: false, error: 'Chat rate limit reached. Try again in 4 seconds.', code: 'CHAT_RATE_LIMITED' },
    }),
  );
  await page.getByRole('textbox', { name: 'Message Hagga Basin' }).fill('Too fast');
  await page.getByRole('button', { name: 'Send', exact: true }).click();
  await expect(page.getByText('Not sent', { exact: true })).toBeVisible();
  await expect(page.getByRole('log', { name: 'Chat messages' })).not.toContainText('Too fast');
  await expect(page.getByRole('alert', { name: 'Failed message' })).toContainText('Only visible to you');
  await expect(page.getByRole('alert').filter({ hasText: 'rate limit' })).toBeVisible();
  await page.getByRole('button', { name: 'Dismiss message' }).click();
  await expect(page.getByRole('alert', { name: 'Failed message' })).toHaveCount(0);
  await expect(page.getByText('Too fast', { exact: true })).toHaveCount(0);
});

test('an exhausted send is visible only to its sender and dismissal survives fresh shared history', async ({
  page,
  browser,
}) => {
  await openChat(page);
  let sends = 0;
  await page.route('**/api/v2/chat/messages', async (route) => {
    sends++;
    const input = route.request().postDataJSON();
    // The endpoint reports the terminal result after its three internal publish attempts.
    await route.fulfill({
      status: 503,
      json: {
        ok: false,
        error: 'Message could not be sent.',
        message: dashboardMessage(input.serverId, input.clientKey, input.content, 'failed'),
      },
    });
  });
  const otherContext = await browser.newContext({
    extraHTTPHeaders: { Cookie: '__Host-dashboard_session=browser-admin-session' },
  });
  try {
    const other = await otherContext.newPage();
    await routeStreams(other, (route) =>
      route.fulfill({ status: 200, headers: { 'Content-Type': 'text/event-stream' }, body: history([gameMessage]) }),
    );
    await other.goto('http://127.0.0.1:3100/chat');
    await expect(other.getByText('Hello from game', { exact: true })).toBeVisible();
    await page.getByRole('textbox', { name: 'Message Hagga Basin' }).fill('My private failed message');
    await page.getByRole('button', { name: 'Send', exact: true }).click();
    await expect(page.getByRole('alert', { name: 'Failed message' })).toContainText('My private failed message');
    await expect(page.getByRole('log', { name: 'Chat messages' })).not.toContainText('My private failed message');
    await expect(other.getByText('My private failed message', { exact: true })).toHaveCount(0);
    await expect(other.getByRole('alert', { name: 'Failed message' })).toHaveCount(0);
    await page.getByRole('button', { name: 'Dismiss message' }).click();
    await expect(page.getByRole('alert', { name: 'Failed message' })).toHaveCount(0);
    await page.reload();
    await expect(page.getByText('Hello from game', { exact: true })).toBeVisible();
    await expect(page.getByText('My private failed message', { exact: true })).toHaveCount(0);
    expect(sends).toBe(1);
  } finally {
    await otherContext.close();
  }
});

test('loads older history and preserves a server-reported unknown delivery warning', async ({ page }) => {
  await signIn(page);
  await routeStreams(page, (route) =>
    route.fulfill({
      status: 200,
      headers: { 'Content-Type': 'text/event-stream' },
      body: history([gameMessage], '1000-0'),
    }),
  );
  await page.route('**/api/v2/chat/history?*', (route) =>
    route.fulfill({
      json: {
        ok: true,
        messages: [{ ...gameMessage, id: 'older-event', streamId: '999-0', content: 'Older retained message' }],
        nextCursor: null,
      },
    }),
  );
  await page.goto('/chat');
  await page.getByRole('button', { name: 'Load older messages' }).click();
  await expect(page.getByText('Older retained message', { exact: true })).toBeVisible();

  await page.route('**/api/v2/chat/messages', async (route) => {
    const input = route.request().postDataJSON();
    await route.fulfill({
      status: 202,
      json: {
        ok: true,
        error: 'Delivery could not be confirmed.',
        message: dashboardMessage(input.serverId, input.clientKey, input.content, 'unknown'),
      },
    });
  });
  await page.getByRole('textbox', { name: 'Message Hagga Basin' }).fill('Uncertain send');
  await page.getByRole('button', { name: 'Send', exact: true }).click();
  await expect(page.getByText('Unconfirmed', { exact: true })).toBeVisible();
  await expect(page.getByText('Check game chat before considering another send.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Send as a new message' })).toHaveCount(0);
});

test('mobile chat remains usable without horizontal overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openChat(page);
  await expect(destination(page)).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Message Hagga Basin' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Send', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('chat presentation uses readable source cards and public send status on desktop and mobile', async ({ page }) => {
  await signIn(page);
  await routeStreams(page, (route) =>
    route.fulfill({
      status: 200,
      headers: { 'Content-Type': 'text/event-stream' },
      body: history([
        { ...game(A, 'visual-game', 'Storm is moving east. Meet at the south gate.'), senderName: 'Desert Walker' },
        {
          ...game(A, 'visual-discord', '[Discord] [Owner] Kenny: On my way. Bringing the ornithopter.'),
          source: 'discord',
          senderName: 'Kenny',
          relayContent: 'On my way. Bringing the ornithopter.',
        },
        dashboardMessage(
          A,
          '0f8fad5b-d9cb-469f-a165-70867728950e',
          'I’ll bring the supplies. See you there.',
          'published',
        ),
      ]),
    }),
  );
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/chat');
  await expect(page.getByText('Sent', { exact: true })).toBeVisible();
  await expect(page.locator('main')).not.toContainText(/RabbitMQ|broker receipt|HaggaBasin\.0/i);
  await expect(rows(page)).toHaveCount(3);
  await page.getByRole('textbox', { name: 'Message Hagga Basin' }).fill('Anyone near the spice fields?');
  await expect(page.getByRole('button', { name: 'Send', exact: true })).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Send', exact: true })).toHaveCSS(
    'background-color',
    'rgb(238, 130, 9)',
  );
  await page.evaluate(() => window.scrollTo(0, 0));
  await expect(page.getByRole('heading', { name: 'Live chat', exact: true })).toBeInViewport();
  await page.screenshot({ path: test.info().outputPath('live-chat-desktop.png'), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('textbox', { name: 'Message Hagga Basin' }).scrollIntoViewIfNeeded();
  await expect(page.getByRole('button', { name: 'Send', exact: true })).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, 0));
  await expect(page.getByRole('heading', { name: 'Live chat', exact: true })).toBeInViewport();
  await page.screenshot({ path: test.info().outputPath('live-chat-mobile.png'), fullPage: true });
});

test('places own messages on the left with the dashboard photo and other senders on the right', async ({ page }) => {
  await signIn(page);
  const own = dashboardMessage(A, '0f8fad5b-d9cb-469f-a165-70867728950e', 'My stored message', 'published');
  const other = {
    ...dashboardMessage(A, '1f8fad5b-d9cb-469f-a165-70867728950e', 'Another member', 'published'),
    senderId: '223456789000000000',
    senderAvatar: 'abcdef0123456789abcdef0123456789',
  };
  const photo = '/api/v2/auth/avatar/';
  await page.route('**' + photo + '**', (route) =>
    route.fulfill({
      contentType: 'image/svg+xml',
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><rect width="40" height="40" fill="#5865f2"/></svg>',
    }),
  );
  await routeStreams(page, (route) =>
    route.fulfill({
      headers: { 'Content-Type': 'text/event-stream' },
      body: history([
        gameMessage,
        own,
        other,
        { ...gameMessage, id: 'same-name', senderName: 'Test member', content: 'Same name from game' },
      ]),
    }),
  );
  await page.goto('/chat');
  const mine = rows(page).filter({ hasText: 'My stored message' });
  const theirs = rows(page).filter({ hasText: 'Another member' });
  await expect(mine).toHaveAttribute('data-message-side', 'left');
  await expect(theirs).toHaveAttribute('data-message-side', 'right');
  await expect(rows(page).filter({ hasText: 'Same name from game' })).toHaveAttribute('data-message-side', 'left');
  await expect(mine.locator('img')).toHaveAttribute('src', photo + MEMBER_ID + '/0123456789abcdef0123456789abcdef');
  await expect(theirs.locator('img')).toHaveAttribute('src', photo + other.senderId + '/' + other.senderAvatar);
  await expect
    .poll(() => mine.locator('img').evaluate((image: HTMLImageElement) => image.naturalWidth))
    .toBeGreaterThan(0);
  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 844 });
    const a = await mine.locator('img').boundingBox();
    const b = await theirs.locator('img').boundingBox();
    expect(b!.x).toBeGreaterThan(a!.x + 100);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  }
  await page.route('**/api/v2/chat/messages', (route) => {
    const input = route.request().postDataJSON();
    return route.fulfill({
      status: 201,
      json: { ok: true, message: dashboardMessage(input.serverId, input.clientKey, input.content, 'published') },
    });
  });
  await page.getByRole('textbox', { name: 'Message Hagga Basin' }).fill('My new message');
  await page.getByRole('button', { name: 'Send', exact: true }).click();
  const sent = rows(page).filter({ hasText: 'My new message' });
  await expect(sent).toHaveAttribute('data-message-side', 'left');
  await expect(sent.locator('img')).toHaveAttribute('src', photo + MEMBER_ID + '/0123456789abcdef0123456789abcdef');
  await page.route('**' + photo + MEMBER_ID + '/**', (route) => route.abort());
  await page.reload();
  await expect(rows(page).filter({ hasText: 'My stored message' }).locator('img')).toHaveCount(0);
  await expect(rows(page).filter({ hasText: 'My stored message' })).toContainText('TM');
});

test('loads Redis-backed profile photos through the dashboard after refresh without browser CDN traffic', async ({
  page,
}) => {
  await signIn(page);
  const external: string[] = [];
  page.on('request', (request) => {
    if (request.url().startsWith('https://cdn.discordapp.com/')) external.push(request.url());
  });
  await page.route('https://cdn.discordapp.com/**', (route) => route.abort());
  const own = dashboardMessage(A, '0f8fad5b-d9cb-469f-a165-70867728950e', 'Stored photo message', 'published');
  await routeStreams(page, (route) =>
    route.fulfill({ headers: { 'Content-Type': 'text/event-stream' }, body: history([own]) }),
  );
  for (let load = 0; load < 2; load++) {
    if (load === 0) await page.goto('/chat');
    else await page.reload();
    const image = rows(page).filter({ hasText: 'Stored photo message' }).locator('img');
    await expect(image).toHaveAttribute(
      'src',
      '/api/v2/auth/avatar/' + MEMBER_ID + '/0123456789abcdef0123456789abcdef',
    );
    await expect.poll(() => image.evaluate((element: HTMLImageElement) => element.naturalWidth)).toBeGreaterThan(0);
    expect(external).toEqual([]);
  }
});

test('groups your dashboard, character and Discord nickname messages together on the left', async ({ page }) => {
  await signIn(page);
  const own = dashboardMessage(A, '0f8fad5b-d9cb-469f-a165-70867728950e', 'From dashboard', 'published');
  const character = {
    ...gameMessage,
    id: 'own-character',
    senderName: 'Desert Navigator',
    content: 'From my character',
  };
  const relay = {
    ...gameMessage,
    id: 'own-relay',
    source: 'discord',
    senderId: 'Bot#1234',
    senderName: 'Server Alias',
    content: '[Discord] Server Alias: From Discord',
    relayContent: 'From Discord',
  };
  const other = {
    ...own,
    id: 'other-account',
    senderId: 'different-account',
    senderName: 'Test member',
    content: 'Another dashboard account',
  };
  await routeStreams(page, (route) =>
    route.fulfill({
      headers: { 'Content-Type': 'text/event-stream' },
      body: history([own, character, relay, other, gameMessage]),
    }),
  );
  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto('/chat');
    for (const content of ['From dashboard', 'From my character', 'From Discord']) {
      const row = rows(page).filter({ hasText: content });
      await expect(row).toHaveAttribute('data-message-side', 'left');
      await expect(row).toHaveAttribute('data-message-own', 'true');
      await expect(row.locator('img')).toHaveAttribute(
        'src',
        '/api/v2/auth/avatar/' + MEMBER_ID + '/0123456789abcdef0123456789abcdef',
      );
    }
    await expect(rows(page).filter({ hasText: 'From my character' })).toContainText('Game');
    await expect(rows(page).filter({ hasText: 'From Discord' })).toContainText('Discord');
    await expect(rows(page).filter({ hasText: 'Another dashboard account' })).toHaveAttribute(
      'data-message-side',
      'right',
    );
    await expect(rows(page).filter({ hasText: 'Hello from game' })).toHaveAttribute('data-message-side', 'right');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  }
});
