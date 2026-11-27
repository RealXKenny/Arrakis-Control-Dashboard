import { test, expect } from '../helpers/browser-test';

test('public changelog previews sections, expands notes, filters and searches the full release', async ({ page }) => {
  await page.goto('/changelog');
  await expect(page.getByRole('heading', { name: 'Changelog.', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Version 2.0.3', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Version 2.0.2', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Version 2.0.0', exact: true })).toBeVisible();
  await expect(page.getByRole('status')).toHaveText('4 updates to explore');
  await expect(
    page.getByRole('button', { name: 'All updates', exact: true }).locator('[aria-hidden="true"]'),
  ).toHaveText('4');
  // 2.0.0 has more new features than the preview shows, so its section exercises the "View all" control.
  const release = page
    .getByRole('article')
    .filter({ has: page.getByRole('heading', { name: 'Version 2.0.0', exact: true }) });
  const features = release.getByRole('region', { name: 'New Features', exact: true });
  await expect(features.locator('li')).toHaveCount(5);
  await features.getByRole('button', { name: /View all/ }).click();
  expect(await features.locator('li').count()).toBeGreaterThan(5);
  await features.getByRole('button', { name: 'Show fewer new features', exact: true }).click();
  await expect(features.locator('li')).toHaveCount(5);
  await page.getByRole('button', { name: 'Security', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Security', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('heading', { name: 'Security', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'New Features', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'All updates', exact: true }).click();
  await page.getByRole('searchbox', { name: 'Search release notes' }).fill('RABBITMQ_TLS_CA');
  await expect(page.locator('main code').filter({ hasText: 'RABBITMQ_TLS_CA' }).first()).toBeVisible();
  await expect(page.getByRole('status')).toContainText('matching your search');
  await expect(page.getByRole('status')).toHaveText(/changes? matching your search in 1 update/);
  await page.getByRole('searchbox', { name: 'Search release notes' }).fill('no-such-update-zzzz');
  await expect(page.getByRole('heading', { name: 'No matching updates' })).toBeVisible();
  await page.getByRole('button', { name: 'Reset filters', exact: true }).click();
  await expect(page.getByRole('searchbox', { name: 'Search release notes' })).toHaveValue('');
  await expect(features.locator('li')).toHaveCount(5);
});

test('release text can be selected for copying with a visible blue highlight', async ({ page }) => {
  await page.goto('/changelog');
  const text = page
    .getByRole('region', { name: 'New Features', exact: true })
    .locator('li')
    .first()
    .locator('span')
    .last();
  await text.scrollIntoViewIfNeeded();
  const box = (await text.boundingBox())!;
  await page.mouse.move(box.x + 5, box.y + 12);
  await page.mouse.down();
  await page.mouse.move(box.x + Math.min(170, box.width - 5), box.y + 12, { steps: 12 });
  await page.mouse.up();
  expect(await page.evaluate(() => window.getSelection()?.toString().trim())).toBeTruthy();
  expect(await text.evaluate((element) => getComputedStyle(element, '::selection').backgroundColor)).toBe(
    'rgb(37, 99, 235)',
  );
  expect(await text.evaluate((element) => getComputedStyle(element, '::selection').color)).toBe('rgb(255, 255, 255)');
});

test('release journal fits desktop and mobile with readable cards and keyboard controls', async ({ page }) => {
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto('/changelog');
    await expect(page.getByRole('heading', { name: 'Changelog.', exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    const filter = page.getByRole('button', { name: 'Upgrade Notes', exact: true });
    await filter.focus();
    await page.keyboard.press('Enter');
    await expect(filter).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('heading', { name: 'Upgrade Notes', exact: true }).first()).toBeVisible();
    await page.getByRole('button', { name: 'All updates', exact: true }).click();
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: test.info().outputPath(`changelog-${width}.png`), fullPage: false });
  }
});

test('bot history is separate from dashboard releases', async ({ page }) => {
  await page.goto('/changelog');
  await page.getByRole('link', { name: 'Bot releases' }).click();
  await expect(page.getByRole('heading', { name: 'Arrakis Control Bot release history' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Version 2.0.0' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Bot releases' })).toHaveAttribute('aria-current', 'page');
});

test('published dashboard history links resolve independently of unreleased notes', async ({ page }) => {
  await page.goto('/changelog?project=dashboard&show=all#v2.0.0');
  await expect(page.getByRole('heading', { name: 'Version 2.0.0' })).toBeVisible();
});
