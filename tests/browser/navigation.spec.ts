import { test, expect } from '../helpers/browser-test';

test('desktop uses one active topbar with accessible dropdowns, notifications, and account controls', async ({
  page,
}) => {
  await page.context().setExtraHTTPHeaders({ Cookie: '__Host-dashboard_session=browser-member-session' });
  await page.setViewportSize({ width: 1600, height: 900 });
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
  expect(menuBounds!.x + menuBounds!.width).toBeLessThanOrEqual(1600);
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
