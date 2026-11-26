import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { test, expect } from '../helpers/browser-test';
import { fakeConsole } from '../helpers/fake-console-client';
import { firstCommunityEvent } from '../../src/features/events/contracts';
import sharp from 'sharp';

const axeSource = readFileSync(createRequire(import.meta.url).resolve('axe-core/axe.min.js'), 'utf8');
const png = await sharp({ create: { width: 16, height: 16, channels: 4, background: '#a65f32' } })
  .png()
  .toBuffer();
test.afterEach(async () => {
  await fakeConsole.reset();
});

test('members submit, edit and withdraw private-pending evidence with accessible mobile layouts', async ({
  page,
  context,
}) => {
  const event = {
    ...firstCommunityEvent(),
    id: 'submission-browser-event',
    title: 'Submission browser competition',
    startsAt: new Date(Date.now() - 3600000).toISOString(),
    endsAt: new Date(Date.now() + 10800000).toISOString(),
    status: 'open' as const,
  };
  await fakeConsole.setEvent(event);
  const owner = await fakeConsole.newMember('Evidence owner');
  const observer = await fakeConsole.newMember('Gallery observer');
  await context.setExtraHTTPHeaders({ Cookie: owner.cookie });
  await page.goto(`/events/${event.id}`);
  const form = page.getByRole('region', { name: 'New evidence submission' });
  await form.getByLabel('Submission title').fill('Desert home');
  await form.getByLabel('Evidence notes').fill('A complete desert home with water and storage.');
  await form.getByLabel('Evidence image').setInputFiles({ name: 'evidence.png', mimeType: 'image/png', buffer: png });
  await form.getByRole('button', { name: 'Submit for review' }).click();
  const card = page.getByRole('article', { name: 'Desert home', exact: true });
  await expect(card).toContainText('pending');
  await expect(card).not.toContainText('Confirmed result');
  await expect(card.getByRole('img', { name: 'Evidence for Desert home' })).toBeVisible();
  await card.getByRole('button', { name: 'Edit submission' }).click();
  const editor = page.getByRole('region', { name: 'Edit evidence submission' });
  await editor.getByLabel('Submission title').fill('Edited desert home');
  await editor.getByRole('button', { name: 'Save and resubmit for review' }).click();
  const edited = page.getByRole('article', { name: 'Edited desert home', exact: true });
  await expect(edited).toContainText('pending');

  await context.setExtraHTTPHeaders({ Cookie: observer.cookie });
  await page.goto(`/events/${event.id}`);
  await expect(page.getByText('No submissions are visible in this gallery.')).toBeVisible();
  await expect(page.getByText('Evidence owner')).toHaveCount(0);
  await expect(page.getByRole('article', { name: 'Edited desert home', exact: true })).toHaveCount(0);

  await context.setExtraHTTPHeaders({ Cookie: owner.cookie });
  await page.goto(`/events/${event.id}`);
  await edited.getByRole('button', { name: 'Withdraw' }).click();
  await expect(edited).toContainText('withdrawn');
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
