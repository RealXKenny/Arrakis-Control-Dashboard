import { test, expect } from '../helpers/browser-test';
import { fakeConsole } from '../helpers/fake-console-client';
test.afterEach(async () => {
  await fakeConsole.reset();
});

const cutteray = (id: string, current: number) => ({
  id,
  item_name: 'Cutteray',
  template_id: 'Cutteray_T3',
  inventory_type: 0,
  stack_size: '1',
  quality_level: 3,
  current_durability: current,
  max_durability: 100,
});

test('solo members plan loadouts, compare gear, watch wear and record history at 320px', async ({ page }) => {
  const member = await fakeConsole.newMember('Solo planner', {
    details: {
      bases: { rows: [] },
      vehicles: { rows: [] },
      inventory: {
        rows: [
          cutteray('one', 80),
          cutteray('two', 20),
          { id: 'three', item_name: 'Water', template_id: 'Water', inventory_type: 0, stack_size: '40' },
        ],
      },
    },
  });
  await page.context().setExtraHTTPHeaders({ Cookie: member.cookie });
  await page.setViewportSize({ width: 320, height: 800 });
  await page.goto('/storage');
  const planner = page.getByRole('region', { name: 'Equipment planner' });
  await expect(planner.getByText('No loadouts yet.')).toBeVisible();

  await planner.getByRole('button', { name: 'New loadout' }).click();
  const editor = planner.getByRole('form', { name: 'Loadout editor' });
  await editor.getByLabel('Loadout name').fill('Spice run');
  await editor.getByLabel('Item name').fill('Cutteray');
  await editor.getByLabel('Template ID').fill('Cutteray_T3');
  await editor.getByLabel('Quantity').fill('2');
  await editor.getByLabel('Min durability %').fill('50');
  await editor.getByRole('button', { name: 'Save loadout' }).click();
  await expect(planner.getByText('Loadout Spice run saved.')).toBeVisible();

  await planner.getByRole('button', { name: 'Check equipment' }).click();
  const readiness = planner.getByRole('list', { name: 'Spice run readiness' });
  await expect(readiness).toContainText('Unsuitable · 1 suitable · 1 below requirements');
  await planner.getByRole('button', { name: 'Resupply checklist' }).click();
  const checklist = planner.getByRole('region', { name: 'Resupply checklist' });
  await expect(checklist).toContainText('Repair, upgrade or replace Cutteray');
  await checklist.getByRole('checkbox').check();

  await planner.getByRole('tab', { name: 'Gear and filters' }).click();
  const gear = planner.getByRole('list', { name: 'Matching gear' });
  await expect(gear.getByRole('listitem')).toHaveCount(2);
  await expect(gear).not.toContainText('Water');
  await gear.getByRole('button', { name: 'Compare' }).first().click();
  await gear.getByRole('button', { name: 'Compare' }).first().click();
  await expect(planner.getByRole('region', { name: 'Gear comparison' })).toContainText('highest reported');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await gear.getByRole('button', { name: 'Watch wear for Cutteray' }).first().click();
  await expect(planner.getByText('Cutteray added to the wear watchlist at 25%.')).toBeVisible();

  await planner.getByRole('tab', { name: 'Wear watchlist' }).click();
  await planner.getByRole('button', { name: 'Check equipment' }).click();
  await expect(planner.getByRole('list', { name: 'Watched gear' })).toContainText('1 below 25% · 0 unknown');

  await planner.getByRole('tab', { name: 'Change history' }).click();
  await planner.getByRole('button', { name: 'Record snapshot' }).click();
  await expect(planner.getByText('Snapshot recorded.')).toBeVisible();
  await expect(planner.getByRole('list', { name: 'Recorded snapshots' })).toContainText('2 item types');

  await page.reload();
  await expect(planner.getByRole('list', { name: 'Spice run readiness' })).toBeVisible();
  await expect(planner.getByText('Not checked')).toBeVisible();
  const requests = await fakeConsole.requests();
  // Game reads stay read-only; nothing is equipped, moved or repaired.
  const gameReads = requests.filter((entry) => /^\/api\/(players|bases|vehicles)\//.test(entry.path));
  expect(gameReads.length).toBeGreaterThan(0);
  expect(gameReads.every((entry) => entry.method === 'GET')).toBe(true);
});

test('equipment plans stay private to the account', async ({ page }) => {
  const member = await fakeConsole.newMember('Planner owner');
  await page.context().setExtraHTTPHeaders({ Cookie: member.cookie });
  await page.goto('/storage');
  const planner = page.getByRole('region', { name: 'Equipment planner' });
  await planner.getByRole('tab', { name: 'Storage suggestions' }).click();
  await planner.getByLabel('Container label contains').fill('Medical');
  await planner.getByLabel('Item name or template contains').fill('Healkit');
  await planner.getByRole('button', { name: 'Add rule' }).click();
  await expect(planner.getByRole('list', { name: 'Storage rules' })).toContainText('Healkit');
  const other = await fakeConsole.newMember('Other planner');
  await page.context().setExtraHTTPHeaders({ Cookie: other.cookie });
  await page.reload();
  await planner.getByRole('tab', { name: 'Storage suggestions' }).click();
  await expect(planner.getByRole('list', { name: 'Storage rules' })).not.toContainText('Healkit');
});
