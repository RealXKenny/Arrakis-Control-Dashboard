import { expect, test } from '../helpers/browser-test';
import { fakeConsole } from '../helpers/fake-console-client';

test.afterEach(async () => {
  await fakeConsole.reset();
});

test('operation waitlists, briefings, waypoints and readiness work end to end', async ({ page, context }) => {
  const leader = await fakeConsole.newMember('Logistics Leader', { guild: { id: '2', role: 100 } });
  await context.setExtraHTTPHeaders({ Cookie: leader.cookie });
  await page.goto('/guild?tab=operations');
  const planner = page.getByRole('region', { name: 'Guild operations planner' });
  await planner.getByRole('button', { name: 'New operation', exact: true }).click();
  await planner.getByLabel('Operation title').fill('Carrier escort');
  await planner.getByLabel('Meeting point').fill('North hangar');
  await planner.getByLabel('Pilot slots').fill('1');
  await planner.getByLabel('Scout slots').fill('0');
  await planner.getByLabel('Escort slots').fill('0');
  await planner.getByRole('button', { name: 'Add preparation item', exact: true }).click();
  await planner.getByRole('textbox', { name: 'Preparation item 1', exact: true }).fill('Full fuel cells');
  await planner.getByLabel('Pilot briefing').fill('Hold low altitude over the ridge.');
  await planner.getByRole('button', { name: 'Add waypoint', exact: true }).click();
  await planner.getByLabel('Waypoint 1 label').fill('Ridge rally');
  await planner.getByLabel('Waypoint 1 world X').fill('1200');
  await planner.getByLabel('Waypoint 1 world Y').fill('-3400');
  await planner.getByRole('button', { name: 'Save operation', exact: true }).click();
  const operation = planner.getByRole('article', { name: 'Carrier escort', exact: true });
  await expect(operation).toBeVisible();
  await expect(operation.getByRole('link', { name: 'Show on map for Ridge rally' })).toHaveAttribute(
    'href',
    '/map/hagga-basin?pin=1200%2C-3400&label=Ridge+rally',
  );

  const first = await fakeConsole.newMember('First Pilot', { guild: { id: '2', role: 1 } });
  await context.setExtraHTTPHeaders({ Cookie: first.cookie });
  await page.goto('/guild?tab=operations');
  await expect(operation.getByText('Hold low altitude over the ridge.')).toHaveCount(0);
  await operation.getByRole('button', { name: 'Join as Pilot', exact: true }).click();
  await expect(operation.getByText('Hold low altitude over the ridge.')).toBeVisible();
  await operation.getByRole('button', { name: 'Share my readiness', exact: true }).click();
  await operation.getByLabel('Full fuel cells').check();
  await operation.getByLabel('Kit note').fill('Spare welding torch');
  await operation.getByRole('button', { name: 'Share readiness', exact: true }).click();
  await expect(operation.getByText('Ready · 1/1 items ticked')).toBeVisible();

  const second = await fakeConsole.newMember('Second Pilot', { guild: { id: '2', role: 1 } });
  await context.setExtraHTTPHeaders({ Cookie: second.cookie });
  await page.goto('/guild?tab=operations');
  await expect(operation.getByRole('button', { name: 'Join as Pilot', exact: true })).toBeDisabled();
  await operation.getByRole('button', { name: 'Join Pilot waitlist', exact: true }).click();
  await expect(operation.getByText('Your waitlist place: 1')).toBeVisible();

  await context.setExtraHTTPHeaders({ Cookie: first.cookie });
  await page.goto('/guild?tab=operations');
  await operation.getByRole('button', { name: 'Withdraw sign-up', exact: true }).click();

  await context.setExtraHTTPHeaders({ Cookie: second.cookie });
  await page.goto('/guild?tab=operations');
  await operation.getByRole('button', { name: 'Accept Pilot seat', exact: true }).click();
  await expect(operation.getByRole('button', { name: 'Your role: Pilot' })).toBeDisabled();
  const payload = JSON.stringify(await (await page.request.get('/api/v2/guilds/2/operations')).json());
  expect(payload).not.toContain('memberId');
});

test('members share availability and leaders keep reusable templates', async ({ page, context }) => {
  const leader = await fakeConsole.newMember('Template Leader', { guild: { id: '2', role: 100 } });
  await context.setExtraHTTPHeaders({ Cookie: leader.cookie });
  await page.goto('/guild?tab=logistics');
  const logistics = page.getByRole('region', { name: 'Guild logistics' });
  await logistics.getByRole('button', { name: 'New template', exact: true }).click();
  await logistics.getByLabel('Template name').fill('Saturday spice');
  await logistics.getByLabel('Operation title').fill('Saturday spice run');
  await logistics.getByLabel('Template meeting point').fill('South base');
  await logistics.getByLabel('Schedule timezone').fill('UTC');
  await logistics.getByRole('button', { name: 'Save template', exact: true }).click();
  await expect(logistics.getByText('Template saved.')).toBeVisible();
  await expect(logistics.getByText(/Next suggested start/)).toBeVisible();

  await logistics.getByRole('button', { name: 'Availability', exact: true }).click();
  await logistics.getByLabel('My timezone').fill('UTC');
  await logistics.getByRole('button', { name: 'Save my availability', exact: true }).click();
  await expect(logistics.getByText('Your availability is saved.')).toBeVisible();
  await expect(logistics.getByRole('list', { name: 'Suggested start times' })).toBeVisible();

  await logistics.getByRole('button', { name: 'Landsraad campaign', exact: true }).click();
  await expect(logistics.getByText(/Landsraad objectives are unavailable right now/)).toBeVisible();

  await page.goto('/guild?tab=operations');
  const planner = page.getByRole('region', { name: 'Guild operations planner' });
  await planner.getByRole('button', { name: 'New from template', exact: true }).click();
  await planner.getByLabel('Operation template').selectOption({ label: 'Saturday spice' });
  await planner.getByRole('button', { name: 'Use template', exact: true }).click();
  await expect(planner.getByLabel('Operation title')).toHaveValue('Saturday spice run');
  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
});
