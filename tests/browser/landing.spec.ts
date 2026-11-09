import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import type { Page } from '@playwright/test';
import { expect, test } from '../helpers/browser-test';

/**
 * The landing page (`/`) and the topbar Home control, in a real browser against the production build.
 * Screenshots land in test-results/landing/ (ignored by Git) so the page can be inspected after every run.
 */
const MEMBER = '__Host-dashboard_session=browser-member-session';
const SHOTS = 'test-results/landing';
const WIDTHS = [320, 390, 768, 1024, 1440, 3432] as const;
const axeSource = readFileSync(createRequire(import.meta.url).resolve('axe-core/axe.min.js'), 'utf8');

const noSideScroll = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);

async function accessibilityProblems(page: Page) {
  await page.evaluate(axeSource);
  return page.evaluate(async () => {
    const results = await (
      window as unknown as {
        axe: {
          run: (
            c: Document,
            o: object,
          ) => Promise<{ violations: Array<{ id: string; impact: string; nodes: Array<{ target: string[] }> }> }>;
        };
      }
    ).axe.run(document, { runOnly: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] });
    return results.violations.map(
      (v) =>
        `${v.id} (${v.impact}): ${v.nodes
          .slice(0, 3)
          .map((n) => n.target.join(' '))
          .join(' | ')}`,
    );
  });
}

test.describe('landing page, signed out', () => {
  test('introduces the product, with working calls to action', async ({ page }) => {
    const response = await page.goto('/');
    expect(response?.status()).toBe(200);
    await expect(page).toHaveTitle('Arrakis Control | Dune: Awakening server dashboard');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(/Arrakis\s+Control/i);
    await expect(
      page.getByText('A modern command center for Dune: Awakening servers, players, guilds, and communities.'),
    ).toBeVisible();

    const signIn = page.getByRole('link', { name: 'Sign in with Discord' }).first();
    await expect(signIn).toBeVisible();
    await expect(signIn).toHaveAttribute('href', '/login');
    await signIn.click();
    await expect(page).toHaveURL(/\/login/);

    await page.goto('/');
    await page.getByRole('link', { name: 'Explore features' }).click();
    await expect(page).toHaveURL(/#features$/);
    await expect(page.getByRole('heading', { name: 'What you can do with it' })).toBeInViewport();
  });

  test('every link resolves, and public pages promise nothing private', async ({ page, request }) => {
    await page.goto('/');
    const hrefs = await page
      .locator('main a[href]')
      .evaluateAll((anchors) => [...new Set(anchors.map((a) => a.getAttribute('href')!))]);
    expect(hrefs.length).toBeGreaterThan(8);
    for (const href of hrefs.filter((h) => h.startsWith('/'))) {
      const reply = await request.get(href, { maxRedirects: 0 });
      // A signed-out visitor is sent to sign in; nothing returns an error.
      expect([200, 307, 308], `${href} -> ${reply.status()}`).toContain(reply.status());
    }
    const html = await page.content();
    expect(html).not.toMatch(/browser-member-session|__Host-dashboard_session|Pool member|Test member/);
    await expect(page.locator('a[href="/admin"]')).toHaveCount(0);
  });

  test('fits every screen width without sideways scrolling or clipped text', async ({ page }) => {
    await page.goto('/');
    for (const width of WIDTHS) {
      await page.setViewportSize({ width, height: 900 });
      expect(await noSideScroll(page), `${width}px`).toBe(true);
      const clipped = await page.evaluate(() =>
        [...document.querySelectorAll('main h1, main h2, main h3, main p, main a')]
          .filter((el) => el.scrollWidth > el.clientWidth + 1 && getComputedStyle(el).overflow !== 'visible')
          .map((el) => el.textContent?.slice(0, 40)),
      );
      expect(clipped, `${width}px`).toEqual([]);
    }
  });

  test('shows the call to action above the fold on a phone, and the page at ultrawide stays centred', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    await expect(page.getByRole('link', { name: 'Sign in with Discord' }).first()).toBeInViewport();
    await page.setViewportSize({ width: 3432, height: 1308 });
    const box = await page.locator('main h1').boundingBox();
    expect(box!.x).toBeGreaterThan(900); // not hugging the left edge of a 3432px screen
  });

  test('has no obsolete content on screen', async ({ page }) => {
    await page.goto('/');
    const body = (await page.locator('main').innerText()).toLowerCase();
    for (const old of [
      'deep desert command',
      'changelog broadcasts',
      'sandworm activity: low',
      '25 listings',
      'new in v2',
      'demo credits',
    ])
      expect(body, old).not.toContain(old);
    await expect(page.getByText('Closed by default: a server administrator must switch it on')).toBeVisible();
  });

  test('passes automated accessibility checks on desktop and mobile', async ({ page }) => {
    for (const [width, height] of [
      [1440, 900],
      [390, 844],
    ] as const) {
      await page.setViewportSize({ width, height });
      await page.goto('/');
      await page.waitForLoadState('networkidle');
      expect(await accessibilityProblems(page), `${width}px`).toEqual([]);
    }
  });

  test('every interactive control can be reached and shows a visible focus ring', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    const seen = new Set<string>();
    for (let step = 0; step < 40; step += 1) {
      await page.keyboard.press('Tab');
      const info = await page.evaluate(() => {
        const el = document.activeElement as HTMLElement | null;
        if (!el || el === document.body) return null;
        const style = getComputedStyle(el);
        return {
          label: (el.getAttribute('aria-label') ?? el.textContent ?? '').trim().slice(0, 40),
          outline: style.outlineStyle !== 'none' && parseFloat(style.outlineWidth) >= 2,
          tag: el.tagName,
        };
      });
      if (!info) continue;
      seen.add(info.label);
      if (info.tag === 'A' && /Explore features|Sign in with Discord|Release notes/.test(info.label))
        expect(info.outline, info.label).toBe(true);
    }
    for (const reached of ['Sign in with Discord', 'Explore features', 'Release notes'])
      expect([...seen].join('|')).toContain(reached);
  });

  test('screenshots: desktop, mobile, hero and the feature showcase', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.screenshot({ path: `${SHOTS}/landing-desktop.png`, fullPage: true });
    await page.locator('section[aria-labelledby="landing-title"]').screenshot({ path: `${SHOTS}/hero-desktop.png` });
    await page.locator('#features').screenshot({ path: `${SHOTS}/features-desktop.png` });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.screenshot({ path: `${SHOTS}/landing-mobile.png`, fullPage: true });
    await page.locator('section[aria-labelledby="landing-title"]').screenshot({ path: `${SHOTS}/hero-mobile.png` });
    await page.setViewportSize({ width: 320, height: 700 });
    await page.screenshot({ path: `${SHOTS}/landing-320.png`, fullPage: true });
  });
});

test.describe('landing page, signed in', () => {
  test.beforeEach(async ({ context }) => {
    await context.setExtraHTTPHeaders({ Cookie: MEMBER });
  });

  test('offers the dashboard, never sign-in, and still exposes nothing private', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('link', { name: /sign in/i })).toHaveCount(0);
    const open = page.getByRole('link', { name: 'Open dashboard' });
    await expect(open).toHaveCount(2);
    await open.first().click();
    await expect(page).toHaveURL(/\/portal$/);
    await page.goto('/');
    const html = await page.locator('main').innerHTML();
    expect(html).not.toMatch(/Test member|Server Alias|123456789000000000/);
  });

  test('passes automated accessibility checks, including the topbar', async ({ page }) => {
    for (const [width, height] of [
      [1440, 900],
      [390, 844],
    ] as const) {
      await page.setViewportSize({ width, height });
      await page.goto('/');
      await page.waitForLoadState('networkidle');
      expect(await accessibilityProblems(page), `${width}px`).toEqual([]);
    }
  });
});

test.describe('topbar Home control', () => {
  test.beforeEach(async ({ context }) => {
    await context.setExtraHTTPHeaders({ Cookie: MEMBER });
  });

  const ROUTES = [
    '/portal',
    '/character',
    '/holdings',
    '/vehicles',
    '/market',
    '/guilds',
    '/map',
    '/chat',
    '/casino',
    '/casino/wallet',
    '/casino/games/great-houses',
    '/bases',
    '/bases/upload',
  ];
  const desktopHome = (page: Page) =>
    page.getByRole('navigation', { name: 'Primary', exact: true }).getByRole('link', { name: 'Home', exact: true });
  const compactHome = (page: Page) => page.getByRole('banner').getByRole('link', { name: 'Home', exact: true });

  test('sits first in the primary navigation, with an icon and its name', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/portal');
    const links = page.getByRole('navigation', { name: 'Primary', exact: true }).getByRole('link');
    await expect(links.first()).toHaveText(/Home/i);
    await expect(desktopHome(page)).toHaveAttribute('href', '/');
    await expect(desktopHome(page).locator('svg')).toBeVisible();
    await expect(desktopHome(page)).not.toHaveAttribute('aria-current', 'page');
    // One Home control at a time: the compact one belongs to narrower screens.
    await expect(compactHome(page)).toHaveCount(1);
    await expect(page.getByRole('banner').getByRole('link', { name: 'Home', exact: true }).first()).toBeVisible();
  });

  test('takes the member to the landing page from every dashboard section', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    for (const route of ROUTES) {
      await page.goto(route);
      await desktopHome(page).click();
      await expect(page, route).toHaveURL(/\/$/);
      await expect(page.getByRole('heading', { level: 1 }), route).toHaveText(/Arrakis\s+Control/i);
    }
  });

  test('is marked as the current page on the landing page itself', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    await expect(desktopHome(page)).toHaveAttribute('aria-current', 'page');
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(compactHome(page)).toHaveAttribute('aria-current', 'page');
  });

  test('works from the keyboard, with a visible focus ring', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/casino');
    for (
      let step = 0;
      step < 8 && !(await desktopHome(page).evaluate((el) => el === document.activeElement));
      step += 1
    )
      await page.keyboard.press('Tab');
    await expect(desktopHome(page)).toBeFocused();
    const ring = await desktopHome(page).evaluate((el) => {
      const style = getComputedStyle(el);
      return { style: style.outlineStyle, width: parseFloat(style.outlineWidth) };
    });
    expect(ring).toEqual({ style: 'solid', width: 2 });
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/$/);
  });

  test('is a compact control on tablets and phones that still reaches the landing page', async ({ page }) => {
    for (const [width, label] of [
      [820, true],
      [390, false],
      [375, false],
      [360, false],
      [320, false],
    ] as const) {
      await page.setViewportSize({ width, height: 844 });
      await page.goto('/guilds');
      await expect(page.getByRole('navigation', { name: 'Primary', exact: true })).toBeHidden();
      const home = compactHome(page);
      await expect(home).toBeVisible();
      const box = await home.boundingBox();
      expect(box!.height, `${width}px touch target`).toBeGreaterThanOrEqual(44);
      expect(box!.width).toBeGreaterThanOrEqual(44);
      if (label) await expect(home.getByText('Home')).toBeVisible();
      else await expect(home.getByText('Home')).toBeHidden();
      expect(await noSideScroll(page), `${width}px`).toBe(true);
      await home.click();
      await expect(page, `${width}px`).toHaveURL(/\/$/);
    }
  });

  test('is not repeated inside the mobile menu, and the other controls still work', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/chat');
    await page.getByRole('button', { name: 'Open menu' }).click();
    const drawer = page.locator('#mobile-nav');
    await expect(drawer).toBeVisible();
    await expect(drawer.getByRole('link', { name: 'Home', exact: true })).toHaveCount(0);
    await expect(drawer.getByRole('link', { name: 'Portal' }).first()).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(drawer).toBeHidden();
    await expect(page.getByRole('button', { name: 'Notifications' })).toBeVisible();
    await expect(compactHome(page)).toBeVisible();
  });

  test('leaves the desktop topbar controls working', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/guilds');
    const primary = page.getByRole('navigation', { name: 'Primary', exact: true });
    await primary.getByRole('link', { name: 'Portal', exact: true }).click();
    await expect(page).toHaveURL(/\/portal$/);
    await page.getByRole('button', { name: 'Notifications' }).click();
    await expect(page.getByRole('menu', { name: 'Notifications' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('menu', { name: 'Notifications' })).toHaveCount(0);
    await primary.getByRole('button', { name: 'Bases', exact: true }).click();
    await expect(page.getByRole('menu', { name: 'Bases', exact: true })).toBeVisible();
  });

  test('screenshots: the topbar with Home, and Home reached from a nested route', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/casino/wallet');
    await page.waitForLoadState('networkidle');
    await page.getByRole('banner').screenshot({ path: `${SHOTS}/topbar-desktop-nested-route.png` });
    await page.screenshot({ path: `${SHOTS}/nested-route-before-home.png` });
    await desktopHome(page).click();
    await expect(page).toHaveURL(/\/$/);
    await page.waitForLoadState('networkidle');
    await page.screenshot({ path: `${SHOTS}/after-home-click.png` });
    await page.getByRole('banner').screenshot({ path: `${SHOTS}/topbar-desktop-on-landing.png` });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/casino/wallet');
    await page.getByRole('banner').screenshot({ path: `${SHOTS}/topbar-mobile-nested-route.png` });
  });
});
