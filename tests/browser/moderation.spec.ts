import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { test, expect } from '../helpers/browser-test';
import { fakeConsole } from '../helpers/fake-console-client';

const axeSource = readFileSync(createRequire(import.meta.url).resolve('axe-core/axe.min.js'), 'utf8');
test.afterEach(async () => {
  await fakeConsole.reset();
});

test('members submit private reports while unverified moderators cannot load case evidence', async ({
  page,
  context,
}) => {
  const reporter = await fakeConsole.newMember('Report author');
  const other = await fakeConsole.newMember('Other member');
  await context.setExtraHTTPHeaders({ Cookie: reporter.cookie });
  await page.goto('/reports');
  const form = page.getByRole('region', { name: 'New player report' });
  await form.getByLabel('Subject').fill('Reported player');
  await form.getByLabel('Summary').fill('A verifiable summary of the behavior.');
  await form.getByLabel('Evidence').fill('Verifiable evidence for moderator review.');
  await form.getByRole('button', { name: 'Submit report' }).click();
  const report = page.getByRole('article', { name: 'Reported player', exact: true });
  await expect(report).toContainText('open');
  await page.reload();
  await expect(report).toBeVisible();
  await expect(page.getByRole('link', { name: 'Open moderator workspace' })).toHaveCount(0);

  await context.setExtraHTTPHeaders({ Cookie: other.cookie });
  await page.goto('/reports');
  await expect(page.getByText('You have not submitted any reports.')).toBeVisible();
  await expect(page.getByRole('article', { name: 'Reported player', exact: true })).toHaveCount(0);
  await page.goto('/moderation');
  await expect(page.getByText('Moderator access could not be verified')).toBeVisible();
  await expect(page.getByText('Verifiable evidence for moderator review.')).toHaveCount(0);

  await context.setExtraHTTPHeaders({ Cookie: reporter.cookie });
  await page.goto('/reports');
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
