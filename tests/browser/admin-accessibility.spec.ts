import { expect, test } from '../helpers/browser-test';
import operations from '../../src/modules/admin/catalog.json';
import { ADMIN_SECTIONS } from '../../src/modules/admin/navigation';

const row = {
  id: '1',
  name: 'Example item with a deliberately long label to test wrapping behaviour',
  player_id: '9007199254740993123',
  base_id: '5',
  vehicle_id: '6',
  guild_id: '2',
  guild_name: 'Crimson Skies',
};
const sizes = [
  ['desktop', 1440, 900],
  ['tablet', 820, 1180],
  ['mobile', 390, 844],
] as const;

test.beforeEach(async ({ page, context }) => {
  await context.setExtraHTTPHeaders({ Cookie: '__Host-dashboard_session=browser-admin-session' });
  await page.route('**/api/admin/catalog', (route) =>
    route.fulfill({
      json: { ok: true, operations, configured: true, adapterConfigured: true, consoleOrigin: 'https://console.test' },
    }),
  );
  await page.route('**/api/admin/guild-support-status*', (route) =>
    route.fulfill({ json: { ok: true, data: { total: 3, guilds: { '2': 3 } } } }),
  );
  await page.route('**/api/admin/overview', (route) =>
    route.fulfill({
      json: {
        ok: true,
        data: {
          observedAt: new Date().toISOString(),
          metrics: [],
          services: [{ name: 'Game', state: 'Running' }],
          sources: [],
          setup: [],
        },
      },
    }),
  );
  await page.route('**/api/admin/execute', (route) =>
    route.fulfill({
      json: {
        ok: true,
        upstreamStatus: 200,
        data: { rows: [row], hasMore: false, services: ['game-1'], logs: ['line'], banned: false },
      },
    }),
  );
});

test('every administration tab fits desktop, tablet and mobile and names its controls', async ({ page }) => {
  test.setTimeout(240_000);
  const tabs = ADMIN_SECTIONS.flatMap((section) => section.tabs);
  const problems: string[] = [];
  for (const [label, width, height] of sizes) {
    await page.setViewportSize({ width, height });
    for (const tab of tabs) {
      await page.goto(`/admin?tab=${tab.id}`);
      await expect(page.getByRole('heading', { level: 1, name: tab.label, exact: true })).toBeVisible();
      await expect(page.getByText('Loading…', { exact: true })).toHaveCount(0);
      const result = await page.evaluate(() => {
        const unnamed = [
          ...document.querySelectorAll('main button, main a[href], main input, main select, main textarea'),
        ]
          .filter((element) => !(element as HTMLInputElement).hidden && (element as HTMLInputElement).type !== 'hidden')
          .filter((element) => {
            const control = element as HTMLInputElement;
            const name =
              element.getAttribute('aria-label') ||
              element.getAttribute('aria-labelledby') ||
              element.textContent?.trim() ||
              (control.labels && control.labels.length ? 'labelled' : '') ||
              element.getAttribute('title');
            return !name;
          })
          .map((element) => element.outerHTML.slice(0, 80));
        return { overflow: document.documentElement.scrollWidth - innerWidth, unnamed };
      });
      if (result.overflow > 0) problems.push(`${label} ${tab.id}: horizontal overflow ${result.overflow}px`);
      for (const html of result.unnamed) problems.push(`${label} ${tab.id}: unnamed control ${html}`);
    }
  }
  expect(problems).toEqual([]);
});

test('confirmation dialogs trap focus, close on Escape and return focus to their trigger', async ({ page }) => {
  await page.goto('/admin?tab=players&player=9007199254740993123&section=moderation');
  const trigger = page.getByRole('button', { name: 'Ban…', exact: true });
  await trigger.focus();
  await trigger.press('Enter');
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveAccessibleName('Ban player');
  expect(await page.evaluate(() => Boolean(document.activeElement?.closest('dialog')))).toBe(true);
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();
});
