import { test, expect } from '../helpers/browser-test';

test('signed-out public pages show only branding and sign in in the topbar at every screen size', async ({ page }) => {
  for (const width of [1920, 820, 390]) {
    await page.setViewportSize({ width, height: 900 });
    for (const path of ['/', '/changelog']) {
      await page.goto(path);
      const header = page.getByRole('banner');
      await expect(header.getByRole('link', { name: 'Arrakis Control home' })).toBeVisible();
      await expect(header.getByRole('link', { name: 'Sign in', exact: true })).toBeVisible();
      await expect(header.getByRole('navigation')).toHaveCount(0);
      await expect(header.getByRole('button')).toHaveCount(0);
      await expect(header.getByRole('link')).toHaveCount(2);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    }
  }
});

test('signed-in members see dashboard actions instead of sign-in prompts on public pages', async ({
  page,
  baseURL,
}) => {
  await page.context().addCookies([
    {
      name: '__Host-dashboard_session',
      value: 'browser-member-session',
      domain: new URL(baseURL!).hostname,
      path: '/',
      secure: true,
      sameSite: 'Lax',
    },
  ]);
  await page.goto('/');
  await expect(page.getByRole('link', { name: /sign in/i })).toHaveCount(0);
  await expect(page.getByText('Sign in with Discord', { exact: false })).toHaveCount(0);
  const dashboard = page.getByRole('link', { name: 'Open dashboard' });
  await expect(dashboard).toHaveCount(2);
  await dashboard.first().click();
  await expect(page).toHaveURL(/\/portal$/);
  await page.goto('/changelog');
  await expect(page.getByRole('link', { name: /sign in/i })).toHaveCount(0);
  await page.goto('/login');
  await expect(page).toHaveURL(/\/portal$/);
});

test('desktop uses one active topbar with accessible dropdowns, notifications, and account controls', async ({
  page,
}) => {
  await page.context().setExtraHTTPHeaders({ Cookie: '__Host-dashboard_session=browser-member-session' });
  await page.setViewportSize({ width: 1920, height: 900 });
  await page.goto('/holdings');

  const primary = page.getByRole('navigation', { name: 'Primary', exact: true });
  await expect(primary).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Workspace', exact: true })).toHaveCount(0);
  const assets = primary.getByRole('button', { name: 'Assets', exact: true });
  await expect(assets).toHaveAttribute('aria-current', 'page');

  await assets.click();
  const assetsMenu = page.getByRole('menu', { name: 'Assets', exact: true });
  await expect(assetsMenu.getByRole('menuitem', { name: /Holdings/ })).toHaveAttribute('aria-current', 'page');
  await page.keyboard.press('Escape');
  await expect(assetsMenu).toHaveCount(0);
  await expect(assets).toBeFocused();

  const bases = primary.getByRole('button', { name: 'Bases', exact: true });
  await bases.click();
  const basesMenu = page.getByRole('menu', { name: 'Bases', exact: true });
  await expect(basesMenu.getByRole('region', { name: 'Community', exact: true })).toBeVisible();
  await expect(basesMenu.getByRole('region', { name: 'Operations', exact: true })).toBeVisible();
  await expect(basesMenu.getByRole('menuitem', { name: /Base Marketplace/ })).toBeVisible();
  await expect(basesMenu.getByRole('menuitem', { name: /3D preview/ })).toBeVisible();
  await expect(basesMenu.getByRole('menuitem', { name: /Base Storage/ })).toBeVisible();
  await bases.press('ArrowDown');
  await expect(basesMenu.getByRole('menuitem', { name: /Base Marketplace/ })).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(basesMenu.getByRole('menuitem', { name: /Share a base/ })).toBeFocused();
  const menuBounds = await basesMenu.boundingBox();
  expect(menuBounds).not.toBeNull();
  expect(menuBounds!.x).toBeGreaterThanOrEqual(0);
  expect(menuBounds!.x + menuBounds!.width).toBeLessThanOrEqual(1920);
  await primary.getByRole('button', { name: 'Guilds', exact: true }).click();
  await expect(page.getByRole('menu', { name: 'Bases', exact: true })).toHaveCount(0);
  await expect(page.getByRole('menu', { name: 'Guilds', exact: true })).toBeVisible();
  await page.keyboard.press('Escape');

  await page.getByRole('button', { name: 'Notifications', exact: true }).click();
  await expect(page.getByRole('menuitem', { name: /Guild applications/ })).toBeVisible();
  await expect(page.getByRole('menuitem', { name: /Guild support/ })).toBeVisible();
  await page.keyboard.press('Escape');

  await page.getByRole('button', { name: 'Account menu for Test member', exact: true }).click();
  await expect(page.getByRole('menuitem', { name: 'Character profile', exact: true })).toBeVisible();
  await expect(page.getByRole('menuitem', { name: 'Sign out', exact: true })).toBeVisible();
  await page.keyboard.press('Escape');

  await primary.getByRole('button', { name: 'More', exact: true }).click();
  const more = page.getByRole('menu', { name: 'More', exact: true });
  await expect(more.getByRole('menuitem', { name: /Changelog/ })).toBeVisible();
  await expect(more.getByRole('menuitem', { name: /Administration/ })).toHaveCount(0);
  await page.getByRole('heading', { name: 'Bases', exact: true }).click();
  await expect(more).toHaveCount(0);
});

test('administration stays restricted and mobile keeps every destination in a focus-managed drawer', async ({
  page,
}) => {
  await page.context().setExtraHTTPHeaders({ Cookie: '__Host-dashboard_session=browser-admin-session' });
  await page.goto('/admin');
  const primary = page.getByRole('navigation', { name: 'Primary', exact: true });
  await primary.getByRole('button', { name: 'More', exact: true }).click();
  await expect(page.getByRole('menuitem', { name: /Administration/ })).toBeVisible();
  await page.keyboard.press('Escape');

  await page.context().setExtraHTTPHeaders({ Cookie: '__Host-dashboard_session=browser-member-session' });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/holdings');
  await expect(page.getByRole('navigation', { name: 'Primary', exact: true })).toHaveCount(0);
  const trigger = page.getByRole('button', { name: 'Open menu', exact: true });
  await trigger.click();
  const drawer = page.getByRole('dialog', { name: 'Navigation', exact: true });
  await expect(drawer).toBeVisible();
  await expect(drawer.getByRole('button', { name: 'Close menu', exact: true })).toBeFocused();

  await expect(drawer.getByRole('button', { name: 'Assets', exact: true })).toHaveAttribute('aria-expanded', 'true');
  await expect(drawer.getByRole('link', { name: 'Holdings', exact: true })).toBeVisible();
  await drawer.getByRole('button', { name: 'Bases', exact: true }).click();
  await drawer.getByRole('button', { name: 'Operations', exact: true }).click();
  await expect(drawer.getByRole('link', { name: 'Base Storage', exact: true })).toBeVisible();
  await drawer.getByRole('button', { name: 'More', exact: true }).click();
  await expect(drawer.getByRole('link', { name: 'Changelog', exact: true })).toBeVisible();
  await expect(drawer.getByRole('link', { name: 'Administration', exact: true })).toHaveCount(0);
  await expect(drawer.getByRole('button', { name: 'Sign out', exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(drawer).toHaveCount(0);
  await expect(trigger).toBeFocused();
});

test('tablet moves lower-priority destinations into More without horizontal overflow', async ({ page }) => {
  await page.context().setExtraHTTPHeaders({ Cookie: '__Host-dashboard_session=browser-member-session' });
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/holdings');
  const primary = page.getByRole('navigation', { name: 'Primary', exact: true });
  await expect(primary.getByRole('link', { name: 'Character', exact: true })).toHaveCount(0);
  await primary.getByRole('button', { name: 'More', exact: true }).click();
  const more = page.getByRole('menu', { name: 'More', exact: true });
  for (const label of ['Character', 'Vehicles', 'Market', 'Map']) {
    await expect(more.getByRole('menuitem', { name: label, exact: true })).toBeVisible();
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
