import { test, expect } from '../helpers/browser-test';

test('two-season admin-to-member acceptance workflow with permanent cosmetics and mobile reward track', async ({
  page,
  browser,
}, testInfo) => {
  test.setTimeout(180000);
  page.setDefaultTimeout(10000);
  await page.context().setExtraHTTPHeaders({ Cookie: '__Host-dashboard_session=browser-admin-session' });
  const context = await browser.newContext({
    extraHTTPHeaders: { Cookie: '__Host-dashboard_session=browser-member-session' },
    viewport: { width: 393, height: 852 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 3,
  });
  const member = await context.newPage();
  member.setDefaultTimeout(10000);
  await page.goto('/admin?tab=seasons');
  await page.getByRole('button', { name: 'Create season', exact: true }).click();
  const identity = page.getByRole('group', { name: 'Season identity & schedule' });
  const name = 'Sands of Beginnings';
  await identity.getByLabel('name', { exact: true }).fill(name);
  await identity.getByLabel('Starts at (UTC)').fill(new Date(Date.now() - 3600000).toISOString().slice(0, 16));
  await identity.getByLabel('Ends at (UTC)').fill(new Date(Date.now() + 86400000).toISOString().slice(0, 16));
  await identity.getByLabel('Level XP thresholds').fill('0, 100, 250, 450, 700');
  await page.getByRole('button', { name: 'Save draft', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText('Season operation saved.');
  await page.getByRole('button', { name: 'Preview season', exact: true }).click();
  await expect(page.getByRole('region', { name: /Reward track/ })).toBeVisible();
  await page.getByRole('button', { name: 'Return to editor', exact: true }).click();
  page.once('dialog', (dialog) => dialog.accept(name));
  await page.getByRole('button', { name: 'Publish saved season', exact: true }).click();
  await expect(page.getByRole('button', { name: 'End season', exact: true })).toBeVisible();
  await member.goto('/seasons');
  await expect(member.getByRole('heading', { name, exact: true })).toBeVisible();
  await member.getByLabel('Path', { exact: true }).selectOption('solo');
  await member.getByRole('button', { name: 'Submit evidence', exact: true }).click();
  await member
    .getByLabel('Description', { exact: true })
    .fill('A complete solo field guide with independently reviewed test evidence.');
  await member.getByRole('button', { name: 'Submit for review', exact: true }).click();
  await expect(member.getByRole('status')).toHaveText('Evidence submitted for review.');
  await page.getByRole('button', { name: 'Refresh review queue', exact: true }).click();
  await page.getByLabel('Reviewer notes / rejection reason').fill('Reviewed and approved using disposable evidence.');
  await page.getByRole('button', { name: 'Approve & award XP', exact: true }).click();
  await expect(page.getByText('1 participants · 1 approved challenges · 700 total XP · 0 claims')).toBeVisible();
  await member.reload();
  await expect(member.getByText('700 Season XP', { exact: true })).toBeVisible();
  const track = member.getByRole('region', { name: /Reward track/ });
  await track.evaluate((element) => element.scrollTo({ left: element.scrollWidth, behavior: 'instant' }));
  await track.getByRole('button', { name: /First Light/ }).click();
  await member.keyboard.press('Tab');
  expect(await member.getByRole('dialog').evaluate((dialog) => dialog.contains(document.activeElement))).toBe(true);
  await member.getByRole('button', { name: 'Confirm free claim', exact: true }).click();
  await expect(member.getByRole('status')).toHaveText('Cosmetic claimed. It is yours to keep.');
  await track.getByRole('button', { name: /First Light/ }).click();
  await member.getByRole('button', { name: 'Equip cosmetic', exact: true }).click();
  await expect(member.getByRole('status')).toHaveText('Cosmetic equipped.');
  expect(await member.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  for (const width of [320, 360, 412, 768]) {
    await member.setViewportSize({ width, height: 852 });
    expect(await member.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  await member.setViewportSize({ width: 393, height: 852 });
  await member.emulateMedia({ reducedMotion: 'reduce' });
  await member.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
  await member.screenshot({ path: testInfo.outputPath('season-mobile.png'), fullPage: true });
  await member.setViewportSize({ width: 1440, height: 1000 });
  await member.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
  await member.screenshot({ path: testInfo.outputPath('season-desktop.png'), fullPage: true });
  page.once('dialog', (dialog) => dialog.accept(name));
  await page.getByRole('button', { name: 'End season', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Archive season', exact: true })).toBeVisible();
  page.once('dialog', (dialog) => dialog.accept(name));
  await page.getByRole('button', { name: 'Archive season', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Archive season', exact: true })).toHaveCount(0);
  await member.goto('/seasons/history');
  const history = member.getByRole('article').filter({ has: member.getByRole('heading', { name, exact: true }) });
  await expect(history.getByText('Level 5 · 700 Season XP · 1 approved challenges')).toBeVisible();
  await expect(history.getByRole('button', { name: /Equip First Light/ })).toBeVisible();
  await page.getByRole('button', { name: 'Use as template', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Save draft', exact: true })).toBeVisible();
  const nextName = `${name} II`;
  await identity.getByLabel('name', { exact: true }).fill(nextName);
  await page.getByRole('button', { name: 'Save draft', exact: true }).click();
  await expect(page.getByRole('heading', { name: nextName, exact: true })).toBeVisible();
  page.once('dialog', (dialog) => dialog.accept(nextName));
  await page.getByRole('button', { name: 'Publish saved season', exact: true }).click();
  await expect(page.getByRole('button', { name: 'End season', exact: true })).toBeVisible();
  await member.goto('/seasons');
  await expect(member.getByRole('heading', { name: nextName, exact: true })).toBeVisible();
  await expect(member.getByText('0 Season XP', { exact: true })).toBeVisible();
  await member.goto('/character');
  await expect(member.getByRole('heading', { name: 'Season showcase', exact: true })).toBeVisible();
  await expect(member.getByText('First Light', { exact: true })).toBeVisible();
  await context.close();
});

test('season APIs keep admin actions private and reject forged evidence and cross-site mutations', async ({ page }) => {
  expect((await page.request.get('/api/v2/seasons')).status()).toBe(401);
  await page.context().setExtraHTTPHeaders({ Cookie: '__Host-dashboard_session=browser-member-session' });
  expect((await page.request.get('/api/v2/admin/seasons')).status()).toBe(403);
  expect(
    (
      await page.request.post('/api/v2/seasons', { data: { action: 'claim', seasonId: 'fake', rewardId: 'fake' } })
    ).status(),
  ).toBe(403);
  expect(
    (
      await page.request.post('/api/v2/seasons', {
        headers: { Origin: 'http://127.0.0.1:3100' },
        data: {
          action: 'submit',
          seasonId: 'fake',
          challengeId: 'fake',
          text: 'Forged evidence',
          links: ['javascript:alert(1)'],
          requestId: '2d8334bc-7183-4433-80bd-e2fdeef1fc0d',
        },
      })
    ).status(),
  ).toBe(400);
});
