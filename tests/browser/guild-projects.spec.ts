import { expect, test } from '../helpers/browser-test';
import { fakeConsole } from '../helpers/fake-console-client';

test.afterEach(async () => {
  await fakeConsole.reset();
});

test('leaders plan a project, members volunteer and publish supplies, and shortages stay visible', async ({
  page,
  context,
}) => {
  const leader = await fakeConsole.newMember('Project Leader', { guild: { id: '2', role: 100 } });
  const builder = await fakeConsole.newMember('Wall Builder', { guild: { id: '2', role: 1 } });
  await context.setExtraHTTPHeaders({ Cookie: leader.cookie });
  await page.goto('/guild');
  await page
    .getByRole('navigation', { name: 'Guild sections' })
    .getByRole('link', { name: 'Projects', exact: true })
    .click();
  await expect(page).toHaveURL(/tab=projects/);
  const workspace = page.getByRole('region', { name: 'Guild projects', exact: true });
  await workspace.getByRole('button', { name: 'New project', exact: true }).click();
  const editor = workspace.getByRole('form', { name: 'Guild project plan' });
  await editor.getByLabel('Project name').fill('North wall');
  await editor.getByRole('button', { name: 'Add material', exact: true }).click();
  const material = editor.getByRole('group', { name: 'Material 1' });
  await material.getByLabel('Material', { exact: true }).fill('Steel ingot');
  await material.getByLabel(/^Required/).fill('900719925474099312');
  await material.getByLabel('Unit', { exact: true }).fill('ingots');
  await editor.getByRole('button', { name: 'Save project', exact: true }).click();
  const project = workspace.getByRole('article', { name: 'North wall', exact: true });
  await expect(project).toBeVisible();
  const steel = project.getByRole('listitem', { name: 'Steel ingot' });
  await expect(steel.getByText('900,719,925,474,099,312').first()).toBeVisible();

  await context.setExtraHTTPHeaders({ Cookie: builder.cookie });
  await page.goto('/guild?tab=projects');
  await expect(workspace.getByRole('button', { name: 'New project', exact: true })).toHaveCount(0);
  await expect(project.getByRole('button', { name: 'Edit plan', exact: true })).toHaveCount(0);
  await steel.getByText('Volunteer to buy', { exact: true }).click();
  await steel.getByLabel('Quantity').fill('12');
  await steel.getByRole('button', { name: 'Volunteer', exact: true }).click();
  await expect(project.getByText('Wall Builder buys 12 Steel ingot · assigned', { exact: false })).toBeVisible();
  await expect(steel.getByText('900,719,925,474,099,300', { exact: true })).toBeVisible();

  const stockpile = workspace.getByRole('region', { name: 'Guild stockpile', exact: true });
  await stockpile.getByRole('button', { name: 'Publish a supply', exact: true }).click();
  await stockpile.getByLabel('Material', { exact: true }).fill('Steel ingot');
  await stockpile.getByLabel('Quantity offered').fill('40');
  await stockpile.getByLabel('Unit', { exact: true }).fill('ingots');
  await stockpile.getByRole('button', { name: 'Save supply', exact: true }).click();
  await expect(stockpile.getByText('Offered by Wall Builder', { exact: false })).toBeVisible();

  const view = await (await page.request.get('/api/v2/guilds/2/projects')).json();
  expect(view.data.canEdit).toBe(false);
  const denied = await page.evaluate(
    async (input) =>
      (
        await fetch('/api/v2/guilds/2/projects', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(input),
        })
      ).status,
    { action: 'project-delete', id: view.data.projects[0].id, revision: view.data.projects[0].revision },
  );
  expect(denied).toBe(403);

  await page.setViewportSize({ width: 320, height: 800 });
  await page.goto('/guild?tab=projects');
  await expect(project).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('commissions close only after the requester confirms receipt', async ({ page, context }) => {
  const requester = await fakeConsole.newMember('Commission Requester', { guild: { id: '2', role: 1 } });
  const crafter = await fakeConsole.newMember('Master Crafter', { guild: { id: '2', role: 1 } });
  await context.setExtraHTTPHeaders({ Cookie: crafter.cookie });
  await page.goto('/guild?tab=crafting');
  const workspace = page.getByRole('region', { name: 'Guild crafting', exact: true });
  await workspace.getByRole('button', { name: 'List my capabilities', exact: true }).click();
  await workspace.getByLabel('What you can craft').fill('Maula pistols');
  await workspace.getByRole('button', { name: 'Publish listing', exact: true }).click();
  await expect(
    workspace.getByRole('list', { name: 'Crafters' }).getByText('Maula pistols', { exact: false }),
  ).toBeVisible();

  await context.setExtraHTTPHeaders({ Cookie: requester.cookie });
  await page.goto('/guild?tab=crafting');
  await workspace.getByRole('button', { name: 'Request a commission', exact: true }).click();
  const form = workspace.getByRole('form', { name: 'Commission request' });
  await form.getByLabel('Item', { exact: true }).fill('Maula pistol');
  await form.getByLabel('Quantity').fill('2');
  await form.getByRole('combobox', { name: 'Crafter' }).selectOption({ label: 'Master Crafter' });
  await form.getByLabel(/^Inputs you will provide/).fill('40 steel ingots');
  await form.getByRole('button', { name: 'Request commission', exact: true }).click();
  const commission = workspace.getByRole('listitem', { name: 'Maula pistol' });
  await expect(commission.getByText('Waiting for a crafter')).toBeVisible();

  await context.setExtraHTTPHeaders({ Cookie: crafter.cookie });
  await page.goto('/guild?tab=crafting');
  await commission.getByRole('button', { name: 'Accept commission', exact: true }).click();
  await expect(commission.getByText('Agreed inputs: 40 steel ingots')).toBeVisible();
  await commission.getByLabel('Note').fill('In your chest');
  await commission.getByRole('button', { name: 'Claim completion', exact: true }).click();
  await expect(commission.getByText('Crafter reports completion; waiting for receipt')).toBeVisible();
  await expect(commission.getByRole('button', { name: 'Confirm receipt', exact: true })).toHaveCount(0);

  await context.setExtraHTTPHeaders({ Cookie: requester.cookie });
  await page.goto('/guild?tab=crafting');
  await commission.getByRole('button', { name: 'Confirm receipt', exact: true }).click();
  await workspace.getByRole('button', { name: 'Received and cancelled', exact: true }).click();
  await expect(commission.getByText('Receipt confirmed by requester')).toBeVisible();
});
