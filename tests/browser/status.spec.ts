import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { test, expect } from '../helpers/browser-test';

const REPORT = 'https://wl.hetrixtools.com/r/6fb3cbf6a8f67831f3e046b945b82450/';
const child = readFileSync('node_modules/iframe-resizer/js/iframeResizer.contentWindow.js', 'utf8');
const axeSource = readFileSync(createRequire(import.meta.url).resolve('axe-core/axe.min.js'), 'utf8');

test('capability checks are manual and report sanitized states', async ({ page }) => {
  await page.context().setExtraHTTPHeaders({ Cookie: '__Host-dashboard_session=browser-member-session' });
  let calls = 0;
  await page.route('**/api/v2/monitoring/capabilities', (route) => {
    calls++;
    return route.fulfill({
      json: {
        ok: true,
        readings: [
          {
            id: 'population',
            label: 'Online population',
            state: 'permission',
            checkedAt: new Date().toISOString(),
            lastSuccessAt: null,
          },
        ],
      },
    });
  });
  await page.goto('/status');
  const report = page.getByRole('region', { name: 'Integration capabilities' });
  expect(calls).toBe(0);
  await report.getByRole('button', { name: 'Check capabilities' }).click();
  await expect(report).toContainText('Credential or permission refused');
  await expect(report).toContainText('not recorded');
  expect(calls).toBe(1);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.evaluate(axeSource);
  const violations = await page.evaluate(async () => {
    const axe = (
      window as unknown as {
        axe: { run(document: Document, options: object): Promise<{ violations: { id: string }[] }> };
      }
    ).axe;
    return (await axe.run(document, { runOnly: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'] })).violations.map(
      (item) => item.id,
    );
  });
  expect(violations).toEqual([]);
});

test('shows the confirmed queue and clears it when the provider becomes unavailable', async ({ page }) => {
  await page.context().setExtraHTTPHeaders({ Cookie: '__Host-dashboard_session=browser-member-session' });
  let available = true;
  await page.route('**/api/v2/monitoring/restart-queue', (route) => {
    const now = Date.now();
    return route.fulfill({
      status: available ? 200 : 503,
      json: available
        ? {
            ok: true,
            serverTime: now,
            observedAt: now,
            entries: [
              { id: 'one', status: 'counting', target: 'map', mapLabel: 'Hagga Basin', restartAt: now + 600000 },
            ],
          }
        : { ok: false },
    });
  });
  await page.clock.install();
  await page.goto('/status');
  const queue = page.getByRole('region', { name: 'Active restart queue' });
  const history = page.getByRole('region', { name: 'Recent verified restarts' });
  await expect(history).toContainText('Hagga Basin');
  await expect(history).toContainText('duration 60 seconds');
  await expect(history).not.toContainText('private-operator-reason');
  await expect(queue).toContainText('Hagga Basin');
  await expect(queue).toContainText('may restart in 10 min');
  await expect(queue).toContainText('Daily and IP-change restarts may not appear');
  available = false;
  await page.clock.fastForward(21000);
  await expect(queue).toContainText('Restart information is unavailable.');
  await expect(queue).not.toContainText('Hagga Basin');
});

test('service report requires a dashboard session', async ({ page }) => {
  await page.goto('/status');
  await expect(page).toHaveURL(/\/login/);
  await expect(page.locator('#hetrix-status-report')).toHaveCount(0);
});

test('report stays under Community on wide screens and mobile and resizes through the real iframe protocol', async ({
  page,
}) => {
  await page.context().setExtraHTTPHeaders({ Cookie: '__Host-dashboard_session=browser-member-session' });
  await page.route(REPORT, (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: `<!doctype html><html><body style="margin:0"><div style="height:1800px">Fixture hosting report</div><script>${child}</script></body></html>`,
    }),
  );
  for (const width of [2560, 1920, 1600, 1280, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/portal');
    if (width >= 1280) {
      const primary = page.getByRole('navigation', { name: 'Primary', exact: true });
      await expect(primary.getByRole('link', { name: 'Service status', exact: true })).toHaveCount(0);
      await primary.getByRole('button', { name: 'Community', exact: true }).click();
      await page.getByRole('menuitem', { name: /Service status/ }).click();
    } else {
      await page.getByRole('button', { name: 'Open menu', exact: true }).click();
      const drawer = page.getByRole('dialog', { name: 'Navigation', exact: true });
      await expect(drawer.getByRole('heading', { name: 'News & status', exact: true })).toBeVisible();
      await drawer.getByRole('link', { name: 'Service status', exact: true }).click();
    }
    await expect(page).toHaveURL(/\/status$/);
    await expect(page.getByRole('heading', { name: 'Service status', exact: true })).toBeVisible();
    const frame = page.locator('#hetrix-status-report');
    await expect(frame).toHaveAttribute('src', REPORT);
    await expect(frame).toHaveAttribute('sandbox', 'allow-scripts allow-same-origin allow-popups');
    await expect(frame).toHaveAttribute('referrerpolicy', 'no-referrer');
    await expect.poll(() => frame.evaluate((element) => parseFloat(element.style.height))).toBeGreaterThan(1700);
    await expect(page.getByText('Loading service report…')).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Open report in a new tab' })).toHaveAttribute(
      'rel',
      'noopener noreferrer',
    );
    const overflow = await page.evaluate(() => ({
      width: innerWidth,
      scroll: document.documentElement.scrollWidth,
      elements: [...document.querySelectorAll('body *')]
        .filter((element) => element.getBoundingClientRect().right > innerWidth + 1)
        .slice(0, 6)
        .map((element) => ({
          tag: element.tagName,
          class: element.className,
          right: element.getBoundingClientRect().right,
        })),
    }));
    expect(overflow.scroll, JSON.stringify(overflow)).toBeLessThanOrEqual(overflow.width);
    const portal = page.waitForResponse(
      (response) => new URL(response.url()).pathname === '/portal' && response.request().isNavigationRequest(),
    );
    if (width >= 1280) {
      await page
        .getByRole('navigation', { name: 'Primary', exact: true })
        .getByRole('link', { name: 'Portal', exact: true })
        .click();
    } else {
      await page.getByRole('button', { name: 'Open menu', exact: true }).click();
      await page
        .getByRole('dialog', { name: 'Navigation', exact: true })
        .getByRole('link', { name: 'Portal', exact: true })
        .click();
    }
    expect((await portal).headers()['content-security-policy']).not.toContain('wl.hetrixtools.com');
  }
});

test('health timeline separates observations from restarts and remains accessible on mobile', async ({ page }) => {
  await page.context().setExtraHTTPHeaders({ Cookie: '__Host-dashboard_session=browser-member-session' });
  await page.goto('/status');
  const timeline = page.getByRole('region', { name: 'Health and restart timeline' });
  await expect(timeline).toContainText('Observed outage');
  await expect(timeline).toContainText('Healthy reading recovered the observation');
  await expect(timeline).toContainText('Verified restart — completed');
  await expect(timeline).not.toContainText('private-operator-reason');
  await timeline.getByLabel('Entry type').selectOption('observation');
  await expect(timeline).not.toContainText('Verified restart — completed');
  await timeline.getByLabel('Observed state').selectOption('unavailable');
  await expect(timeline).toContainText('No health episodes or restart records match this view.');
  await timeline.getByLabel('Observed state').selectOption('outage');
  await expect(timeline).toContainText('Observed outage');
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.evaluate(axeSource);
  const violations = await page.evaluate(async () => {
    const axe = (
      window as unknown as {
        axe: { run(document: Document, options: object): Promise<{ violations: { id: string }[] }> };
      }
    ).axe;
    return (await axe.run(document, { runOnly: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'] })).violations.map(
      (item) => item.id,
    );
  });
  expect(violations).toEqual([]);
});
