import { test, expect } from '../helpers/browser-test';
import type { Page } from '@playwright/test';
import { fakeConsole } from '../helpers/fake-console-client';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const axeSource = readFileSync(createRequire(import.meta.url).resolve('axe-core/axe.min.js'), 'utf8');

test.use({ timezoneId: 'America/New_York' });
test.afterEach(async () => {
  await fakeConsole.reset();
});

async function expectNoAxeViolations(page: Page) {
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
}

test('calendar requires a member session', async ({ page }) => {
  await page.goto('/calendar');
  await expect(page).toHaveURL(/\/login/);
});

test('calendar keeps unavailable maintenance explicit without inventing commitments', async ({ page, context }) => {
  const member = await fakeConsole.newMember('Calendar without guild');
  await fakeConsole.setShared({ failures: { '/api/server/restart-queue': 503 } });
  await context.setExtraHTTPHeaders({ Cookie: member.cookie });
  await page.goto('/calendar');
  await expect(page.getByText('Maintenance information is unavailable.')).toBeVisible();
  await expect(page.getByText('Personal guild commitments could not be verified and are hidden.')).toHaveCount(0);
  await expect(page.getByText(/1 community event\(s\) have no reported start time/)).toBeVisible();
  await expect(page.getByRole('region', { name: 'Agenda' })).toContainText('No scheduled items');
});

test('calendar shows only own commitments with local-time controls, responsive layouts and no axe violations', async ({
  page,
  context,
}) => {
  const restartAt = Date.now() + 3_600_000;
  await fakeConsole.setShared({
    finderSources: {
      '/api/server/restart-queue': {
        state: {
          entries: [
            {
              id: 'calendar-restart',
              status: 'counting',
              target: 'map',
              mapLabel: 'Hagga Basin',
              restartAt,
            },
          ],
        },
      },
    },
  });
  const leader = await fakeConsole.newMember('Calendar Leader', { guild: { id: '2', role: 100 } });
  await context.setExtraHTTPHeaders({ Cookie: leader.cookie });
  await page.goto('/guild?tab=operations');
  const planner = page.getByRole('region', { name: 'Guild operations planner' });
  await planner.getByRole('button', { name: 'New operation', exact: true }).click();
  await planner.getByLabel('Operation title').fill('Calendar spice patrol');
  await planner.getByLabel('Meeting point').fill('South guild base');
  await planner.getByLabel('Operation details').fill('Private calendar operation details.');
  await planner.getByRole('button', { name: 'Save operation', exact: true }).click();
  const operation = planner.getByRole('article', { name: 'Calendar spice patrol', exact: true });
  await expect(operation).toBeVisible();

  const member = await fakeConsole.newMember('Calendar Member', { guild: { id: '2', role: 1 } });
  await context.setExtraHTTPHeaders({ Cookie: member.cookie });
  await page.goto('/guild?tab=operations');
  await operation.getByRole('button', { name: 'Join as Pilot', exact: true }).click();
  await expect(operation.getByRole('button', { name: 'Your role: Pilot' })).toBeDisabled();
  await page.goto('/calendar');
  const agenda = page.getByRole('region', { name: 'Agenda' });
  await expect(agenda).toContainText('Calendar spice patrol');
  await expect(agenda).toContainText('Private calendar operation details.');
  await expect(agenda).toContainText('Hagga Basin restart');
  await expect(agenda).toContainText('confirmed');
  await expect(agenda.locator(`time[datetime="${new Date(restartAt).toISOString()}"]`)).toHaveAttribute(
    'title',
    /America\/New_York/,
  );
  await expect(agenda).not.toContainText('Patrol Pilot');
  await expectNoAxeViolations(page);

  await page.getByRole('button', { name: /^week$/i }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('button', { name: 'Next week' })).toBeVisible();
  await page.getByRole('button', { name: 'Next week' }).click();
  await page.getByRole('button', { name: 'Previous week' }).click();
  await page.getByRole('button', { name: /^month$/i }).click();
  await expect(page.getByRole('button', { name: 'Previous month' })).toBeVisible();
  await page.getByLabel('Category').selectOption('maintenance');
  await expect(page.getByText('Hagga Basin restart')).toHaveCount(1);
  await expect(page.getByText('Calendar spice patrol')).toHaveCount(0);
  await expectNoAxeViolations(page);

  for (const width of [1920, 1280, 390, 320]) {
    await page.setViewportSize({ width, height: width < 500 ? 844 : 1080 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  await page.getByRole('button', { name: /^agenda$/i }).click();
  await page.getByLabel('Category').selectOption('all');

  const observer = await fakeConsole.newMember('Calendar Observer', { guild: { id: '2', role: 1 } });
  await context.setExtraHTTPHeaders({ Cookie: observer.cookie });
  await page.goto('/calendar');
  await expect(page.getByRole('region', { name: 'Agenda' })).toContainText('Hagga Basin restart');
  await expect(page.getByText('Calendar spice patrol')).toHaveCount(0);
  await expect(page.getByText('Private calendar operation details.')).toHaveCount(0);
});
