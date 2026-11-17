import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { test, expect } from '../helpers/browser-test';
import { fakeConsole } from '../helpers/fake-console-client';
import { firstCommunityEvent } from '../../src/features/events/contracts';

const axeSource = readFileSync(createRequire(import.meta.url).resolve('axe-core/axe.min.js'), 'utf8');
test.afterEach(async () => {
  await fakeConsole.reset();
});

test('members register and cancel privately with calendar status and accessible mobile controls', async ({
  page,
  context,
}) => {
  const event = {
    ...firstCommunityEvent(),
    id: 'registration-browser-event',
    title: 'Registration browser gathering',
    startsAt: new Date(Date.now() + 7200000).toISOString(),
    endsAt: new Date(Date.now() + 10800000).toISOString(),
    status: 'open' as const,
    featured: false,
  };
  await fakeConsole.setEvent(event);
  const first = await fakeConsole.newMember('First attendee');
  const second = await fakeConsole.newMember('Second attendee');
  await context.setExtraHTTPHeaders({ Cookie: first.cookie });
  await page.goto('/events');
  const card = page.getByRole('article', { name: event.title, exact: true });
  const registration = card.getByRole('region', { name: 'Event registration' });
  await registration.getByRole('button', { name: 'Register for event' }).click();
  await expect(registration).toContainText('You are registered.');
  await expect(registration).toContainText('1/100 registered');
  await expect(registration.getByRole('button', { name: 'Register for event' })).toHaveCount(0);
  await page.reload();
  await expect(registration).toContainText('You are registered.');

  await context.setExtraHTTPHeaders({ Cookie: second.cookie });
  await page.goto('/events');
  await expect(registration).toContainText('1/100 registered');
  await expect(registration).not.toContainText('You are registered.');
  await expect(card).not.toContainText('First attendee');
  await registration.getByRole('button', { name: 'Register for event' }).click();
  await expect(registration).toContainText('2/100 registered');
  await page.goto('/calendar');
  await expect(page.getByRole('region', { name: 'Agenda' })).toContainText('Your registration: registered.');

  await context.setExtraHTTPHeaders({ Cookie: first.cookie });
  await page.goto('/events');
  await registration.getByRole('button', { name: 'Cancel registration' }).click();
  await expect(registration).toContainText('1/100 registered');
  await expect(registration.getByRole('button', { name: 'Register for event' })).toBeVisible();
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
