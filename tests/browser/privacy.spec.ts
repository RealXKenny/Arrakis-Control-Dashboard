import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { test, expect } from '../helpers/browser-test';
import { fakeConsole } from '../helpers/fake-console-client';
test.use({ hasTouch: true });
test.afterEach(async () => {
  await fakeConsole.reset();
});
const axeSource = readFileSync(createRequire(import.meta.url).resolve('axe-core/axe.min.js'), 'utf8');
async function setup(page: import('@playwright/test').Page) {
  const member = await fakeConsole.newMember('Privacy owner', { guild: null, linked: { linked: false } });
  await page.context().setExtraHTTPHeaders({ Cookie: member.cookie });
  await page.goto('/privacy');
  const center = page.getByRole('region', { name: 'Privacy center' });
  await expect(center.getByRole('status')).toContainText('Saved privacy settings loaded');
  return { center, member };
}
test('drafts stay private and member views require sign-in while published snapshots exclude later edits', async ({
  page,
  browser,
}) => {
  const { center, member } = await setup(page);
  await expect(center.getByText('Private', { exact: true })).toHaveCount(4);
  await center.getByRole('article', { name: 'Profile privacy' }).getByRole('button').click();
  await center.getByLabel('Shared display name').fill('Chosen profile');
  await center.getByLabel('About you').fill('Only this introduction');
  await center.getByRole('button', { name: 'Save private draft' }).click();
  let record = (await (await page.request.get('/api/v2/privacy')).json()).record;
  expect((await page.request.get(`/api/v2/privacy/shared/${record.shareId}`)).status()).toBe(404);
  await center.getByRole('article', { name: 'Profile privacy' }).getByRole('button').click();
  await center.getByRole('button', { name: 'Review publication' }).click();
  await expect(center.getByRole('heading', { name: 'Review profile publication' })).toBeFocused();
  expect((await page.request.get(`/api/v2/privacy/shared/${record.shareId}`)).status()).toBe(404);
  await center.getByRole('button', { name: 'Publish reviewed profile' }).click();
  await center
    .getByRole('article', { name: 'Profile privacy' })
    .getByRole('button', { name: 'Edit saved draft' })
    .click();
  await center.getByLabel('Shared display name').fill('Private replacement secret');
  await center.getByRole('button', { name: 'Save private draft' }).click();
  record = (await (await page.request.get('/api/v2/privacy')).json()).record;
  const viewer = await fakeConsole.newMember('Privacy viewer', { guild: null });
  await page.context().setExtraHTTPHeaders({ Cookie: viewer.cookie });
  const response = await page.request.get(`/api/v2/privacy/shared/${record.shareId}`);
  expect(response.status()).toBe(200);
  const text = JSON.stringify(await response.json());
  expect(text).toContain('Chosen profile');
  for (const secret of ['Private replacement secret', member.discordId, 'drafts', 'shareId'])
    expect(text).not.toContain(secret);
  await page.goto(`/sharing/${record.shareId}`);
  await expect(page.getByRole('article', { name: 'Shared profile' })).toContainText('Chosen profile');
  const anonymous = await browser.newContext();
  expect((await anonymous.request.get(`http://127.0.0.1:3100/api/v2/privacy/shared/${record.shareId}`)).status()).toBe(
    401,
  );
  await anonymous.close();
});
test('all four categories support publication, per-card unpublish, link replacement and revoke-all', async ({
  page,
}) => {
  const { center } = await setup(page);
  for (const category of ['Profile', 'Location', 'Crafting', 'Supply']) {
    await center
      .getByRole('article', { name: `${category} privacy` })
      .getByRole('button')
      .click();
    if (category === 'Profile') await center.getByLabel('Shared display name').fill('Community traveller');
    if (category === 'Location') await center.getByLabel('Location description').fill('Meet at the chosen north gate');
    if (category === 'Crafting') await center.getByLabel('Crafting specialties').fill('Tools\nArmour\n');
    if (category === 'Supply') {
      await center.getByRole('button', { name: 'Add supply' }).click();
      await center.getByLabel('Supply 1 item', { exact: true }).fill('Refined metal');
      await center.getByLabel('Supply 1 quantity').fill('9007199254740993');
      await center.getByLabel('Supply 1 unit').fill('units');
    }
    await center.getByRole('button', { name: 'Review publication' }).click();
    await center.getByRole('button', { name: `Publish reviewed ${category.toLowerCase()}` }).click();
  }
  let record = (await (await page.request.get('/api/v2/privacy')).json()).record;
  const oldId = record.shareId;
  let shared = await (await page.request.get(`/api/v2/privacy/shared/${oldId}`)).json();
  expect(shared.data.cards).toHaveLength(4);
  expect(JSON.stringify(shared)).toContain('9007199254740993');
  await center.getByRole('button', { name: 'Unpublish location' }).click();
  await expect(center.getByText('Card unpublished. Its saved draft stays private.', { exact: true })).toBeVisible();
  shared = await (await page.request.get(`/api/v2/privacy/shared/${oldId}`)).json();
  expect(shared.data.cards).toHaveLength(3);
  expect(JSON.stringify(shared)).not.toContain('chosen north gate');
  await center.getByRole('button', { name: 'Replace member link' }).click();
  await center.getByRole('button', { name: 'Confirm replace link' }).click();
  await expect(center.getByText('Member link replaced. Previous links no longer work.', { exact: true })).toBeVisible();
  record = (await (await page.request.get('/api/v2/privacy')).json()).record;
  expect(record.shareId).not.toBe(oldId);
  expect((await page.request.get(`/api/v2/privacy/shared/${oldId}`)).status()).toBe(404);
  expect((await page.request.get(`/api/v2/privacy/shared/${record.shareId}`)).status()).toBe(200);
  await center.getByRole('button', { name: 'Revoke all sharing' }).click();
  await expect(center.getByText('Private', { exact: true })).toHaveCount(4);
  expect((await page.request.get(`/api/v2/privacy/shared/${record.shareId}`)).status()).toBe(404);
  const current = (await (await page.request.get('/api/v2/privacy')).json()).record;
  expect(current.drafts.location.directions).toContain('chosen north gate');
});
test('conflicts and failed publication preserve drafts and never report a false revoke or success', async ({
  page,
}) => {
  const { center } = await setup(page);
  await center.getByRole('article', { name: 'Profile privacy' }).getByRole('button').click();
  await center.getByLabel('Shared display name').fill('Unsaved local profile');
  const saved = await page.request.post('/api/v2/privacy', {
    headers: { Origin: 'http://127.0.0.1:3100' },
    data: {
      action: 'save-draft',
      revision: null,
      card: { category: 'profile', data: { displayName: 'Other tab profile', about: '' } },
    },
  });
  expect(saved.status()).toBe(200);
  await center.getByRole('button', { name: 'Save private draft' }).click();
  await expect(center.getByRole('alert')).toContainText('another tab');
  await expect(center.getByLabel('Shared display name')).toHaveValue('Unsaved local profile');
  await center.getByRole('button', { name: 'Reload saved privacy settings' }).click();
  await center.getByRole('article', { name: 'Profile privacy' }).getByRole('button').click();
  await expect(center.getByLabel('Shared display name')).toHaveValue('Other tab profile');
  await center.getByRole('button', { name: 'Review publication' }).click();
  let writes = 0;
  await page.route('**/api/v2/privacy', async (route) => {
    writes++;
    await route.fulfill({ status: 503, json: { error: 'Private provider failure' } });
  });
  await center.getByRole('button', { name: 'Publish reviewed profile' }).click();
  await expect(center.getByRole('alert')).toContainText('last saved sharing may still be visible');
  await expect(center.getByRole('heading', { name: 'Review profile publication' })).toBeVisible();
  expect(writes).toBe(1);
});
test('privacy review works with keyboard/touch and passes responsive accessibility checks', async ({ page }, info) => {
  const { center } = await setup(page);
  await center.getByRole('article', { name: 'Profile privacy' }).getByRole('button').click();
  await center.getByLabel('Shared display name').fill('Desert builder');
  await page.keyboard.press('Tab');
  await expect(center.getByLabel('About you')).toBeFocused();
  await center.getByLabel('About you').fill('Helping other travellers build a home on Arrakis.');
  await center.getByRole('button', { name: 'Review publication' }).tap();
  await page.evaluate(axeSource);
  for (const width of [320, 393, 412, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    if (width === 320 || width === 1440) {
      const violations = await page.evaluate(async () => {
        const axe = (
          window as unknown as { axe: { run(doc: Document, options: object): Promise<{ violations: unknown[] }> } }
        ).axe;
        return (await axe.run(document, { runOnly: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'] })).violations;
      });
      expect(violations).toEqual([]);
    }
  }
  async function shot(name: string) {
    await page.evaluate(async () => {
      (document.activeElement as HTMLElement | null)?.blur();
      window.scrollTo({ top: 0, behavior: 'instant' });
      await document.fonts.ready;
      await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
    });
    await page.screenshot({ path: info.outputPath(name), fullPage: true, animations: 'disabled' });
  }
  await shot('privacy-desktop.png');
  await page.setViewportSize({ width: 393, height: 852 });
  await shot('privacy-mobile.png');
});
