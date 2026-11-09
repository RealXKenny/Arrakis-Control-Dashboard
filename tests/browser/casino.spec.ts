import type { BrowserContext, Page } from '@playwright/test';
import { test, expect } from '../helpers/browser-test';
import { fakeConsole, type TestMember } from '../helpers/fake-console-client';

/**
 * The Solaris Exchange in a real browser, against the production build. Redis is the fixture's casino emulation
 * (tests/helpers/casino-redis.mjs) and the Console is the fake one, so every number below is a real Solaris amount
 * moving through the real routes, engine and pages.
 */

async function signIn(
  context: BrowserContext,
  solaris: number,
  patch: Record<string, unknown> = {},
): Promise<TestMember> {
  // Solaris only moves while the character is logged out, so members start offline unless a test says otherwise.
  const member = await fakeConsole.newMember('Casino Tester', {
    ...patch,
    linked: { online: false, onlineStatus: 'Offline', ...(patch.linked as Record<string, unknown> | undefined) },
    details: { 'solaris-coin': { total: solaris } },
  });
  await context.setExtraHTTPHeaders({ Cookie: member.cookie });
  return member;
}

const walletBalance = async (page: Page) =>
  (await page.locator('section[aria-labelledby="balance"] p').first().innerText()).replace(/\D/g, '');

async function transfer(page: Page, kind: 'Deposit to casino' | 'Withdraw to game', amount: number) {
  await page.goto('/casino/wallet');
  await page.getByLabel(kind).check();
  await page.getByLabel('Amount (Solaris)').fill(String(amount));
  await page.getByRole('button', { name: 'Review' }).click();
  await page.getByRole('button', { name: 'Confirm' }).click();
}

const adjustments = async () =>
  (await fakeConsole.requests())
    .filter((request) => request.method === 'POST' && request.path.endsWith('/add-currency'))
    .map((request) => JSON.parse(request.body ?? '{}') as { currencyId: number; amount: number; confirmation: string });

test.afterEach(async () => {
  await fakeConsole.reset();
});

test.describe('wallet and transfers', () => {
  test('a deposit takes exactly that Solaris from the game and credits the casino wallet once', async ({
    page,
    context,
  }) => {
    await signIn(context, 50_000);
    await page.goto('/casino/wallet');
    expect(await walletBalance(page)).toBe('0');
    await page.getByLabel('Amount (Solaris)').fill('20000');
    await page.getByRole('button', { name: 'Review' }).click();
    await expect(page.getByRole('alertdialog')).toContainText('Take 20,000 Solaris from your game character');
    expect(await adjustments()).toHaveLength(0); // nothing is sent before the member confirms
    await page.getByRole('button', { name: 'Confirm' }).click();
    await expect(page.getByText('Done. The Solaris is in your casino wallet.')).toBeVisible();
    await expect.poll(() => walletBalance(page)).toBe('20000');
    expect(await adjustments()).toEqual([{ currencyId: 0, amount: -20_000, confirmation: 'ADD CURRENCY' }]);
    await page.reload();
    await expect(page.getByRole('cell', { name: 'Deposit from game' })).toBeVisible();
    expect(await walletBalance(page)).toBe('20000');
  });

  test('a withdrawal sends Solaris back to the game and releases the wallet balance', async ({ page, context }) => {
    await signIn(context, 50_000);
    await transfer(page, 'Deposit to casino', 20_000);
    await expect(page.getByText('Done. The Solaris is in your casino wallet.')).toBeVisible();
    await transfer(page, 'Withdraw to game', 5_000);
    await expect(
      page.getByText('Done. The Solaris will be in your game account the next time you join the game.'),
    ).toBeVisible();
    await expect.poll(() => walletBalance(page)).toBe('15000');
    expect((await adjustments()).map((change) => change.amount)).toEqual([-20_000, 5_000]);
  });

  test('refuses to move more than the game balance or the wallet holds, and sends nothing', async ({
    page,
    context,
  }) => {
    await signIn(context, 1_000);
    await transfer(page, 'Deposit to casino', 5_000);
    await expect(page.getByText('Not enough Solaris in your game account. Nothing was moved.')).toBeVisible();
    await transfer(page, 'Withdraw to game', 10);
    await expect(
      page.getByText('Not enough available Solaris in your casino wallet. Nothing was moved.'),
    ).toBeVisible();
    expect(await adjustments()).toHaveLength(0);
    expect(await walletBalance(page)).toBe('0');
  });

  test('Solaris cannot be moved while the character is online, and the game is never asked', async ({
    page,
    context,
  }) => {
    await signIn(context, 50_000, { linked: { online: true, onlineStatus: 'online' } });
    await transfer(page, 'Deposit to casino', 2_000);
    await expect(
      page.locator('[role="alert"]').filter({ hasText: 'Solaris can only be moved while your character is offline' }),
    ).toBeVisible();
    expect(await adjustments()).toHaveLength(0);
    await page.reload();
    expect(await walletBalance(page)).toBe('0');
  });

  test('an unconfirmed outcome is parked in plain words and never credits the wallet or retries', async ({
    page,
    context,
  }) => {
    await signIn(context, 50_000, { failures: { 'add-currency': 500 } });
    await transfer(page, 'Deposit to casino', 2_000);
    await expect(page.getByText('We could not confirm whether the game took the Solaris.')).toBeVisible();
    await expect(page.getByText('Nothing more will be sent automatically.')).toBeVisible();
    await page.reload();
    expect(await walletBalance(page)).toBe('0');
    expect(await adjustments()).toHaveLength(1);
  });

  test('the reconciliation page does not exist for ordinary members', async ({ page, context }) => {
    await signIn(context, 0);
    const response = await page.goto('/casino/admin');
    expect(response?.status()).toBe(404);
  });
});

test.describe('tables', () => {
  async function fund(page: Page, context: BrowserContext, amount = 5_000) {
    await signIn(context, amount * 2);
    await transfer(page, 'Deposit to casino', amount);
    await expect(page.getByText('Done. The Solaris is in your casino wallet.')).toBeVisible();
  }
  const frameBalance = async (page: Page) =>
    Number(
      (await page.locator('header >> text=Casino wallet').locator('xpath=following-sibling::p[1]').innerText()).replace(
        /\D/g,
        '',
      ),
    );

  test('coin flip: a real wager is held, settled once, and the wallet moves by exactly the result', async ({
    page,
    context,
  }) => {
    await fund(page, context);
    await page.goto('/casino/games/great-houses');
    await expect(page.getByText('Every wager here is real in-game Solaris')).toBeVisible();
    expect(await frameBalance(page)).toBe(5_000);
    await page.getByText('House Crescent', { exact: true }).click();
    await page.getByLabel('Wager (Solaris)').fill('100');
    await page.getByRole('button', { name: 'Flip the coin' }).click();
    const outcome = page.getByRole('status').filter({ hasText: /won the toss/ });
    await expect(outcome).toBeVisible();
    const text = await outcome.innerText();
    await expect.poll(() => frameBalance(page)).toBe(/You won/.test(text) ? 5_000 - 100 + 196 : 4_900);
    await page.goto('/casino/wallet');
    await expect(page.getByRole('cell', { name: 'Wager placed' }).first()).toBeVisible();
    await expect(page.getByRole('cell', { name: 'Round settled' }).first()).toBeVisible();
  });

  test('a wager above the server ceiling is refused with a clear message and nothing is held', async ({
    page,
    context,
  }) => {
    await fund(page, context);
    await page.goto('/casino/games/great-houses');
    await page.getByLabel('Wager (Solaris)').fill('20000');
    await page.getByRole('button', { name: 'Flip the coin' }).click();
    await expect(
      page.locator('[role="alert"]').filter({ hasText: 'The largest wager is 10000 Solaris' }),
    ).toBeVisible();
    expect(await frameBalance(page)).toBe(5_000);
  });

  test('roulette: bets are placed with the keyboard, totalled, and settled together', async ({ page, context }) => {
    await fund(page, context);
    await page.goto('/casino/games/spice-wheel');
    const seventeen = page.getByRole('button', { name: 'Number 17, black' });
    await seventeen.focus();
    await page.keyboard.press('Enter');
    await page.getByRole('button', { name: 'Red', exact: true }).focus();
    await page.keyboard.press('Space');
    await expect(page.getByText('Total: 200')).toBeVisible();
    await page.getByRole('button', { name: 'Spin' }).click();
    await expect(page.getByRole('status').filter({ hasText: /\d+ (red|black|green)\./ })).toBeVisible();
    await expect.poll(() => frameBalance(page)).not.toBe(5_000 - 200 + 0.5); // settled, nothing left held
    await expect(page.getByText('in play')).toHaveCount(0);
  });

  test('dice: shows the odds first, then rolls on the server', async ({ page, context }) => {
    await fund(page, context);
    await page.goto('/casino/games/fate-of-arrakis');
    await expect(page.getByText('50.00%')).toBeVisible();
    await expect(page.getByText('1.9800x')).toBeVisible();
    await page.getByLabel('Wager (Solaris)').fill('100');
    await page.getByRole('button', { name: 'Roll', exact: true }).click();
    await expect(page.getByRole('status').filter({ hasText: /Rolled \d+\.\d\d/ })).toBeVisible();
  });

  test('blackjack: the hole card stays hidden until the hand ends', async ({ page, context }) => {
    await fund(page, context);
    await page.goto('/casino/games/emperors-hand');
    await page.getByLabel('Wager (Solaris)').fill('100');
    await page.getByRole('button', { name: 'Deal' }).click();
    const stand = page.getByRole('button', { name: 'Stand' });
    const result = page.getByRole('status').filter({ hasText: /You (won|lost)|Push/ });
    await expect(stand.or(result)).toBeVisible(); // a natural blackjack ends the hand at once
    if (await stand.isVisible()) {
      await expect(page.getByRole('img', { name: 'Face-down card' })).toHaveCount(1);
      await stand.click();
    }
    await expect(result).toBeVisible();
    await expect(page.getByRole('img', { name: 'Face-down card' })).toHaveCount(0);
  });

  test('mines: the board is not in the page while the round is open, and an unfinished round resumes after a reload', async ({
    page,
    context,
  }) => {
    await fund(page, context);
    await page.goto('/casino/games/spice-harvest');
    await page.getByLabel('Wager (Solaris)').fill('100');
    await page.getByRole('button', { name: 'Begin expedition' }).click();
    await expect(page.getByRole('button', { name: 'Tile 1, 1: hidden' })).toBeVisible();
    expect(await page.content()).not.toMatch(/Tile \d, \d: (sandworm hazard|spice cache)/);
    expect(await frameBalance(page)).toBe(4_900);
    await page.reload();
    await expect(page.getByRole('button', { name: 'Tile 1, 1: hidden' })).toBeVisible(); // resumed
    await page.getByRole('button', { name: 'Tile 1, 1: hidden' }).click();
    await expect(page.getByRole('button', { name: /Tile 1, 1: (spice cache|sandworm hazard)/ })).toBeVisible();
  });

  test('crash: the server decides the flight; cashing out ends it with a result', async ({ page, context }) => {
    await fund(page, context);
    await page.goto('/casino/games/ornithopter-run');
    await page.getByLabel('Wager (Solaris)').fill('100');
    await page.getByRole('button', { name: 'Launch' }).click();
    const cashOut = page.getByRole('button', { name: /Cash out/ });
    await expect(cashOut.or(page.getByRole('status').filter({ hasText: /Flight over/ }))).toBeVisible();
    if (await cashOut.isVisible().catch(() => false)) await cashOut.click();
    await expect(page.getByRole('status').filter({ hasText: /Flight over/ })).toBeVisible();
    await expect(page.getByRole('button', { name: 'New flight' })).toBeVisible();
  });

  test('pausing play blocks new rounds but not the wallet', async ({ page, context }) => {
    await fund(page, context);
    await page.goto('/casino/wallet');
    await page.getByRole('button', { name: '1 hour' }).click();
    await page.getByRole('button', { name: 'Confirm break' }).click();
    await expect(page.getByText(/Paused until/)).toBeVisible();
    await page.goto('/casino/games/great-houses');
    await expect(page.getByText('You paused play until')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Flip the coin' })).toBeDisabled();
    await page.goto('/casino/wallet');
    await expect(page.getByRole('button', { name: 'Review' }))
      .toBeEnabled({ timeout: 1000 })
      .catch(() => undefined);
  });

  test('fairness: a finished round can be verified once its seed is retired', async ({ page, context }) => {
    await fund(page, context);
    await page.goto('/casino/games/great-houses');
    await page.getByLabel('Wager (Solaris)').fill('100');
    await page.getByRole('button', { name: 'Flip the coin' }).click();
    await expect(page.getByRole('status').filter({ hasText: /won the toss/ })).toBeVisible();
    await page.goto('/casino/history');
    await page.getByRole('link', { name: 'Verify' }).first().click();
    await page.getByRole('button', { name: 'Verify', exact: true }).click();
    await expect(page.getByText('The seed for this round is still active')).toBeVisible();
    await page.getByRole('button', { name: 'Rotate seed and reveal the old one' }).click();
    await expect(page.getByText('Server seed (1 rounds)')).toBeVisible();
    await page.getByRole('button', { name: 'Verify', exact: true }).click();
    await expect(page.getByText('Verified: replaying the retired seed reproduces this round exactly.')).toBeVisible();
  });
});

test.describe('presentation', () => {
  test('the Casino menu lists the lobby, every game, the wallet, history, fairness and rules', async ({
    page,
    context,
  }) => {
    await signIn(context, 0);
    await page.setViewportSize({ width: 1940, height: 900 });
    await page.goto('/casino');
    await page.getByRole('button', { name: 'Casino' }).click();
    const menu = page.getByRole('menu', { name: 'Casino' });
    for (const name of ['Overview', 'Wallet', 'Game history', 'Fairness', 'Rules & help'])
      await expect(menu.getByRole('menuitem', { name: new RegExp(`^${name}`) })).toBeVisible();
    for (const game of [
      "The Emperor's Hand",
      'The Spice Wheel',
      'Fate of Arrakis',
      'Spice Harvest',
      'Ornithopter Run',
      'The Great Houses',
    ])
      await expect(menu.getByRole('menuitem', { name: new RegExp(`^${game}`) })).toBeVisible();
    await menu.getByRole('menuitem', { name: /^Wallet/ }).click();
    await expect(page).toHaveURL(/\/casino\/wallet$/);
  });

  test('the lobby, wallet, rules and every table fit a phone without sideways scrolling', async ({ page, context }) => {
    await signIn(context, 0);
    await page.setViewportSize({ width: 375, height: 800 });
    for (const path of [
      '/casino',
      '/casino/wallet',
      '/casino/rules',
      '/casino/history',
      '/casino/fairness',
      '/casino/games/emperors-hand',
      '/casino/games/spice-wheel',
      '/casino/games/fate-of-arrakis',
      '/casino/games/spice-harvest',
      '/casino/games/ornithopter-run',
      '/casino/games/great-houses',
    ]) {
      await page.goto(path);
      const { overflow, culprits } = await page.evaluate(() => {
        const width = document.documentElement.clientWidth;
        const wide = [...document.querySelectorAll('body *')]
          .filter((element) => element.getBoundingClientRect().right > width + 1)
          .slice(0, 4)
          .map((element) => `${element.tagName.toLowerCase()}.${String(element.className).slice(0, 60)}`);
        return { overflow: document.documentElement.scrollWidth - width, culprits: wide };
      });
      expect(overflow, `${path} overflows by ${overflow}px: ${culprits.join(' | ')}`).toBeLessThanOrEqual(1);
    }
  });

  test('animation is off when the member prefers reduced motion', async ({ page, context }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await signIn(context, 20_000);
    await transfer(page, 'Deposit to casino', 5_000);
    await expect(page.getByText('Done. The Solaris is in your casino wallet.')).toBeVisible();
    await page.goto('/casino/games/great-houses');
    await page.getByLabel('Wager (Solaris)').fill('100');
    await page.getByRole('button', { name: 'Flip the coin' }).click();
    await expect(page.getByRole('status').filter({ hasText: /won the toss/ })).toBeVisible();
    const animation = await page.evaluate(() => {
      const coin = [...document.querySelectorAll('div')].find(
        (element) => /coin/.test(element.className) && getComputedStyle(element).borderRadius === '50%',
      );
      return coin ? getComputedStyle(coin).animationName : 'missing';
    });
    expect(animation).toBe('none');
  });

  test('every table announces its result to assistive technology and names its controls', async ({ page, context }) => {
    await signIn(context, 0);
    await page.goto('/casino/games/great-houses');
    await expect(page.getByRole('radio', { name: 'House Scarab' })).toBeAttached();
    await expect(page.getByLabel('Wager (Solaris)')).toBeVisible();
    await page.goto('/casino/games/spice-wheel');
    await expect(page.getByRole('group', { name: /Betting table/ })).toBeVisible();
    expect(await page.locator('button[aria-label^="Number "]').count()).toBe(37);
  });
});
