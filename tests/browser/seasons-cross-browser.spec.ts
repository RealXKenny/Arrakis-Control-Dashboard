import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import type { Page, Browser, TestInfo } from '@playwright/test';
import { test, expect } from '../helpers/browser-test';
import type { Season, Definition, CommunityUpdate } from '../../src/features/seasons/contracts';

const appOrigin = () => String(test.info().project.use.baseURL ?? 'http://127.0.0.1:3100');
const adminCookie = '__Host-dashboard_session=browser-admin-session';
const memberCookie = '__Host-dashboard_session=browser-member-session';
const axeSource = readFileSync(createRequire(import.meta.url).resolve('axe-core/axe.min.js'), 'utf8');

async function adminAction(page: Page, data: Record<string, unknown>) {
  const response = await page.request.post('/api/v2/admin/seasons', { headers: { Origin: appOrigin() }, data });
  expect(response.ok(), await response.text()).toBe(true);
  return response.json();
}
async function seed(page: Page) {
  await page.context().setExtraHTTPHeaders({ Cookie: adminCookie });
  const initial = (await (await page.request.get('/api/v2/admin/seasons')).json()) as {
    seasons: Season[];
    template: Definition;
  };
  // Fixture accounts and isolated RESP storage only; each project closes the prior fixture season before publishing.
  for (const season of initial.seasons.filter((s) => s.phase === 'published'))
    await adminAction(page, {
      action: 'transition',
      seasonId: season.id,
      revision: season.revision,
      transition: 'end',
      confirmation: season.definition.name,
    });
  const definition: Definition = {
    ...initial.template,
    slug: `browser-${randomUUID()}`,
    name: 'The Shared Horizon',
    number: Math.max(0, ...initial.seasons.map((s) => s.definition.number)) + 1,
    startsAt: new Date(Date.now() - 3600000).toISOString(),
    endsAt: new Date(Date.now() + 86400000).toISOString(),
    milestones: [
      {
        id: 'together',
        name: 'Together across the sands',
        description: 'Complete one approved community objective.',
        target: 1,
      },
    ],
  };
  const { season } = await adminAction(page, { action: 'save', seasonId: randomUUID(), revision: '', definition });
  return season as Season;
}
async function memberBrowser(browser: Browser, info: TestInfo) {
  return browser.newContext({
    baseURL: appOrigin(),
    ignoreHTTPSErrors: info.project.use.ignoreHTTPSErrors,
    extraHTTPHeaders: { Cookie: memberCookie },
    viewport: info.project.use.viewport,
    isMobile: info.project.use.isMobile,
    hasTouch: info.project.use.hasTouch,
    deviceScaleFactor: info.project.use.deviceScaleFactor,
    userAgent: info.project.use.userAgent,
  });
}
async function accessible(page: Page) {
  await page.evaluate(axeSource);
  const violations = await page.evaluate(async () => {
    const axe = (
      window as unknown as {
        axe: {
          run: (
            document: Document,
            options: object,
          ) => Promise<{ violations: { id: string; nodes: { target: string[] }[] }[] }>;
        };
      }
    ).axe;
    const result = await axe.run(document, { runOnly: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] });
    return result.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`);
  });
  expect(violations).toEqual([]);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth),
  ).toBeLessThanOrEqual(1);
}

test('uploaded hero/reward art and audited live edits preserve immutable rewards across browsers', async ({
  page,
  browser,
}, info) => {
  test.setTimeout(60000);
  page.setDefaultTimeout(10000);
  const draft = await seed(page);
  const context = await memberBrowser(browser, info);
  const member = await context.newPage();
  member.setDefaultTimeout(10000);
  await member.clock.install();
  await page.goto('/admin?tab=seasons');
  await page
    .getByRole('button', { name: /The Shared Horizon/ })
    .first()
    .click();
  const image = await sharp({ create: { width: 640, height: 360, channels: 3, background: '#3b7891' } })
    .png()
    .toBuffer();
  await page
    .getByLabel('Season hero artwork', { exact: true })
    .setInputFiles({ name: 'season.png', mimeType: 'image/png', buffer: image });
  await expect(page.getByLabel('Alternative text for Season hero artwork')).toBeVisible();
  await page.getByLabel('Alternative text for Season hero artwork').fill('Spice-blue desert horizon');
  // Reuse the same decoded image in another slot; content addressing avoids extra binary copies.
  await page
    .getByLabel('Reward artwork: Wayfarer', { exact: true })
    .setInputFiles({ name: 'reward.png', mimeType: 'image/png', buffer: image });
  await expect(page.getByLabel('Alternative text for Reward artwork: Wayfarer')).toBeVisible();
  const beforeSave = await (await page.request.get(`/api/v2/admin/seasons?season=${draft.id}`)).json();
  const uploadPreview = page.getByRole('img', { name: 'Spice-blue desert horizon', exact: true });
  const imageUrl = await uploadPreview.getAttribute('src');
  expect((await member.request.get(imageUrl)).status()).toBe(404);
  await page.getByRole('button', { name: 'Save draft', exact: true }).click();
  await expect(page.locator('.season-notice[role="status"]')).toHaveText('Season operation saved.');
  page.once('dialog', (dialog) => dialog.accept(draft.definition.name));
  await page.getByRole('button', { name: 'Publish saved season', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Live season presentation', exact: true })).toBeVisible();
  await member.goto(`/seasons?season=${draft.id}`);
  await expect(member.getByRole('img', { name: 'Spice-blue desert horizon', exact: true })).toBeVisible();
  const response = await member.request.get(imageUrl);
  expect(response.status()).toBe(200);
  expect(response.headers()['content-type']).toBe('image/webp');
  expect(response.headers()['x-content-type-options']).toBe('nosniff');
  await member.getByRole('button', { name: /Level 01.*Wayfarer/ }).click();
  await member.getByRole('button', { name: 'Confirm free claim', exact: true }).click();
  await expect(member.locator('.season-notice[role="status"]')).toContainText('Cosmetic claimed');
  const published = await (await page.request.get(`/api/v2/admin/seasons?season=${draft.id}`)).json();
  const liveEditor = page
    .locator('section')
    .filter({ has: page.getByRole('heading', { name: 'Live season presentation', exact: true }) });
  const liveImage = await sharp({ create: { width: 640, height: 360, channels: 3, background: '#775a32' } })
    .png()
    .toBuffer();
  await page
    .getByLabel('Live season hero artwork', { exact: true })
    .setInputFiles({ name: 'evening.png', mimeType: 'image/png', buffer: liveImage });
  await expect(
    liveEditor.getByText('Artwork uploaded. Save the season or live presentation to use it.', { exact: true }),
  ).toBeVisible();
  await page.getByLabel('Alternative text for Live season hero artwork').fill('Copper desert evening');
  await page.getByLabel('Live subtitle', { exact: true }).fill('A living community, a permanent legacy');
  await page
    .getByLabel('Live description', { exact: true })
    .fill('Updated information for every traveller, without changing the published objectives.');
  await page.getByLabel('Live theme', { exact: true }).selectOption('eclipse');
  await page.getByLabel('Reason for live edit').fill('Clarify the current community season introduction.');
  await page.getByLabel('Type the saved season name to confirm').fill(draft.definition.name);
  await page.getByRole('button', { name: 'Save live presentation', exact: true }).click();
  await expect(page.locator('.season-notice[role="status"]')).toHaveText('Season operation saved.');
  const after = await (await page.request.get(`/api/v2/admin/seasons?season=${draft.id}`)).json();
  expect(after.season.definition).toEqual(published.season.definition);
  expect(after.audit.at(-1).action).toBe('season.presentation_updated');
  expect(after.season.version).toBeGreaterThan(beforeSave.season.version);
  const stale = await page.request.post('/api/v2/admin/seasons', {
    headers: { Origin: appOrigin() },
    data: {
      action: 'presentation',
      seasonId: draft.id,
      revision: published.season.revision,
      presentation: after.season.presentation,
      reason: 'A stale tab must never overwrite a new edit.',
      confirmation: draft.definition.name,
    },
  });
  expect(stale.status()).toBe(409);
  await member.clock.runFor(15010);
  await expect(member.getByText('A living community, a permanent legacy', { exact: true })).toBeVisible();
  await expect(member.getByRole('img', { name: 'Copper desert evening', exact: true })).toBeVisible();
  const owned = await (await member.request.get(`/api/v2/seasons?season=${draft.id}`)).json();
  expect(owned.progress.claims[0].reward).toEqual(published.season.definition.rewards[0]);
  await accessible(member);
  await accessible(page);
  await member.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
  await member.screenshot({ path: info.outputPath('uploaded-artwork.png'), fullPage: true });
  await page.getByText('Permanent season audit (latest 100 operations)', { exact: true }).click();
  await page.getByRole('button', { name: 'Inspect presentation change', exact: true }).last().click();
  await expect(page.getByRole('heading', { name: 'Presentation change', exact: true })).toBeVisible();
  await expect(page.getByText(`Before: ${draft.definition.subtitle}`, { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Restore published presentation in form', exact: true }).click();
  await page.getByLabel('Reason for live edit').fill('Restore the published presentation through an audited rollback.');
  await page.getByLabel('Type the saved season name to confirm').fill(draft.definition.name);
  await page.getByRole('button', { name: 'Save live presentation', exact: true }).click();
  await expect(page.locator('.season-notice[role="status"]')).toHaveText('Season operation saved.');
  await member.reload();
  await expect(member.getByText(draft.definition.subtitle, { exact: true })).toBeVisible();
  const restored = await (await page.request.get(`/api/v2/admin/seasons?season=${draft.id}`)).json();
  expect(restored.season.definition).toEqual(published.season.definition);
  const ended = await adminAction(page, {
    action: 'transition',
    seasonId: draft.id,
    revision: restored.season.revision,
    transition: 'end',
    confirmation: draft.definition.name,
  });
  const locked = await page.request.post('/api/v2/admin/seasons', {
    headers: { Origin: appOrigin() },
    data: {
      action: 'presentation',
      seasonId: draft.id,
      revision: ended.season.revision,
      presentation: after.season.presentation,
      reason: 'A completed season must remain historically accurate.',
      confirmation: draft.definition.name,
    },
  });
  expect(locked.status()).toBe(409);
  await context.close();
});

test('live progress observes another member, retains totals on failure, and pauses hidden polling', async ({
  page,
  browser,
}, info) => {
  test.setTimeout(60000);
  const draft = await seed(page);
  const published = await adminAction(page, {
    action: 'transition',
    seasonId: draft.id,
    revision: draft.revision,
    transition: 'publish',
    confirmation: draft.definition.name,
  });
  const context = await memberBrowser(browser, info);
  const member = await context.newPage();
  await member.clock.install();
  await member.goto(`/seasons?season=${draft.id}`);
  await expect(member.getByRole('heading', { name: draft.definition.name, exact: true })).toBeVisible();
  await member.clock.pauseAt(new Date(Date.now() + 1000));
  const submitted = await (
    await member.request.post('/api/v2/seasons', {
      headers: { Origin: appOrigin(), Cookie: '__Host-dashboard_session=browser-user-4444' },
      data: {
        action: 'submit',
        seasonId: draft.id,
        challengeId: 'solo-contribution',
        text: 'An independently verified contribution for our shared milestone.',
        links: [],
        requestId: randomUUID(),
      },
    })
  ).json();
  const submission = submitted.progress.submissions[0];
  await adminAction(page, {
    action: 'review',
    seasonId: draft.id,
    owner: submission.owner,
    submissionId: submission.id,
    approve: true,
    note: 'Reviewed by a separate administrator.',
  });
  // Fast-forward only this browser's timers; the API continues using real server dates.
  await member.clock.runFor(15010);
  await expect(member.getByText('✦ Shared achievement unlocked', { exact: true })).toBeVisible();
  const confirmed = (await (
    await member.request.get(`/api/v2/seasons/${draft.id}/community`)
  ).json()) as CommunityUpdate;
  expect(JSON.stringify(confirmed)).not.toContain(submission.owner);
  expect(confirmed).not.toHaveProperty('progress');
  let reads = 0;
  await member.route(`**/api/v2/seasons/${draft.id}/community`, async (route) => {
    reads++;
    await route.fulfill({ status: 503, json: { error: 'Fixture outage' } });
  });
  await member.clock.runFor(15010);
  await expect(member.getByText(/Live progress delayed/)).toBeVisible();
  await expect(member.getByText('1 / 1 approved challenges', { exact: true })).toBeVisible();
  const failedReads = reads;
  await member.clock.runFor(20000);
  expect(reads).toBe(failedReads);
  await member.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, value: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await member.clock.runFor(120000);
  expect(reads).toBe(failedReads);
  await member.unroute(`**/api/v2/seasons/${draft.id}/community`);
  await member.route(`**/api/v2/seasons/${draft.id}/community`, (route) =>
    route.fulfill({ json: { ...confirmed, totals: { ...confirmed.totals, version: 0, completions: 0 } } }),
  );
  await member.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, value: false });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect(member.getByText(/Community progress is live/)).toBeVisible();
  await expect(member.getByText('1 / 1 approved challenges', { exact: true })).toBeVisible();
  await adminAction(page, {
    action: 'transition',
    seasonId: draft.id,
    revision: published.season.revision,
    transition: 'end',
    confirmation: draft.definition.name,
  });
  await context.close();
});

test('reward navigation, dialogs, filters and long-text layouts meet mobile/Safari accessibility checks', async ({
  page,
}, info) => {
  test.setTimeout(60000);
  const draft = await seed(page);
  await adminAction(page, {
    action: 'transition',
    seasonId: draft.id,
    revision: draft.revision,
    transition: 'publish',
    confirmation: draft.definition.name,
  });
  await page.context().setExtraHTTPHeaders({ Cookie: memberCookie });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(`/seasons?season=${draft.id}`);
  await expect(page.getByRole('heading', { name: draft.definition.name, exact: true })).toBeVisible();
  await accessible(page);
  const track = page.getByRole('region', { name: /Reward track/ });
  const first = track.getByRole('button', { name: /Wayfarer/ });
  if (info.project.use.hasTouch) await first.tap();
  else await first.click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await accessible(page);
  for (let i = 0; i < 6; i++) {
    await page.keyboard.press('Tab');
    expect(await page.getByRole('dialog').evaluate((dialog) => dialog.contains(document.activeElement))).toBe(true);
  }
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(first).toBeFocused();
  const before = await track.evaluate((element) => element.scrollLeft);
  await page.getByRole('button', { name: 'Next rewards', exact: true }).click();
  if (await track.evaluate((element) => element.scrollWidth > element.clientWidth))
    expect(await track.evaluate((element) => element.scrollLeft)).toBeGreaterThan(before);
  await page.getByLabel('Path', { exact: true }).selectOption('solo');
  await page.getByRole('button', { name: 'Submit evidence', exact: true }).click();
  await accessible(page);
  await page
    .getByLabel('Description', { exact: true })
    .fill('Long evidence with clear descriptions and keyboard-accessible controls. '.repeat(10));
  await accessible(page);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Submit evidence', exact: true })).toBeFocused();
  const targets = await page
    .locator('.season-button:visible')
    .evaluateAll((buttons) => buttons.map((button) => button.getBoundingClientRect().height));
  expect(targets.every((height) => height >= 44)).toBe(true);
  await page.screenshot({ path: info.outputPath(`season-${info.project.name}-accessible.png`), fullPage: true });
  await page.context().setExtraHTTPHeaders({ Cookie: adminCookie });
  const current = (await (await page.request.get(`/api/v2/admin/seasons?season=${draft.id}`)).json()).season as Season;
  await adminAction(page, {
    action: 'transition',
    seasonId: draft.id,
    revision: current.revision,
    transition: 'end',
    confirmation: current.definition.name,
  });
});

test('upload and live endpoints reject unauthenticated access, disguised scripts, stale writes and forged rule edits', async ({
  page,
}) => {
  const draft = await seed(page);
  const endpoint = `/api/v2/admin/seasons/artwork?season=${draft.id}&revision=${draft.revision}`;
  const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
  const disguised = await page.request.post(endpoint, {
    headers: { Origin: appOrigin(), 'Content-Type': 'image/png' },
    data: svg,
  });
  expect(disguised.status()).toBe(400);
  await page.context().setExtraHTTPHeaders({ Cookie: memberCookie });
  expect((await page.request.post(endpoint, { headers: { Origin: appOrigin() }, data: svg })).status()).toBe(403);
  expect((await page.request.get(`/api/v2/seasons/${draft.id}/community`)).status()).toBe(404);
  await page.context().setExtraHTTPHeaders({});
  expect((await page.request.get(`/api/v2/seasons/${draft.id}/community`)).status()).toBe(401);
  await page.context().setExtraHTTPHeaders({ Cookie: adminCookie });
  const published = await adminAction(page, {
    action: 'transition',
    seasonId: draft.id,
    revision: draft.revision,
    transition: 'publish',
    confirmation: draft.definition.name,
  });
  const forged = await page.request.post('/api/v2/admin/seasons', {
    headers: { Origin: appOrigin() },
    data: {
      action: 'presentation',
      seasonId: draft.id,
      revision: published.season.revision,
      presentation: {
        subtitle: draft.definition.subtitle,
        description: draft.definition.description,
        theme: 'dunes',
        rewards: [],
      },
      reason: 'Forbidden changes must not alter the published track.',
      confirmation: draft.definition.name,
    },
  });
  expect(forged.status()).toBe(400);
  expect((await (await page.request.get('/api/v2/admin/seasons')).json()).deliveryEnabled).toBe(false);
  expect(
    (
      await page.request.post('/api/v2/admin/seasons', {
        headers: { Origin: appOrigin() },
        data: { action: 'delivery-execute', seasonId: draft.id },
      })
    ).status(),
  ).toBe(400);
  await adminAction(page, {
    action: 'transition',
    seasonId: draft.id,
    revision: published.season.revision,
    transition: 'end',
    confirmation: draft.definition.name,
  });
});
