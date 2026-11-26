import { test, expect } from '../helpers/browser-test';
import { fakeConsole } from '../helpers/fake-console-client';
test.afterEach(async () => {
  await fakeConsole.reset();
});

test('solo members see honest base-care alerts and keep private plans without game writes', async ({ page }) => {
  const member = await fakeConsole.newMember('Solo upkeep', {
    linked: { pawnId: '7654331', controllerId: '7654332' },
    details: {
      bases: { rows: [{ id: '911', name: 'Upkeep home', relationship: 'owner', generatorRuntimeSeconds: 7200 }] },
      vehicles: { rows: [] },
    },
  });
  const roster = { supported: true, entries: [{ playerId: '7654332', canonical: true, rank: 1 }] };
  await fakeConsole.setShared({
    finderSources: {
      '/api/bases/911/permissions': roster,
      '/api/bases/911/child-access': {
        supported: true,
        rows: [
          { actorId: '933', currentAccess: 1 },
          { actorId: '934', currentAccess: 0 },
        ],
      },
      '/api/bases/911/inventory': {
        supported: true,
        containers: [
          { placeableId: '933', name: 'Supplies' },
          { placeableId: '934', name: 'Hidden vault' },
        ],
      },
    },
  });
  await page.context().setExtraHTTPHeaders({ Cookie: member.cookie });
  await page.goto('/upkeep');
  const inbox = page.getByRole('list', { name: 'Base-care warnings' });
  await expect(inbox).toContainText('Upkeep home: generator runtime 2h 0m');
  await expect(inbox).toContainText('includes an estimate');
  await expect(inbox).toContainText('Upkeep home: water reading unknown');

  await page.getByRole('link', { name: 'Base plans' }).click();
  await page.getByLabel('Water alert (%)').fill('30');
  await page.getByRole('button', { name: 'Save alert settings' }).click();
  await expect(page.getByText('Alert settings saved.')).toBeVisible();

  await page.getByRole('button', { name: 'Load accessible containers' }).click();
  await expect(
    page.getByText('1 accessible container(s). 1 restricted or unverifiable container(s) omitted.'),
  ).toBeVisible();
  await expect(page.getByText('Hidden vault')).toHaveCount(0);
  await page.getByLabel('Alias for container 933').fill('Med kit');
  await page.getByLabel('Zone for container 933').selectOption('Medical');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByText('Container label saved.')).toBeVisible();

  await page.getByLabel('Result for Doors and access checked in game').selectOption('attention');
  await page.getByRole('button', { name: 'Record inspection' }).click();
  await expect(page.getByText('Inspection recorded.')).toBeVisible();
  await expect(page.getByText(/1 item\(s\) needed attention/)).toBeVisible();

  await page.getByRole('link', { name: 'Reminders', exact: true }).click();
  await page.getByLabel('Title').fill('Top up fuel cells');
  await page.getByLabel('First due').fill('2026-01-01T08:00');
  await page.getByRole('button', { name: 'Save reminder' }).click();
  await expect(page.getByText('Reminder saved.')).toBeVisible();
  await page.getByRole('link', { name: 'Care inbox' }).click();
  await expect(inbox).toContainText('Top up fuel cells');
  await page.getByRole('link', { name: 'Reminders', exact: true }).click();
  await page.getByRole('button', { name: 'Mark done' }).click();
  await expect(page.getByText('Completion recorded.')).toBeVisible();

  await page.setViewportSize({ width: 320, height: 700 });
  await page.reload();
  await expect(page.getByRole('list', { name: 'Maintenance reminders' })).toContainText('Last marked done');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const calls = await fakeConsole.requests();
  // Only the adapter's linked-character lookup uses POST; every Console game-data call is a GET.
  expect(
    calls
      .filter((entry) => entry.method !== 'GET')
      .every((entry) => entry.path === '/api/integrations/discord/players/me'),
  ).toBe(true);
  expect(calls.some((entry) => entry.path.startsWith('/api/bases/911/'))).toBe(true);
  expect(calls.some((entry) => entry.path.includes('/containers/93'))).toBe(false);
});
