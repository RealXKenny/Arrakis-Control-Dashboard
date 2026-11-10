import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { test, expect } from '../helpers/browser-test';
import { fakeConsole } from '../helpers/fake-console-client';

test.afterEach(async () => {
  await fakeConsole.reset();
});

test('casino tables and open sound settings pass automated accessibility checks', async ({ page, context }) => {
  const source = readFileSync(createRequire(import.meta.url).resolve('axe-core/axe.min.js'), 'utf8');
  const member = await fakeConsole.newMember('Accessible Tables');
  await context.setExtraHTTPHeaders({ Cookie: member.cookie });
  for (const game of [
    'emperors-hand',
    'spice-wheel',
    'fate-of-arrakis',
    'spice-harvest',
    'ornithopter-run',
    'great-houses',
  ]) {
    await page.goto(`/casino/games/${game}`);
    await page.getByLabel('Sound settings', { exact: true }).click();
    await page.evaluate(source);
    const problems = await page.evaluate(async () => {
      const result = await (
        window as unknown as {
          axe: {
            run: (
              document: Document,
              options: object,
            ) => Promise<{ violations: Array<{ id: string; nodes: Array<{ target: string[] }> }> }>;
          };
        }
      ).axe.run(document, { runOnly: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] });
      return result.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`);
    });
    expect(problems, game).toEqual([]);
  }
});

test('audio starts disabled, persists opt-in and category settings, and card backs survive reloads', async ({
  page,
  context,
}) => {
  const member = await fakeConsole.newMember('Presentation Tester', {
    linked: { online: false, onlineStatus: 'Offline' },
  });
  await context.setExtraHTTPHeaders({ Cookie: member.cookie });
  await page.goto('/casino/games/emperors-hand');
  await expect(page.getByLabel('Sound settings', { exact: true })).toContainText('off');
  await page.getByLabel('Sound settings', { exact: true }).click();
  await expect(page.getByLabel('Enable sound')).not.toBeChecked();
  await expect(page.getByLabel('Dealer voice', { exact: true })).toHaveValue('local:solaris-v1');
  await expect(page.getByLabel('Hover sounds')).not.toBeChecked();
  await page.getByLabel('Enable sound').check();
  await page.getByLabel('Interface volume').fill('0');
  await page.getByLabel('Sound settings', { exact: true }).click();
  await page.getByText('Card back · Imperial Gold').click();
  await page.getByRole('button', { name: 'Spice Horizon', exact: false }).click();
  await page.reload();
  await expect(page.getByText('Card back · Spice Horizon')).toBeVisible();
  await page.getByLabel('Sound settings', { exact: true }).click();
  await expect(page.getByLabel('Enable sound')).toBeChecked();
  await expect(page.getByLabel('Interface volume')).toHaveValue('0');
  await page.getByLabel('Enable sound').uncheck();
});

for (const width of [320, 390]) {
  test(`casino tables and sound controls fit ${width}px with reduced motion`, async ({ page, context }, testInfo) => {
    const member = await fakeConsole.newMember('Mobile Tables');
    await context.setExtraHTTPHeaders({ Cookie: member.cookie });
    await page.setViewportSize({ width, height: 850 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    for (const game of [
      'emperors-hand',
      'spice-wheel',
      'fate-of-arrakis',
      'spice-harvest',
      'ornithopter-run',
      'great-houses',
    ]) {
      await page.goto(`/casino/games/${game}`);
      await expect(page.locator('[data-casino-table]')).toBeVisible();
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth),
        game,
      ).toBeLessThanOrEqual(1);
      await page.screenshot({ path: testInfo.outputPath(`${game}-${width}.png`), fullPage: true });
    }
    await page.getByLabel('Sound settings', { exact: true }).click();
    await expect(page.getByLabel('Enable sound')).toBeVisible();
    const soundPanel = page.locator('[data-audio-settings] > div');
    const panelBounds = await soundPanel.boundingBox();
    expect(panelBounds).not.toBeNull();
    expect(panelBounds!.x).toBeGreaterThanOrEqual(0);
    expect(panelBounds!.x + panelBounds!.width).toBeLessThanOrEqual(width);
    expect(panelBounds!.y + panelBounds!.height).toBeLessThanOrEqual(850);
    await page.getByRole('button', { name: 'Preview sound', exact: true }).scrollIntoViewIfNeeded();
    await expect(page.getByRole('button', { name: 'Preview sound', exact: true })).toBeInViewport();
    await page.screenshot({ path: testInfo.outputPath(`sound-settings-${width}.png`) });
    await page.keyboard.press('Escape');
    await expect(page.getByLabel('Sound settings', { exact: true })).toBeFocused();
    await expect(soundPanel).not.toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth),
    ).toBeLessThanOrEqual(1);
  });
}

test('Blackjack felt and roulette wheel render at desktop size', async ({ page, context }, testInfo) => {
  const member = await fakeConsole.newMember('Desktop Tables');
  await context.setExtraHTTPHeaders({ Cookie: member.cookie });
  await page.setViewportSize({ width: 1440, height: 1000 });
  for (const game of ['emperors-hand', 'spice-wheel']) {
    await page.goto(`/casino/games/${game}`);
    await page.screenshot({ path: testInfo.outputPath(`${game}-desktop.png`), fullPage: true });
  }
});

test('confirmed Blackjack narration uses audio after consent and stays quiet on resume', async ({ page, context }) => {
  await page.addInitScript(() => {
    const state = { oscillators: 0, recordings: 0, spoken: [] as string[] };
    const originalStart = AudioBufferSourceNode.prototype.start;
    AudioBufferSourceNode.prototype.start = function (...args: Parameters<typeof originalStart>) {
      if (args[0] !== undefined) state.recordings++;
      return originalStart.apply(this, args);
    };
    Object.assign(window, { audioTest: state });
    const original = AudioContext.prototype.createOscillator;
    AudioContext.prototype.createOscillator = function () {
      state.oscillators++;
      return original.call(this);
    };
    Object.defineProperty(window.speechSynthesis, 'speak', {
      value: (speech: SpeechSynthesisUtterance) => state.spoken.push(speech.text),
      configurable: true,
    });
  });
  const member = await fakeConsole.newMember('Audio Tester', {
    linked: { online: false, onlineStatus: 'Offline' },
    details: { 'solaris-coin': { total: 10000 } },
  });
  await context.setExtraHTTPHeaders({ Cookie: member.cookie });
  await page.goto('/casino/wallet');
  const getState = () =>
    page.evaluate(
      () =>
        (window as unknown as { audioTest: { oscillators: number; recordings: number; spoken: string[] } }).audioTest,
    );
  expect((await getState()).oscillators).toBe(0);
  await page.getByLabel('Amount (Solaris)').fill('5000');
  await page.getByRole('button', { name: 'Review' }).click();
  await page.getByRole('button', { name: 'Confirm' }).click();
  await expect(page.getByText('Done. The Solaris is in your casino wallet.')).toBeVisible();
  expect((await getState()).oscillators).toBe(0);
  await page.goto('/casino/games/emperors-hand');
  await page.getByLabel('Sound settings', { exact: true }).click();
  await page.getByLabel('Enable sound').check();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Deal', exact: true }).click();
  await expect.poll(async () => (await getState()).recordings).toBeGreaterThan(0);
  expect((await getState()).oscillators).toBeGreaterThan(0);
  expect((await getState()).spoken).toEqual([]);
  const clips = await page.evaluate(() =>
    performance
      .getEntriesByType('resource')
      .map((entry) => entry.name)
      .filter((name) => name.includes('/audio/casino/')),
  );
  expect(clips.length).toBeGreaterThan(0);
  expect(clips.every((name) => new URL(name).origin === 'http://127.0.0.1:3100')).toBeTruthy();
  await page.reload();
  await expect(page.getByLabel('Sound settings', { exact: true })).toContainText('on');
  await page.waitForTimeout(500); // a resumed hand must not enqueue delayed speech
  expect((await getState()).spoken).toEqual([]);
  expect((await getState()).recordings).toBe(0);
});

test('all 52 SVG faces can be inspected together without changing game rules', async ({ page, context }, testInfo) => {
  const member = await fakeConsole.newMember('Deck Inspector');
  await context.setExtraHTTPHeaders({ Cookie: member.cookie });
  const round = {
    id: 'deck-fixture',
    game: 'emperors-hand',
    status: 'open',
    wager: '100',
    holds: 1,
    version: 1,
    fairness: null,
    settlement: null,
    failureCode: null,
    game_view: {
      hands: Array.from({ length: 4 }, (_, suit) => ({
        cards: Array.from({ length: 13 }, (_, rank) => suit * 13 + rank),
        total: 0,
        soft: false,
        doubled: false,
        done: false,
      })),
      dealer: [],
      dealerHidden: false,
      dealerTotal: null,
      active: null,
      actions: [],
    },
  };
  await page.route('**/api/v2/casino/rounds?status=open', (route) => route.fulfill({ json: { rounds: [round] } }));
  await page.route('**/api/v2/casino/rounds/deck-fixture', (route) => route.fulfill({ json: { round } }));
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 1600, height: 1400 });
  await page.goto('/casino/games/emperors-hand');
  const cards = page.locator('[data-casino-table] section[aria-label^="Your hand"] [role="img"]');
  await expect(cards).toHaveCount(52);
  const labels = await cards.evaluateAll((elements) => elements.map((element) => element.getAttribute('aria-label')));
  expect(new Set(labels).size).toBe(52);
  await page.screenshot({ path: testInfo.outputPath('complete-deck.png'), fullPage: true });
});
