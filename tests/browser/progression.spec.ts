import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { test, expect } from '../helpers/browser-test';
import { fakeConsole } from '../helpers/fake-console-client';
test.afterEach(async () => {
  await fakeConsole.reset();
});
const axeSource = readFileSync(createRequire(import.meta.url).resolve('axe-core/axe.min.js'), 'utf8');

test('solo members set goals from verified readings, pin them to the portal and see them in the briefing', async ({
  page,
  context,
}) => {
  const member = await fakeConsole.newMember('Goal setter', { guild: null });
  await context.setExtraHTTPHeaders({ Cookie: member.cookie });
  await page.goto('/progression?tab=goals');
  await page.getByRole('button', { name: 'New goal' }).click();
  const editor = page.getByRole('form', { name: 'Goal editor' });
  await editor.getByLabel('Title').fill('Reach level 120');
  await editor.getByLabel('Target').fill('120');
  await editor.getByLabel('Pin to the portal').check();
  await editor.getByRole('button', { name: 'Save goal' }).click();
  const milestones = page.getByRole('region', { name: 'Milestones' });
  await expect(milestones).toContainText('Reach level 120');
  await expect(milestones).toContainText('100 / 120');
  await expect(milestones).toContainText('20 to go');

  await page.getByRole('button', { name: 'New goal' }).click();
  await editor.getByLabel('Kind').selectOption('faction');
  await editor.getByLabel('Title').fill('Atreides ally');
  await editor.getByRole('combobox', { name: /^Faction/ }).fill('Atreides');
  await editor.getByLabel('Target').fill('100');
  await editor.getByRole('button', { name: 'Save goal' }).click();
  await expect(page.getByRole('region', { name: 'Faction targets' })).toContainText('Reached');

  await page.reload();
  await expect(milestones).toContainText('Pinned');
  await page.goto('/portal');
  const pinned = page.getByRole('region', { name: 'Pinned goals' });
  await expect(pinned).toContainText('Reach level 120');
  await expect(pinned).toContainText('100 / 120');
  await page.goto('/progression');
  await expect(page.getByRole('region', { name: 'Outstanding goals' })).toContainText('Reach level 120');
  await expect(page.getByRole('region', { name: 'Outstanding goals' })).not.toContainText('Atreides ally');
});

test('journal tracking starts explicitly and notebook links stay inside the dashboard', async ({ page, context }) => {
  const member = await fakeConsole.newMember('Journal keeper', { guild: null });
  await context.setExtraHTTPHeaders({ Cookie: member.cookie });
  await page.goto('/progression?tab=journal');
  const journal = page.getByRole('region', { name: 'Progression journal' });
  await expect(journal).toContainText('Tracking is paused.');
  await expect(journal.getByRole('button', { name: 'Record now' })).toBeDisabled();
  await journal.getByRole('button', { name: 'Start tracking' }).click();
  await expect(journal).toContainText('Tracking is on.');
  await journal.getByRole('button', { name: 'Record now' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Observation recorded.' })).toBeVisible();
  await expect(journal).toContainText('1/40 observations kept.');
  await expect(journal).toContainText('Baseline recorded.');

  await page.goto('/progression?tab=notebook');
  await page.getByRole('button', { name: 'New note' }).click();
  const editor = page.getByRole('form', { name: 'Note editor' });
  await editor.getByLabel('Title').fill('Spice route');
  await editor.getByLabel('Note', { exact: true }).fill('Harvest north of the ridge.');
  await editor.getByLabel('Links to your assets').fill('Outside | https://example.test');
  await editor.getByRole('button', { name: 'Save note' }).click();
  await expect(editor.getByRole('alert')).toContainText('Check the title');
  await editor.getByLabel('Links to your assets').fill('Main base | /holdings?view=owned');
  await editor.getByRole('button', { name: 'Save note' }).click();
  const note = page.getByRole('region', { name: 'Spice route' });
  await expect(note).toContainText('Harvest north of the ridge.');
  await expect(note.getByRole('link', { name: 'Main base' })).toHaveAttribute('href', '/holdings?view=owned');
});

test('every planner section meets WCAG AA without horizontal overflow', async ({ page, context }) => {
  const member = await fakeConsole.newMember('Accessible planner', { guild: null });
  await context.setExtraHTTPHeaders({ Cookie: member.cookie });
  for (const tab of ['briefing', 'goals', 'builds', 'unlocks', 'journey', 'journal', 'notebook']) {
    await page.goto(`/progression?tab=${tab}`);
    await expect(page.getByRole('heading', { name: 'Progression', level: 1 })).toBeVisible();
    await page.evaluate(axeSource);
    const violations = await page.evaluate(async () => {
      const axe = (
        window as unknown as { axe: { run(node: Document, options: object): Promise<{ violations: unknown[] }> } }
      ).axe;
      return (await axe.run(document, { runOnly: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'] })).violations;
    });
    expect(violations, tab).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
});
