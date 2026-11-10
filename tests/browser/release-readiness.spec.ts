import type { Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { expect, test } from '../helpers/browser-test';
import { fakeConsole } from '../helpers/fake-console-client';

const axeSource = readFileSync(createRequire(import.meta.url).resolve('axe-core/axe.min.js'), 'utf8');
const routes = [
  '/portal',
  '/character',
  '/holdings',
  '/storage',
  '/vehicles',
  '/market',
  '/bases',
  '/bases/upload',
  '/guilds',
  '/guild',
  '/map',
  '/chat',
  '/status',
  '/events',
  '/casino',
  '/casino/wallet',
  '/casino/history',
  '/casino/fairness',
  '/casino/rules',
  '/casino/games/emperors-hand',
  '/casino/games/spice-wheel',
  '/casino/games/fate-of-arrakis',
  '/casino/games/spice-harvest',
  '/casino/games/ornithopter-run',
  '/casino/games/great-houses',
] as const;
const viewports = [
  [1920, 1080],
  [1440, 900],
  [1366, 768],
  [768, 1024],
  [390, 844],
  [320, 640],
] as const;

async function accessibilityProblems(page: Page) {
  await page.evaluate(axeSource);
  return page.evaluate(async () => {
    const result = await (
      window as unknown as {
        axe: {
          run: (
            document: Document,
            options: object,
          ) => Promise<{ violations: Array<{ id: string; nodes: Array<{ target: string[] }> }> }>;
        };
      }
    ).axe.run(document, { runOnly: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] });
    return result.violations.map(
      (violation) => `${violation.id}: ${violation.nodes.map((node) => node.target.join(' ')).join(', ')}`,
    );
  });
}

test.afterEach(async () => {
  await fakeConsole.reset();
});

test('major member areas fit every release viewport without broken images', async ({ page, context }) => {
  test.setTimeout(240_000);
  const member = await fakeConsole.newMember('Release Review', { guild: { id: '2', role: 100 } });
  await context.setExtraHTTPHeaders({ Cookie: member.cookie });
  const problems: string[] = [];
  for (const [width, height] of viewports) {
    await page.setViewportSize({ width, height });
    for (const route of routes) {
      await page.goto(route);
      await expect(page.locator('main')).toBeVisible();
      await page.evaluate(() => document.fonts.ready);
      const result = await page.evaluate(() => ({
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        broken: [...document.images]
          .filter((image) => image.complete && image.naturalWidth === 0)
          .map((image) => image.getAttribute('src')),
        wide: [...document.querySelectorAll('body *')]
          .filter((element) => element.getBoundingClientRect().right > document.documentElement.clientWidth + 1)
          .slice(0, 5)
          .map((element) => `${element.tagName}.${element.className}`),
      }));
      if (result.overflow > 1)
        problems.push(`${route} at ${width}x${height}: ${result.overflow}px overflow (${result.wide.join(', ')})`);
      if (result.broken.length) problems.push(`${route} at ${width}x${height}: broken ${result.broken.join(', ')}`);
    }
  }
  expect(problems).toEqual([]);
});

test('major member areas pass WCAG AA automation on desktop and mobile', async ({ page, context }) => {
  test.setTimeout(240_000);
  const member = await fakeConsole.newMember('Accessibility Review', { guild: { id: '2', role: 100 } });
  await context.setExtraHTTPHeaders({ Cookie: member.cookie });
  const problems: string[] = [];
  for (const [width, height] of [
    [1440, 900],
    [390, 844],
  ]) {
    await page.setViewportSize({ width, height });
    for (const route of routes) {
      await page.goto(route);
      await expect(page.locator('main')).toBeVisible();
      const violations = await accessibilityProblems(page);
      for (const violation of violations) problems.push(`${route} at ${width}x${height}: ${violation}`);
    }
  }
  expect(problems).toEqual([]);
});

test('representative animated areas remove motion without hiding state', async ({ page, context }) => {
  const member = await fakeConsole.newMember('Reduced Motion Review');
  await context.setExtraHTTPHeaders({ Cookie: member.cookie });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  for (const route of ['/portal', '/map', '/casino', '/casino/games/emperors-hand', '/casino/games/spice-wheel']) {
    await page.goto(route);
    const moving = await page.evaluate(() =>
      [...document.querySelectorAll('body *')]
        .filter((element) => {
          const style = getComputedStyle(element);
          return style.animationName !== 'none' || !['0s', ''].includes(style.transitionDuration);
        })
        .slice(0, 5)
        .map((element) => `${element.tagName}.${element.className}`),
    );
    expect(moving, route).toEqual([]);
    await expect(page.locator('main')).toBeVisible();
  }
});

test('release screenshots come from sanitized live fixture pages', async ({ page, context }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  await page.screenshot({ path: testInfo.outputPath('landing-desktop.png'), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForLoadState('networkidle');
  await page.screenshot({ path: testInfo.outputPath('landing-mobile.png'), fullPage: true });

  const member = await fakeConsole.newMember('Release Screenshot', {
    linked: { online: false, onlineStatus: 'Offline' },
    details: { 'solaris-coin': { total: 10000 } },
  });
  await context.setExtraHTTPHeaders({ Cookie: member.cookie });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/portal');
  await expect(page.getByText('Solari credit')).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('dashboard-desktop.png'), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByText('Solari credit')).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('dashboard-mobile.png') });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/casino');
  await expect(page.getByRole('heading', { name: 'The tables' })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('casino-lobby-desktop.png'), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole('heading', { name: 'The tables' })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('casino-lobby-mobile.png'), fullPage: true });

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/casino/wallet');
  await page.getByLabel('Amount (Solaris)').fill('5000');
  await page.getByRole('button', { name: 'Review' }).click();
  await page.getByRole('button', { name: 'Confirm' }).click();
  await expect(page.getByText('Done. The Solaris is in your casino wallet.')).toBeVisible();
  await page.goto('/casino/games/emperors-hand');
  await page.getByLabel('Wager (Solaris)').fill('100');
  await page.getByRole('button', { name: 'Deal', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Stand' }).or(page.getByRole('status'))).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: testInfo.outputPath('blackjack-gameplay.png'), fullPage: true });
  await page.getByLabel('Sound settings', { exact: true }).click();
  await page.screenshot({ path: testInfo.outputPath('sound-settings.png'), fullPage: true });
  await page.keyboard.press('Escape');
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.getByRole('navigation', { name: 'Primary' }).getByRole('button', { name: 'Casino' }).click();
  const casinoMenu = page.getByRole('menu', { name: 'Casino', exact: true });
  await expect(casinoMenu).toBeVisible();
  await expect.poll(() => casinoMenu.evaluate((element) => getComputedStyle(element).opacity)).toBe('1');
  await casinoMenu.screenshot({ path: testInfo.outputPath('navigation-casino-menu.png') });
  await page.keyboard.press('Escape');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Open menu', exact: true }).click();
  await page.screenshot({ path: testInfo.outputPath('navigation-mobile-drawer.png'), fullPage: true });
});
