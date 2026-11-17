import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { test, expect } from '../helpers/browser-test';
import { fakeConsole } from '../helpers/fake-console-client';

const axeSource = readFileSync(createRequire(import.meta.url).resolve('axe-core/axe.min.js'), 'utf8');
test.afterEach(async () => {
  await fakeConsole.reset();
});

test('members request help, claim atomically, chat privately and resolve with accessible mobile controls', async ({
  page,
  context,
}) => {
  const requester = await fakeConsole.newMember('New player');
  const volunteer = await fakeConsole.newMember('Volunteer guide');
  const observer = await fakeConsole.newMember('Help observer');
  await context.setExtraHTTPHeaders({ Cookie: requester.cookie });
  await page.goto('/help');
  const create = page.getByRole('region', { name: 'New help request' });
  await create.getByLabel('Title').fill('First stillsuit');
  await create.getByLabel('Category').selectOption('getting-started');
  await create.getByLabel('What do you need help with?').fill('Please help me craft my first stillsuit.');
  await create.getByRole('button', { name: 'Publish help request' }).click();
  const card = page.getByRole('article', { name: 'First stillsuit', exact: true });
  await expect(card).toContainText('open');

  await context.setExtraHTTPHeaders({ Cookie: volunteer.cookie });
  await page.goto('/help');
  const availability = page.getByRole('region', { name: 'Volunteer availability' });
  await availability.getByLabel('Available to help').check();
  await availability.getByLabel('getting started').check();
  await availability.getByRole('button', { name: 'Save availability' }).click();
  await card.getByRole('button', { name: 'Claim request' }).click();
  await expect(card).toContainText('assigned');
  await expect(card).toContainText('Volunteer: Pool member');
  await card.getByRole('button', { name: 'Private chat' }).click();
  const chat = page.getByRole('region', { name: 'Private chat for First stillsuit' });
  await chat.getByLabel('Message').fill('Start at the crafting station.');
  await chat.getByRole('button', { name: 'Send private message' }).click();
  await expect(chat).toContainText('Start at the crafting station.');

  await context.setExtraHTTPHeaders({ Cookie: requester.cookie });
  await page.goto('/help');
  await card.getByRole('button', { name: 'Private chat' }).click();
  await expect(chat).toContainText('Start at the crafting station.');
  await chat.getByLabel('Message').fill('Thank you, I found it.');
  await chat.getByRole('button', { name: 'Send private message' }).click();
  await expect(chat).toContainText('Thank you, I found it.');
  await card.getByRole('button', { name: 'Start helping' }).click();
  await expect(card).toContainText('in-progress');
  await page.goto('/inbox');
  const activeInbox = page.getByRole('region', { name: 'Actionable inbox' });
  await activeInbox.getByLabel('Alert category').selectOption('assistance');
  await expect(activeInbox.getByRole('article', { name: 'First stillsuit' })).toContainText('in-progress');
  await page.goto('/help');

  await context.setExtraHTTPHeaders({ Cookie: observer.cookie });
  await page.goto('/help');
  await expect(page.getByRole('article', { name: 'First stillsuit', exact: true })).toHaveCount(0);
  await expect(page.getByText('Start at the crafting station.')).toHaveCount(0);

  await context.setExtraHTTPHeaders({ Cookie: volunteer.cookie });
  await page.goto('/help');
  await card.getByRole('button', { name: 'Mark resolved' }).click();
  await expect(card).toContainText('resolved');
  await card.getByText('Report abuse', { exact: true }).click();
  await card.getByLabel('Reason').fill('Please review this completed interaction.');
  await card.getByRole('button', { name: 'Submit abuse report' }).click();
  await expect(card).toContainText('An abuse report has been recorded.');

  await context.setExtraHTTPHeaders({ Cookie: requester.cookie });
  await page.goto('/inbox');
  const inbox = page.getByRole('region', { name: 'Actionable inbox' });
  await inbox.getByLabel('Alert category').selectOption('assistance');
  await expect(inbox.getByRole('article')).toHaveCount(0);
  await page.goto('/help');
  await card.getByRole('button', { name: 'Close request' }).click();
  await expect(card).toContainText('closed');
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
