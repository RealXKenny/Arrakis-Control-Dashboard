import { expect, test } from '../helpers/browser-test';
import { fakeConsole } from '../helpers/fake-console-client';

test.afterEach(async () => {
  await fakeConsole.reset();
});

test('leaders welcome recruits, assign mentors and review private self-reported progress', async ({
  page,
  context,
}) => {
  const leader = await fakeConsole.newMember('Onboarding Leader', { guild: { id: '2', role: 100 } });
  const recruit = await fakeConsole.newMember('New Recruit', { guild: { id: '2', role: 1 } });
  await context.setExtraHTTPHeaders({ Cookie: leader.cookie });
  await page.goto('/guild');
  await page
    .getByRole('navigation', { name: 'Guild sections' })
    .getByRole('link', { name: 'Onboarding', exact: true })
    .click();
  const onboarding = page.getByRole('region', { name: 'Guild recruit onboarding', exact: true });
  await onboarding.getByRole('button', { name: 'Edit welcome guide', exact: true }).click();
  await onboarding.getByRole('textbox', { name: 'Welcome message', exact: true }).fill('Welcome to Crimson Skies.');
  await onboarding
    .getByRole('textbox', { name: 'Guild rules', exact: true })
    .fill('Ask before taking shared supplies.');
  await onboarding.getByRole('textbox', { name: 'Useful locations', exact: true }).fill('Meet at the south base.');
  await onboarding.getByRole('button', { name: 'Add checklist item', exact: true }).click();
  await onboarding.getByRole('textbox', { name: 'Checklist item 1', exact: true }).fill('Meet your mentor');
  await onboarding.getByRole('button', { name: 'Add checklist item', exact: true }).click();
  await onboarding.getByRole('textbox', { name: 'Checklist item 2', exact: true }).fill('Tour the base');
  await onboarding.getByRole('button', { name: 'Save onboarding guide', exact: true }).click();
  await expect(onboarding.getByText('Welcome to Crimson Skies.', { exact: true })).toBeVisible();
  await onboarding.getByRole('combobox', { name: 'Recruit', exact: true }).selectOption({ label: 'New Recruit' });
  await onboarding.getByRole('combobox', { name: 'Mentor', exact: true }).selectOption({ label: 'Chani' });
  await onboarding.getByRole('button', { name: 'Save mentor assignment', exact: true }).click();
  const overview = onboarding.getByRole('region', { name: 'Manage recruit progress', exact: true });
  const record = overview.getByRole('article', { name: 'New Recruit', exact: true });
  await expect(record.getByText('Mentor: Chani', { exact: true })).toBeVisible();

  await context.setExtraHTTPHeaders({ Cookie: recruit.cookie });
  await page.goto('/guild?tab=onboarding');
  await expect(onboarding.getByRole('button', { name: 'Edit welcome guide', exact: true })).toHaveCount(0);
  await expect(overview).toHaveCount(0);
  const own = onboarding.getByRole('article', { name: 'Your onboarding progress', exact: true });
  await expect(own.getByText('Mentor: Chani', { exact: true })).toBeVisible();
  await own.getByRole('button', { name: 'Mark complete: Meet your mentor', exact: true }).click();
  await expect(own.getByText('1 of 2 checklist items complete', { exact: true })).toBeVisible();
  await own.getByRole('button', { name: 'Mark incomplete: Meet your mentor', exact: true }).click();
  await expect(own.getByText('0 of 2 checklist items complete', { exact: true })).toBeVisible();
  await own.getByRole('button', { name: 'Mark complete: Meet your mentor', exact: true }).click();
  await onboarding.getByRole('button', { name: 'I have read the guild rules', exact: true }).click();
  await expect(onboarding.getByText('You acknowledged the current guild rules.', { exact: true })).toBeVisible();
  await page.reload();
  await expect(own.getByText('1 of 2 checklist items complete', { exact: true })).toBeVisible();
  const data = await (await page.request.get('/api/v2/guilds/2/onboarding')).json();
  expect(data.data.members).toEqual([]);
  expect(data.data.roster).toEqual([]);
  const denied = await page.evaluate(
    async (input) =>
      (
        await fetch('/api/v2/guilds/2/onboarding', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(input),
        })
      ).status,
    { action: 'guide', revision: data.data.revision, guide: data.data.guide },
  );
  expect(denied).toBe(403);
  for (const width of [1280, 768, 320, 390]) {
    await page.setViewportSize({ width, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(
      await page
        .getByRole('navigation', { name: 'Guild sections' })
        .getByRole('link')
        .evaluateAll((links) => links.every((link) => link.scrollWidth <= link.clientWidth)),
    ).toBe(true);
  }
  await own.screenshot({ path: test.info().outputPath('recruit-onboarding-phone.png') });

  await context.setExtraHTTPHeaders({ Cookie: leader.cookie });
  await page.goto('/guild?tab=onboarding');
  await expect(record.getByText('1 of 2 checklist items complete', { exact: true })).toBeVisible();
  await expect(record.getByText('Rules: Acknowledged', { exact: true })).toBeVisible();
  await onboarding.getByRole('button', { name: 'Edit welcome guide', exact: true }).click();
  await onboarding.getByRole('textbox', { name: 'Guild rules', exact: true }).fill('New rules: ask before landing.');
  await onboarding
    .getByRole('textbox', { name: 'Checklist item 1', exact: true })
    .fill('Meet your mentor at the new base');
  await onboarding.getByRole('button', { name: 'Save onboarding guide', exact: true }).click();
  await expect(record.getByText('0 of 2 checklist items complete', { exact: true })).toBeVisible();
  await expect(record.getByText('Rules: Awaiting acknowledgment', { exact: true })).toBeVisible();
  await record.getByRole('button', { name: 'Remove progress', exact: true }).click();
  await onboarding.getByRole('button', { name: 'Confirm removal', exact: true }).click();
  await expect(record).toHaveCount(0);
  const cleanup = await (await page.request.get('/api/v2/guilds/2/onboarding')).json();
  expect(
    await page.evaluate(
      async (input) =>
        (
          await fetch('/api/v2/guilds/2/onboarding', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(input),
          })
        ).status,
      { action: 'guide', revision: cleanup.data.revision, guide: { welcome: '', rules: '', locations: '', steps: [] } },
    ),
  ).toBe(200);
});

test('failed guide saves and refreshes retain drafts on narrow screens', async ({ page, context }) => {
  const leader = await fakeConsole.newMember('Welcome Editor', { guild: { id: '2', role: 100 } });
  await context.setExtraHTTPHeaders({ Cookie: leader.cookie });
  await page.setViewportSize({ width: 320, height: 844 });
  await page.goto('/guild?tab=onboarding');
  const onboarding = page.getByRole('region', { name: 'Guild recruit onboarding', exact: true });
  await expect(page.getByRole('navigation', { name: 'Guild sections' })).toHaveCSS(
    'grid-template-columns',
    /^\d+(\.\d+)?px \d+(\.\d+)?px$/,
  );
  await onboarding.getByRole('button', { name: 'Edit welcome guide', exact: true }).click();
  await onboarding.getByRole('textbox', { name: 'Welcome message', exact: true }).fill('Unsaved welcome');
  await onboarding.getByRole('button', { name: 'Add checklist item', exact: true }).click();
  await onboarding.getByRole('textbox', { name: 'Checklist item 1', exact: true }).fill('x'.repeat(200));
  let sends = 0;
  await page.route('**/api/v2/guilds/2/onboarding', (route) => {
    if (route.request().method() !== 'POST') return route.continue();
    sends++;
    return route.fulfill({ status: 409, json: { ok: false, error: 'Onboarding changed. Your draft is kept.' } });
  });
  await onboarding.getByRole('button', { name: 'Save onboarding guide', exact: true }).click();
  await expect(onboarding.getByRole('alert')).toContainText('Your draft is kept');
  expect(sends).toBe(1);
  await page.unroute('**/api/v2/guilds/2/onboarding');
  await page.route('**/api/v2/guilds/2/onboarding', (route) =>
    route.fulfill({ status: 503, json: { ok: false, error: 'Verification is unavailable.' } }),
  );
  await onboarding.getByRole('button', { name: 'Refresh onboarding', exact: true }).click();
  await expect(onboarding.getByRole('alert')).toContainText('Verification is unavailable');
  await expect(onboarding.getByRole('textbox', { name: 'Welcome message', exact: true })).toBeHidden();
  await page.unroute('**/api/v2/guilds/2/onboarding');
  await onboarding.getByRole('button', { name: 'Refresh onboarding', exact: true }).click();
  await expect(onboarding.getByRole('textbox', { name: 'Welcome message', exact: true })).toHaveValue(
    'Unsaved welcome',
  );
  await onboarding.getByRole('button', { name: 'Save onboarding guide', exact: true }).click();
  await expect(onboarding.getByRole('button', { name: 'Edit welcome guide', exact: true })).toBeEnabled();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(
    await page
      .getByRole('navigation', { name: 'Guild sections' })
      .getByRole('link')
      .evaluateAll((links) => links.every((link) => link.scrollWidth <= link.clientWidth)),
  ).toBe(true);
  await onboarding.getByRole('button', { name: 'Edit welcome guide', exact: true }).click();
  await onboarding.getByRole('button', { name: 'Remove checklist item 1', exact: true }).click();
  await onboarding.getByRole('textbox', { name: 'Welcome message', exact: true }).fill('');
  await onboarding.getByRole('button', { name: 'Save onboarding guide', exact: true }).click();
});
