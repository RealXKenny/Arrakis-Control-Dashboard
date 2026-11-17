import { expect, test } from '../helpers/browser-test';
import { fakeConsole } from '../helpers/fake-console-client';

test.afterEach(async () => {
  await fakeConsole.reset();
});
test('leaders schedule guild runs and members sign up, switch roles and withdraw', async ({ page, context }) => {
  const leader = await fakeConsole.newMember('Operations Leader', { guild: { id: '2', role: 100 } });
  await context.setExtraHTTPHeaders({ Cookie: leader.cookie });
  await page.goto('/guild');
  await page
    .getByRole('navigation', { name: 'Guild sections' })
    .getByRole('link', { name: 'Operations', exact: true })
    .click();
  await expect(page).toHaveURL(/tab=operations/);
  const planner = page.getByRole('region', { name: 'Guild operations planner' });
  await planner.getByRole('button', { name: 'New operation', exact: true }).click();
  await planner.getByLabel('Operation title').fill('Deep Desert scouting run');
  await planner.getByLabel('Operation type').selectOption('deep-desert');
  await planner.getByLabel('Meeting point').fill('South guild base');
  await planner.getByLabel('Operation details').fill('Bring water, fuel and a spare stillsuit.');
  await planner.getByRole('button', { name: 'Save operation', exact: true }).click();
  const operation = planner.getByRole('article', { name: 'Deep Desert scouting run', exact: true });
  await expect(operation).toBeVisible();
  await page.reload();
  await expect(operation).toBeVisible();

  const member = await fakeConsole.newMember('Patrol Pilot', { guild: { id: '2', role: 1 } });
  await context.setExtraHTTPHeaders({ Cookie: member.cookie });
  await page.goto('/guild?tab=operations');
  await expect(planner.getByRole('button', { name: 'New operation', exact: true })).toHaveCount(0);
  await operation.getByRole('button', { name: 'Join as Pilot', exact: true }).click();
  await expect(operation.getByRole('button', { name: 'Your role: Pilot' })).toBeDisabled();
  await operation.getByRole('button', { name: 'Join as Scout', exact: true }).click();
  await expect(operation.getByRole('button', { name: 'Your role: Scout' })).toBeDisabled();
  await expect(operation.getByText('Pilot · 0/1', { exact: true })).toBeVisible();
  await operation.getByRole('button', { name: 'Withdraw sign-up', exact: true }).click();
  await expect(operation.getByRole('button', { name: 'Withdraw sign-up', exact: true })).toHaveCount(0);
  await operation.getByRole('button', { name: 'Join as Pilot', exact: true }).click();
  await expect(operation.getByText('Pilot · 1/1', { exact: true })).toBeVisible();
  const payload = await (await page.request.get('/api/v2/guilds/2/operations')).json();
  expect(JSON.stringify(payload)).not.toContain('memberId');
  expect(payload.data.operations[0].signups[0].isSelf).toBe(true);

  const second = await fakeConsole.newMember('Patrol Scout', { guild: { id: '2', role: 1 } });
  await context.setExtraHTTPHeaders({ Cookie: second.cookie });
  await page.goto('/guild?tab=operations');
  await expect(operation.getByRole('button', { name: 'Join as Pilot', exact: true })).toBeDisabled();
  await operation.getByRole('button', { name: 'Join as Scout', exact: true }).click();
  await expect(operation.getByRole('button', { name: 'Your role: Scout' })).toBeDisabled();
  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  await planner.screenshot({ path: test.info().outputPath('operations-phone.png') });

  await context.setExtraHTTPHeaders({ Cookie: leader.cookie });
  await page.goto('/guild?tab=operations');
  await operation.getByRole('button', { name: 'Edit operation', exact: true }).click();
  await planner.getByLabel('Operation title').fill('Updated scouting run');
  await planner.getByRole('button', { name: 'Save operation', exact: true }).click();
  const updated = planner.getByRole('article', { name: 'Updated scouting run', exact: true });
  await expect(updated).toBeVisible();
  await updated.getByText('Team sign-ups (2)', { exact: true }).click();
  await updated.getByRole('button', { name: 'Remove sign-up for Patrol Scout', exact: true }).click();
  await updated.getByRole('button', { name: 'Confirm change', exact: true }).click();
  await expect(updated.getByText('Team sign-ups (1)', { exact: true })).toBeVisible();
  await updated.getByRole('button', { name: 'Cancel operation', exact: true }).click();
  await updated.getByRole('button', { name: 'Confirm change', exact: true }).click();
  await expect(updated).toHaveCount(0);
  await planner.getByRole('button', { name: 'Past and closed', exact: true }).click();
  await expect(updated).toBeVisible();
  await expect(updated.getByRole('button', { name: 'Join as Pilot', exact: true })).toBeDisabled();
  await updated.getByRole('button', { name: 'Remove operation', exact: true }).click();
  await updated.getByRole('button', { name: 'Confirm change', exact: true }).click();
  await expect(updated).toHaveCount(0);
});

test('a conflicting operation save preserves the draft until an explicit refresh', async ({ page, context }) => {
  const leader = await fakeConsole.newMember('Planning Leader', { guild: { id: '2', role: 100 } });
  await context.setExtraHTTPHeaders({ Cookie: leader.cookie });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/guild?tab=operations');
  const planner = page.getByRole('region', { name: 'Guild operations planner' });
  await planner.getByRole('button', { name: 'New operation', exact: true }).click();
  await planner.getByLabel('Operation title').fill('Spice convoy');
  await planner.getByLabel('Meeting point').fill('North base');
  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  let sends = 0;
  await page.route('**/api/v2/guilds/2/operations', async (route) => {
    if (route.request().method() !== 'POST') return route.continue();
    sends++;
    return route.fulfill({
      status: 409,
      json: { ok: false, error: 'This operation changed. Refresh before trying again. Your draft is kept.' },
    });
  });
  await planner.getByRole('button', { name: 'Save operation', exact: true }).click();
  await expect(planner.getByRole('alert')).toContainText('Your draft is kept');
  await expect(planner.getByLabel('Operation title')).toHaveValue('Spice convoy');
  expect(sends).toBe(1);
  await page.unroute('**/api/v2/guilds/2/operations');
  await page.route('**/api/v2/guilds/2/operations', (route) =>
    route.fulfill({ status: 503, json: { ok: false, error: 'Verification is unavailable.' } }),
  );
  await planner.getByRole('button', { name: 'Refresh operations', exact: true }).click();
  await expect(planner.getByRole('alert')).toContainText('Verification is unavailable');
  await page.unroute('**/api/v2/guilds/2/operations');
  await planner.getByRole('button', { name: 'Refresh operations', exact: true }).click();
  await expect(planner.getByLabel('Meeting point')).toHaveValue('North base');
  await planner.getByRole('button', { name: 'Save operation', exact: true }).click();
  const operation = planner.getByRole('article', { name: 'Spice convoy', exact: true });
  await expect(operation).toBeVisible();
  await operation.getByRole('button', { name: 'Mark completed', exact: true }).click();
  await operation.getByRole('button', { name: 'Confirm change', exact: true }).click();
  await planner.getByRole('button', { name: 'Past and closed', exact: true }).click();
  await expect(operation).toBeVisible();
  await operation.getByRole('button', { name: 'Remove operation', exact: true }).click();
  await operation.getByRole('button', { name: 'Confirm change', exact: true }).click();
});
