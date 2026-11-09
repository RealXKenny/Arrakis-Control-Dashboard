import type { BrowserContext, Page } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { expect, test } from '../helpers/browser-test';
import { fakeConsole, type TestMember } from '../helpers/fake-console-client';

/**
 * V2 workspace coverage. The interface renders on the server, so these tests shape the world through the fake
 * Console (tests/helpers/fake-console.mjs) instead of intercepting browser requests. Every test signs in as its own
 * member with its own character, so nothing is shared except what the test sets up on purpose.
 */
const ADMIN = '__Host-dashboard_session=browser-admin-session';
const MEMBER = '__Host-dashboard_session=browser-member-session';

const overflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);
const signInAs = (context: BrowserContext, member: TestMember | string) =>
  context.setExtraHTTPHeaders({ Cookie: typeof member === 'string' ? member : member.cookie });

test.afterEach(async () => {
  await fakeConsole.reset();
});

test.describe('landing and sign-in gates', () => {
  test('the public landing page invites sign-in, hides administration and fits every width', async ({ page }) => {
    const response = await page.goto('/');
    expect(response?.status()).toBe(200);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(/Arrakis\s+Control/i);
    await expect(page.getByRole('link', { name: 'Sign in with Discord' }).first()).toBeVisible();
    await expect(page.locator('a[href="/admin"]')).toHaveCount(0);
    for (const [width, height] of [
      [3432, 1308],
      [1280, 800],
      [390, 844],
    ]) {
      await page.setViewportSize({ width, height });
      expect(await overflow(page), `${width}px`).toBe(true);
    }
  });

  test('the legacy home URL redirects to the root and keeps the query string', async ({ page }) => {
    await page.goto('/home?source=bookmark');
    await expect(page).toHaveURL(/\/\?source=bookmark$/);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(/Arrakis\s+Control/i);
  });

  test('every signed-in page sends anonymous visitors to sign in', async ({ page }) => {
    for (const route of ['/portal', '/character', '/storage', '/vehicles', '/market', '/guild', '/bases']) {
      await page.goto(route);
      await expect(page, route).toHaveURL(/\/login/);
    }
  });

  test('an unknown or expired session lands on sign-in once, without a redirect loop', async ({ page, context }) => {
    await signInAs(context, '__Host-dashboard_session=expired-or-forged-session');
    const hops: string[] = [];
    page.on('framenavigated', (frame) => frame === page.mainFrame() && hops.push(frame.url()));
    await page.goto('/portal');
    await expect(page).toHaveURL(/\/login/);
    await page.waitForTimeout(500);
    expect(hops.length).toBeLessThanOrEqual(3);
  });

  test('administration links are absent from the landing page and portal for members and administrators', async ({
    page,
    context,
  }) => {
    for (const cookie of [MEMBER, ADMIN]) {
      await signInAs(context, cookie);
      for (const route of ['/', '/portal']) {
        await page.goto(route);
        await expect(page.locator('a[href="/admin"]'), `${route} ${cookie}`).toHaveCount(0);
      }
    }
  });
});

test.describe('browser security posture', () => {
  test('pages ship a nonce-based CSP and load nothing from third-party origins', async ({ page, context }) => {
    await signInAs(context, MEMBER);
    const origins = new Set<string>();
    page.on('request', (request) => origins.add(new URL(request.url()).origin));
    const response = await page.goto('/portal');
    const policy = response!.headers()['content-security-policy'];
    expect(policy).toMatch(/script-src 'self' 'nonce-[A-Za-z0-9+/=]+'/);
    expect(policy).not.toMatch(/announcify|unsafe-eval|script-src[^;]*unsafe-inline/);
    expect(policy).toContain("frame-ancestors 'none'");
    expect(response!.headers()['x-content-type-options']).toBe('nosniff');
    expect(response!.headers()['x-frame-options']).toBe('DENY');
    await page.waitForLoadState('networkidle');
    expect([...origins].filter((origin) => origin !== 'http://127.0.0.1:3100' && !origin.startsWith('data:'))).toEqual(
      [],
    );
  });

  test('API responses are private, no-store and sandboxed', async ({ context }) => {
    await signInAs(context, MEMBER);
    const response = await context.request.get('/api/session');
    expect(response.headers()['cache-control']).toContain('no-store');
    expect(response.headers()['content-security-policy']).toContain("default-src 'none'");
    expect(response.headers()['x-request-id']).toBeTruthy();
  });

  test('state-changing API calls from another origin are refused before any work happens', async ({ context }) => {
    await signInAs(context, MEMBER);
    for (const [path, origin] of [
      ['/api/v2/auth/password', 'https://evil.example'],
      ['/api/bases/import', 'https://evil.example'],
      ['/api/v2/admin/execute', 'null'],
    ]) {
      const response = await context.request.post(path, { headers: { Origin: origin }, data: {} });
      expect([401, 403], `${path} from ${origin}`).toContain(response.status());
      expect(await response.text()).not.toMatch(/stack|at .*\.ts/);
    }
  });
});

test.describe('portal, character and storage', () => {
  test('the portal summarises the linked character', async ({ page, context }) => {
    await signInAs(context, await fakeConsole.newMember('Sietch Walker', { guild: { id: '2', role: 100 } }));
    await page.goto('/portal');
    await expect(page.getByText('Welcome back, Sietch Walker')).toBeVisible();
    await expect(page.getByText('Crimson Skies').first()).toBeVisible();
    await expect(page.getByText('12,537,085').first()).toBeVisible();
    await expect(page.getByText('Leader').first()).toBeVisible();
  });

  test('the field-conditions briefing switches between the two maps', async ({ page, context }) => {
    await signInAs(context, await fakeConsole.newMember('Cartographer'));
    await page.goto('/portal');
    await expect(page.getByText('Field conditions · Hagga Basin')).toBeVisible();
    await page.getByRole('link', { name: 'Deep Desert', exact: true }).click();
    await expect(page).toHaveURL(/map=DeepDesert/);
    await expect(page.getByText('Field conditions · Deep Desert')).toBeVisible();
    // An invented map name is ignored rather than passed to the Console.
    await page.goto('/portal?map=../../etc/passwd');
    await expect(page.getByText('Field conditions · Hagga Basin')).toBeVisible();
  });

  test('missing telemetry is shown honestly, never invented', async ({ page, context }) => {
    const member = await fakeConsole.newMember('Quiet Fremen', { failures: { currency: 503, progression: 503 } });
    await signInAs(context, member);
    await page.goto('/portal');
    await expect(page.getByText('Welcome back, Quiet Fremen')).toBeVisible();
    await expect(page.getByText('12,537,085')).toHaveCount(0);
    await expect(page.getByText('100,000')).toHaveCount(0);
  });

  test('an unlinked member sees no character data', async ({ page, context }) => {
    const member = await fakeConsole.newMember('Ghost', { linked: { linked: false } });
    await signInAs(context, member);
    await page.goto('/character');
    await expect(page.getByText('Ghost')).toHaveCount(0);
    await expect(page.getByText('12,537,085')).toHaveCount(0);
  });

  test('the character and storage pages use player data', async ({ page, context }) => {
    await signInAs(context, await fakeConsole.newMember('Stilgar'));
    await page.goto('/character');
    await expect(page.getByRole('heading', { name: 'Stilgar' })).toBeVisible();
    await expect(page.getByText('Atreides').first()).toBeVisible();
    await expect(page.getByText('Stillsuit').first()).toBeVisible();
    await page.goto('/storage');
    await expect(page.getByText('Spice Melange')).toBeVisible();
    await expect(page.getByText('Inventory readings are read-only. Manage items and currency in game.')).toBeVisible();
  });

  test('another member never sees the first member’s character, even straight after it was cached', async ({
    page,
    context,
  }) => {
    const first = await fakeConsole.newMember('First Fremen', { details: { currency: { total: 111 } } });
    const second = await fakeConsole.newMember('Second Fremen', { details: { currency: { total: 222 } } });
    await signInAs(context, first);
    await page.goto('/character');
    await expect(page.getByRole('heading', { name: 'First Fremen' })).toBeVisible();

    await signInAs(context, second);
    await page.goto('/character');
    await expect(page.getByRole('heading', { name: 'Second Fremen' })).toBeVisible();
    await expect(page.getByText('First Fremen')).toHaveCount(0);
    await expect(page.getByText('111', { exact: true })).toHaveCount(0);

    await signInAs(context, first);
    await page.goto('/character');
    await expect(page.getByRole('heading', { name: 'First Fremen' })).toBeVisible();
    await expect(page.getByText('Second Fremen')).toHaveCount(0);
  });

  test('the main navigation keeps clean URLs through history and reload', async ({ page, context }) => {
    await signInAs(context, await fakeConsole.newMember('Navigator'));
    await page.goto('/portal');
    await page.goto('/character');
    await page.getByRole('navigation', { name: 'Primary' }).getByRole('link', { name: 'Portal', exact: true }).click();
    await expect(page).toHaveURL(/\/portal$/);
    await page.goBack();
    await expect(page).toHaveURL(/\/character$/);
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Navigator' })).toBeVisible();
    expect(page.url()).not.toContain('?');
  });

  test('workspace pages fit a phone without horizontal scrolling', async ({ page, context }) => {
    await signInAs(context, await fakeConsole.newMember('Phone User'));
    await page.setViewportSize({ width: 390, height: 844 });
    for (const route of ['/portal', '/character', '/storage', '/vehicles', '/market', '/guild']) {
      await page.goto(route);
      await expect(page.locator('main')).toBeVisible();
      await page.evaluate(() => document.fonts.ready);
      await expect.poll(() => overflow(page), { message: `${route} should not overflow horizontally` }).toBe(true);
    }
  });

  test('the market loading grid scrolls inside the phone workspace', async ({ page, context }) => {
    await signInAs(context, await fakeConsole.newMember('Loading Market User'));
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/market');
    await expect(page.getByRole('heading', { name: 'Market', exact: true })).toBeVisible();
    // Render the actual fallback under production CSS without racing the server's fast fixture.
    // A separate Node process avoids Playwright's component-test JSX transform.
    const markup = execFileSync(
      process.execPath,
      [
        '--import',
        'tsx',
        '--input-type=module',
        '-e',
        "import {createElement} from 'react'; import {renderToStaticMarkup} from 'react-dom/server'; import Loading from './src/app/(workspace)/market/loading.tsx'; process.stdout.write(renderToStaticMarkup(createElement(Loading)));",
      ],
      { encoding: 'utf8' },
    );
    await page.locator('.workspace-container').evaluate((container, markup) => {
      container.innerHTML = markup;
    }, markup);
    const loading = page.getByLabel('Loading market');
    await expect(loading).toBeVisible();
    expect(await overflow(page)).toBe(true);
    const scroll = loading.locator('ul').locator('..');
    expect(await scroll.evaluate((element) => element.scrollWidth > element.clientWidth)).toBe(true);
    await scroll.evaluate((element) => {
      element.scrollLeft = 100;
    });
    expect(await scroll.evaluate((element) => element.scrollLeft)).toBeGreaterThan(0);
  });
});

test.describe('vehicles', () => {
  const garage = {
    details: {
      vehicles: {
        rows: [
          {
            id: '1',
            name: 'Sandbike One',
            relationship: 'owner',
            owner_name: 'Driver',
            condition_percent: 99,
            fuel_percent: 40,
          },
          {
            id: 'c',
            name: 'BP_ContainerVehicle',
            type: 'BP_ContainerVehicle',
            relationship: 'owner',
            owner_name: 'Driver',
            condition_percent: 99,
            fuel_percent: 0,
            storage_used: 15,
            storage_capacity: 45,
          },
          { id: 's', name: 'Shared Buggy', relationship: 'shared', owner_name: 'Chani' },
        ],
      },
    },
  };

  test('owned and shared vehicles are separated and counted', async ({ page, context }) => {
    await signInAs(context, await fakeConsole.newMember('Driver', garage));
    await page.goto('/vehicles');
    const access = page.getByRole('navigation', { name: 'Vehicle access' });
    await expect(access.getByRole('link', { name: /Owned/ })).toContainText('2');
    await expect(access.getByRole('link', { name: /Shared/ })).toContainText('1');
    await expect(page.getByRole('article')).toHaveCount(2);
    await expect(page.getByRole('heading', { name: 'Shared Buggy' })).toHaveCount(0);
    await access.getByRole('link', { name: /Shared/ }).click();
    await expect(page).toHaveURL(/view=shared/);
    await expect(page.getByRole('heading', { name: 'Shared Buggy' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Sandbike One' })).toHaveCount(0);
  });

  test('container vehicles show cargo instead of fuel', async ({ page, context }) => {
    await signInAs(context, await fakeConsole.newMember('Driver', garage));
    await page.goto('/vehicles');
    const card = page.getByRole('article').filter({ hasText: 'BP_ContainerVehicle' });
    await expect(card.getByRole('meter', { name: 'Cargo' })).toHaveAttribute('aria-valuetext', '15 / 45 slots');
    await expect(card.getByRole('meter', { name: 'Fuel' })).toHaveCount(0);
    const bike = page.getByRole('article').filter({ hasText: 'Sandbike One' });
    await expect(bike.getByRole('meter', { name: 'Fuel' })).toHaveAttribute('aria-valuenow', '40');
  });

  test('a member with no vehicles sees an explanation, not an error', async ({ page, context }) => {
    await signInAs(context, await fakeConsole.newMember('Walker'));
    await page.goto('/vehicles?view=shared');
    await expect(page.getByRole('article')).toHaveCount(0);
    await expect(page.locator('main').getByRole('alert')).toHaveCount(0);
  });

  test('a member who is no longer linked sees none of the previous vehicles', async ({ page, context }) => {
    await signInAs(context, await fakeConsole.newMember('Driver', garage));
    await page.goto('/vehicles');
    await expect(page.getByRole('article')).toHaveCount(2);
    await signInAs(context, await fakeConsole.newMember('Unlinked', { linked: { linked: false } }));
    await page.goto('/vehicles');
    await expect(page.getByRole('article')).toHaveCount(0);
    await expect(page.getByText('Sandbike One')).toHaveCount(0);
  });
});

test.describe('market', () => {
  test('prices keep full precision and the exchange summary is shown', async ({ page, context }) => {
    await signInAs(context, await fakeConsole.newMember('Trader'));
    await page.goto('/market');
    await expect(page.getByRole('heading', { name: 'Market' })).toBeVisible();
    await expect(page.getByText('Spice').first()).toBeVisible();
    await expect(page.getByText('9,007,199,254,740,993')).toBeVisible();
  });

  test('my listings only ever shows orders that belong to the linked character', async ({ page, context }) => {
    await signInAs(context, await fakeConsole.newMember('Trader'));
    await page.goto('/market?owner=mine');
    await expect(page.getByText('Guild trader')).toHaveCount(0);
    await expect(page.getByText('9,007,199,254,740,993')).toHaveCount(0);
  });

  test('seller player IDs from the Console never reach the browser', async ({ context }) => {
    await signInAs(context, await fakeConsole.newMember('Trader'));
    const response = await context.request.get('/api/market/listings?templateId=spice&owner=all');
    expect(response.status()).toBe(200);
    const text = await response.text();
    expect(text).toContain('Guild trader');
    expect(text).not.toContain('seller-secret-1');
    expect(text).not.toContain('owner_id');
  });

  test('an unreachable exchange is reported without a stack or credentials', async ({ page, context }) => {
    await signInAs(context, await fakeConsole.newMember('Trader'));
    await fakeConsole.setShared({ failures: { '/api/exchange': 503 } });
    const response = await page.goto('/market');
    expect(response?.status()).toBeLessThan(500);
    expect(await page.content()).not.toMatch(/Bearer|browser-test-placeholder|stack/i);
  });
});

test.describe('public status and credentials', () => {
  test('the status API shows real counts to anonymous visitors and nothing else', async ({ request }) => {
    await fakeConsole.setShared({ online: { rows: [], totalCount: 12 }, players: { rows: [], totalCount: 240 } });
    const response = await request.get('/api/server/status');
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({ activePlayers: 12, totalPlayers: 240 });
    expect(JSON.stringify(body)).not.toMatch(/token|key|secret|password/i);
  });

  test('the Console is only called with a bearer credential, which is never sent to the browser', async ({
    page,
    context,
  }) => {
    await signInAs(context, await fakeConsole.newMember('Quiet'));
    await page.goto('/portal');
    const calls = await fakeConsole.requests();
    expect(calls.length).toBeGreaterThan(0);
    expect(calls.every((call) => call.authorized)).toBe(true);
    expect(await page.content()).not.toContain('browser-test-placeholder');
  });
});
