import { test, expect } from '../helpers/browser-test';
import { player } from '../helpers/portal-browser';
import type { Locator } from '@playwright/test';

test('private base import is under My bases without community tabs', async ({ page }) => {
  await page.goto('/portal?view=bases');
  await expect(page.getByRole('link', { name: 'Solido', exact: true })).toHaveCount(0);

  await expect(page.getByLabel('Upload JSON')).toBeVisible();
  await page.screenshot({ path: 'test-results/base-import-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByLabel('Upload JSON')).toBeVisible();
  await page.screenshot({ path: 'test-results/base-import-mobile.png', fullPage: true });
});

test('base upload is always visible below the last holdings card', async ({ page }) => {
  await page.goto('/portal?view=bases');
  const upload = page.getByLabel('Upload JSON');
  await expect(upload).toBeVisible();
  const last = await page.locator('.base-grid > div').last().boundingBox();
  const form = await page.getByRole('heading', { name: 'Import Blueprint', exact: true }).boundingBox();
  expect(form!.y).toBeGreaterThan(last!.y + last!.height + 20);
  const action = await page.getByRole('button', { name: 'Import to my character', exact: true }).boundingBox();
  const input = await upload.boundingBox();
  expect(input!.y).toBeGreaterThan(action!.y + action!.height);
  await page.screenshot({ path: 'test-results/release-bases-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(upload).toBeVisible();
  await page.screenshot({ path: 'test-results/release-bases-mobile.png', fullPage: true });
});

test('blueprint upload rejects invalid files before sending an import', async ({ page }) => {
  let imports = 0;
  await page.route('**/api/bases/import', (route) => {
    imports++;
    return route.fulfill({ status: 500, json: { error: 'Unexpected call' } });
  });
  await page.goto('/portal?view=bases');
  const upload = page.getByLabel('Upload JSON');
  await upload.setInputFiles({ name: 'invalid.json', mimeType: 'application/json', buffer: Buffer.from('{}') });
  await expect(page.getByRole('status')).toContainText('Invalid blueprint JSON');
  await expect(page.getByRole('button', { name: 'Import to my character', exact: true })).toBeDisabled();
  await upload.setInputFiles({
    name: 'oversized.json',
    mimeType: 'application/json',
    buffer: Buffer.alloc(512 * 1024 + 1, ' '),
  });
  await expect(page.getByRole('status')).toContainText('Invalid blueprint JSON');
  expect(imports).toBe(0);
});

test('blueprint import handles uncertain delivery and success without duplicate requests', async ({ page }) => {
  const requests: Array<{ requestId: string; blueprint: unknown }> = [];
  await page.route('**/api/bases/import', async (route) => {
    requests.push(route.request().postDataJSON());
    await route.fulfill(
      requests.length === 1
        ? { status: 502, json: { error: 'fixture-private-provider-error' } }
        : { json: { record: { status: 'imported', message: 'Blueprint delivered to your backpack.' } } },
    );
  });
  await page.goto('/portal?view=bases');
  await page.getByLabel('Upload JSON').setInputFiles({
    name: 'test-base.json',
    mimeType: 'application/json',
    buffer: Buffer.from(
      JSON.stringify({
        instances: [{ instance_id: 1, building_type: 'Atreides_Outpost_Foundation', x: 0, y: 0, z: 0, rotation: 0 }],
      }),
    ),
  });
  await expect(page.getByText('1 building pieces · 0 placeables')).toBeVisible();
  const action = page.getByRole('button', { name: 'Import to my character', exact: true });
  await expect(action).toBeDisabled();
  const choose = page.getByRole('button', { name: 'Use this front and picture', exact: true });
  await expect(choose).toBeEnabled({ timeout: 30000 });
  await choose.click();
  await action.click();
  await expect(page.getByRole('status').filter({ hasText: 'Import could not be confirmed' })).toBeVisible();
  await expect(page.getByText('fixture-private-provider-error')).toHaveCount(0);
  expect(requests).toHaveLength(1);
  await action.click();
  await expect(page.getByText('Blueprint delivered to your backpack.', { exact: true })).toBeVisible();
  await expect(action).toBeDisabled();
  expect(requests).toHaveLength(2);
  expect(requests[1].requestId).toBe(requests[0].requestId);
});

for (const disbandFlow of [false, true]) {
  test(`guild leader ${disbandFlow ? 'confirms disbanding' : 'manages member ranks and leadership'}`, async ({
    page,
  }) => {
    let disbanded = false;
    let members = [
      { player_id: 'tester', character_name: 'Desert Navigator', role_id: '100' },
      { player_id: '7', character_name: 'Builder', role_id: '1' },
      { player_id: '8', character_name: 'Navigator', role_id: '50' },
    ];
    const writes: { method: string; path: string; body: Record<string, unknown> }[] = [];
    await page.route('**/api/player', (route) =>
      route.fulfill({
        json: {
          ...player,
          details: { ...player.details, guild: disbanded ? null : { id: '2', name: 'Crimson Skies' } },
        },
      }),
    );
    await page.route('**/api/guilds?*', (route) =>
      route.fulfill({
        json: {
          ok: true,
          data: {
            rows: disbanded ? [] : [{ guild_id: '2', guild_name: 'Crimson Skies', member_count: members.length }],
          },
        },
      }),
    );
    await page.route('**/api/guilds/2/logo', (route) => route.fulfill({ json: { ok: true, data: { logo: null } } }));
    await page.route('**/api/guilds/2/requirements', (route) => route.fulfill({ json: { ok: true, data: null } }));
    await page.route(/\/api\/guilds\/2(?:\/members(?:\/[^/]+(?:\/(?:promote|demote))?)?)?$/, async (route) => {
      const method = route.request().method();
      const path = new URL(route.request().url()).pathname;
      if (method === 'GET') {
        await route.fulfill({
          json: {
            ok: true,
            canEdit: !disbanded && members.some((member) => member.player_id === 'tester' && member.role_id === '100'),
            data: { rows: members },
          },
        });
        return;
      }
      const body = route.request().postDataJSON();
      writes.push({ method, path, body });
      if (path === '/api/guilds/2') {
        disbanded = true;
        members = [];
      } else if (path === '/api/guilds/2/members')
        members.push({ player_id: body.playerId, character_name: 'New recruit', role_id: String(body.roleId) });
      else {
        const id = path.split('/')[5];
        const target = members.find((member) => member.player_id === id)!;
        if (method === 'DELETE') members = members.filter((member) => member.player_id !== id);
        else if (path.endsWith('/demote')) target.role_id = '1';
        else if (target.role_id === '1') target.role_id = '50';
        else {
          members.forEach((member) => {
            if (member.role_id === '100') member.role_id = '50';
          });
          target.role_id = '100';
        }
      }
      await route.fulfill({
        json: { ok: true, data: { relogRequired: path.endsWith('/promote') || path.endsWith('/demote') } },
      });
    });
    await page.goto('/portal?view=guild');
    const dialog = page.getByRole('dialog');
    if (disbandFlow) {
      await page
        .getByRole('navigation', { name: 'Guild tabs' })
        .getByRole('button', { name: 'Settings', exact: true })
        .click();
      await page.getByRole('button', { name: 'Disband guild', exact: true }).click();
      await expect(dialog.getByRole('button', { name: 'Permanently disband guild', exact: true })).toBeDisabled();
      await dialog.getByRole('textbox', { name: 'Type DISBAND GUILD to confirm', exact: true }).fill('yes');
      await expect(dialog.getByRole('button', { name: 'Permanently disband guild', exact: true })).toBeDisabled();
      await dialog.press('Escape');
      expect(writes).toHaveLength(0);
      await page.getByRole('button', { name: 'Disband guild', exact: true }).click();
      await dialog.getByRole('textbox', { name: 'Type DISBAND GUILD to confirm', exact: true }).fill('DISBAND GUILD');
      await dialog.getByRole('button', { name: 'Permanently disband guild', exact: true }).click();
      await expect(page.getByText('Guild disbanded.', { exact: true })).toBeVisible();
      await expect(
        page.getByRole('navigation', { name: 'Guild tabs' }).getByRole('button', { name: 'Settings', exact: true }),
      ).toHaveCount(0);
      expect(writes[0]).toMatchObject({ method: 'DELETE', body: { confirmation: 'DISBAND GUILD' } });
    } else {
      await page.getByRole('button', { name: 'Manage Builder', exact: true }).click();
      await dialog.getByRole('button', { name: 'Promote to Officer', exact: true }).click();
      await expect(
        page.getByRole('list', { name: 'Officer members', exact: true }).getByText('Builder', { exact: true }),
      ).toBeVisible();
      await page.getByRole('button', { name: 'Manage Builder', exact: true }).click();
      await dialog.getByRole('button', { name: 'Demote to Member', exact: true }).click();
      await expect(
        page.getByRole('list', { name: 'Member members', exact: true }).getByText('Builder', { exact: true }),
      ).toBeVisible();
      await page.getByRole('button', { name: 'Manage Builder', exact: true }).click();
      await dialog.getByRole('button', { name: 'Remove from guild', exact: true }).click();
      await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
      expect(writes.filter((write) => write.method === 'DELETE')).toHaveLength(0);
      await page.getByRole('button', { name: 'Manage Builder', exact: true }).click();
      await dialog.getByRole('button', { name: 'Remove from guild', exact: true }).click();
      await dialog.getByRole('button', { name: 'Confirm removal', exact: true }).click();
      await expect(page.getByRole('button', { name: 'Manage Builder', exact: true })).toHaveCount(0);
      await page.getByRole('button', { name: 'Add member', exact: true }).click();
      await dialog.getByRole('textbox', { name: 'Player ID', exact: true }).fill('new-member');
      await dialog.getByRole('combobox', { name: 'Starting rank', exact: true }).selectOption('50');
      await dialog.getByRole('button', { name: 'Add member', exact: true }).click();
      await expect(page.getByRole('button', { name: 'Manage New recruit', exact: true })).toBeVisible();
      await page.getByRole('button', { name: 'Manage Navigator', exact: true }).click();
      await dialog.getByRole('button', { name: 'Transfer leadership', exact: true }).click();
      await expect(dialog).toContainText('lose access to leader controls');
      await page.setViewportSize({ width: 390, height: 844 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await dialog.getByRole('button', { name: 'Confirm leadership transfer', exact: true }).click();
      await expect(page.getByRole('button', { name: 'Add member', exact: true })).toHaveCount(0);
      expect(writes.at(-1)?.body.confirmation).toBe('TRANSFER LEADERSHIP');
      await expect(
        page.getByRole('list', { name: 'Leader members', exact: true }).getByText('Navigator', { exact: true }),
      ).toBeVisible();
    }
  });
}

test('owned bases publish to the marketplace and open 3D listing previews', async ({ page }) => {
  const id = 'a'.repeat(24);
  const summary = {
    id,
    title: 'Shared Outpost',
    author: 'Desert Navigator',
    baseType: 'Advanced Sub-Fief',
    map: 'Hagga Basin',
    pieceCount: 2,
    placeableCount: 1,
    publishedAt: '2026-10-27T12:00:00.000Z',
    previewRevision: 'd'.repeat(24),
  };
  const record = {
    summary,
    layout: {
      name: 'Shared Outpost',
      base_type: 'Advanced Sub-Fief',
      map: 'Hagga Basin',
      instances: [{ building_type: 'Atreides_Outpost_Foundation', x: 0, y: 0, z: 0, rotation: 0 }],
      placeables: [{ building_type: 'Atre_Chair_1_Placeable', x: 0, y: 0, z: 384, ry: 90 }],
      pentashields: [],
    },
  };
  await page.route('**/api/bases/0/marketplace', (route) => route.fulfill({ json: { ok: true, listing: summary } }));
  await page.route('**/api/base-marketplace', (route) =>
    route.fulfill({ json: { ok: true, listings: [summary], total: 1 } }),
  );
  let picture = '';
  await page.route('**/api/bases/0/export', (route) => route.fulfill({ json: record.layout }));
  await page.route('**/api/bases/0/preview', (route) => {
    if (route.request().method() === 'POST') picture = route.request().postDataJSON().image;
    return route.fulfill({ json: { ok: true, view: null, hasPicture: Boolean(picture) } });
  });
  await page.route(`**/api/base-marketplace/${id}*`, (route) =>
    new URL(route.request().url()).searchParams.get('image') === '1'
      ? route.fulfill({ contentType: 'image/png', body: Buffer.from(picture.split(',')[1], 'base64') })
      : route.fulfill({ json: record }),
  );
  let imports = 0;
  await page.route('**/api/bases/import', (route) => {
    imports++;
    const body = route.request().postDataJSON();
    expect(body.title).toBe(summary.title);
    expect(body.blueprint.instances[0].instance_id).toBe(0);
    expect(body.blueprint.placeables[0].ry).toBe(90);
    expect(body.blueprint).not.toHaveProperty('owner_name');
    return route.fulfill({
      json: { ok: true, record: { status: 'imported', message: 'Delivered to your backpack as a Solido tool.' } },
    });
  });
  await page.goto('/portal?view=bases');
  const base = page.locator('article').filter({ hasText: 'Stronghold 1' });
  await base.getByRole('button', { name: 'Share Base', exact: true }).click();
  await expect(base.getByRole('heading', { name: 'Choose the front of your base' })).toBeVisible();
  await expect(base.getByRole('button', { name: 'Publish base with this picture', exact: true })).toBeDisabled();
  await expect(base.getByRole('button', { name: 'Use this front and picture', exact: true })).toBeEnabled({
    timeout: 30000,
  });
  await base.getByRole('button', { name: 'Use this front and picture', exact: true }).click();
  await base.getByRole('button', { name: 'Publish base with this picture', exact: true }).click();
  await base.getByRole('link', { name: 'View listing ↗' }).click();
  await expect(page.getByRole('heading', { name: 'Base Marketplace', exact: true }).first()).toBeVisible();
  await expect(page.getByText('Shared Outpost', { exact: true })).toBeVisible();
  await page.getByLabel('Search by base or author').fill('nobody');
  await expect(page.getByText('No matching bases', { exact: true })).toBeVisible();
  await page.getByLabel('Search by base or author').fill('Desert Navigator');
  await expect(page.getByText('Shared Outpost', { exact: true })).toBeVisible();
  await page.getByLabel('Base size').selectOption('large');
  await expect(page.getByText('No matching bases', { exact: true })).toBeVisible();
  await page.getByLabel('Base size').selectOption('small');
  await page.locator('article').filter({ hasText: 'Shared Outpost' }).scrollIntoViewIfNeeded();
  await expect(page.getByRole('img', { name: 'Shared Outpost front picture' })).toBeVisible({ timeout: 30000 });
  await page.screenshot({ path: 'test-results/base-marketplace.png', fullPage: true });
  await page.getByRole('button', { name: 'Import to my character', exact: true }).click();
  await expect(page.getByText('Delivered to your backpack as a Solido tool.', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Import submitted', exact: true })).toBeDisabled();
  expect(imports).toBe(1);
  await page.getByRole('button', { name: 'Inspect base', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Shared Outpost shared base', exact: true });
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('[data-base-preview-state]')).toHaveAttribute('data-base-preview-state', 'ready', {
    timeout: 30000,
  });
  await expect(dialog.locator('canvas')).toHaveCount(1);
  await expect(dialog.getByRole('link', { name: 'Download layout ↓' })).toHaveAttribute(
    'href',
    `/api/base-marketplace/${id}?download=1`,
  );
  await page.screenshot({ path: 'test-results/base-marketplace-preview.png' });
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
});

/** Full-screen previews collapse the secondary camera and picture controls by default. */
async function openPreviewControls(preview: Locator) {
  const controls = preview
    .locator('details')
    .filter({ has: preview.page().getByText('More preview controls', { exact: true }) });
  if (!(await controls.evaluate((element: HTMLDetailsElement) => element.open)))
    await controls.getByText('More preview controls', { exact: true }).click();
}

test('Bases loads owned 3D previews on demand and disposes them when switching bases', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (/THREE.WebGLProgram|shader error|THREE.WebGLRenderer: Texture/i.test(message.text()))
      errors.push(message.text());
  });
  let exports = 0;
  await page.route('**/api/bases/*/export', (route) => {
    exports++;
    return route.fulfill({
      json: {
        x: 500000,
        y: 200000,
        z: 3000,
        instances: [
          ...Array.from({ length: 9 }, (_, index) => ({
            building_type: 'Atreides_Outpost_Foundation',
            x: ((index % 3) - 1) * 512,
            y: (Math.floor(index / 3) - 1) * 512,
            z: 0,
            rotation: 0,
          })),
          { building_type: 'Atreides_Outpost_Wall_01', x: 0, y: 768, z: 384, rotation: 180 },
          { building_type: 'Future_Unsupported_Piece', x: 0, y: 0, z: 0 },
        ],
        placeables: [
          { building_type: 'Atre_Chair_1_Placeable', x: 0, y: 0, z: 384, ry: 90 },
          { building_type: 'Atreides_DoorTall_Placeable', x: 300, y: 0, z: 384 },
        ],
      },
    });
  });
  await page.goto('/portal?view=bases');
  await expect(page.getByRole('button', { name: 'Open full-screen preview' })).toBeVisible();
  expect(exports).toBe(0);
  await expect(page.locator('canvas')).toHaveCount(0);
  await page.getByRole('button', { name: 'Open full-screen preview' }).click();
  const preview = page.getByRole('region', { name: '3D base preview', exact: true });
  await expect(preview.locator('[data-base-preview-state]')).toHaveAttribute('data-base-preview-state', 'partial', {
    timeout: 30000,
  });
  expect(exports).toBe(1);
  await expect(preview.locator('canvas')).toHaveCount(1);
  await openPreviewControls(preview);
  await preview.getByRole('button', { name: 'Top view', exact: true }).click();
  await preview.getByRole('combobox', { name: 'Base for 3D preview' }).selectOption('1');
  await expect(preview.locator('canvas')).toHaveCount(0);
  await preview.getByRole('button', { name: 'Load 3D preview', exact: true }).click();
  await expect(preview.locator('[data-base-preview-state]')).toHaveAttribute('data-base-preview-state', 'partial', {
    timeout: 30000,
  });
  expect(exports).toBe(2);
  await preview.getByRole('button', { name: 'Close preview', exact: true }).click();
  await expect(preview.locator('canvas')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('old marketplace listings require an owner picture without generating a thumbnail', async ({ page }) => {
  const summary = {
    id: 'e'.repeat(24),
    title: 'Old base',
    author: 'Owner',
    baseType: 'Sub-Fief',
    map: 'Hagga Basin',
    pieceCount: 1,
    placeableCount: 0,
    publishedAt: '2026-10-27T12:00:00.000Z',
  };
  let modelReads = 0;
  await page.route('**/api/base-marketplace', (route) =>
    route.fulfill({ json: { ok: true, listings: [summary], total: 1 } }),
  );
  await page.route(`**/api/base-marketplace/${summary.id}*`, (route) => {
    modelReads++;
    return route.abort();
  });
  await page.goto('/portal?view=base-market');
  await expect(
    page.getByText('Picture required — the owner must choose a front and take a picture in My bases.', { exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Import to my character', exact: true })).toHaveCount(0);
  await expect(page.locator('canvas')).toHaveCount(0);
  expect(modelReads).toBe(0);
  await expect(page.getByRole('button', { name: 'Change picture', exact: true })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'My bases', exact: true }).last()).toHaveAttribute(
    'href',
    '/portal?view=bases',
  );
});

test('owners replace an old marketplace picture without publishing or uploading the base again', async ({ page }) => {
  const id = 'f'.repeat(24);
  const revision = 'd'.repeat(24);
  const summary = {
    id,
    editableBaseId: '0',
    title: 'Existing fortress',
    author: 'Owner',
    baseType: 'Sub-Fief',
    map: 'Hagga Basin',
    pieceCount: 1,
    placeableCount: 0,
    publishedAt: '2026-10-27T12:00:00.000Z',
  };
  const layout = { instances: [{ building_type: 'Atreides_Outpost_Foundation', x: 0, y: 0, z: 0 }], placeables: [] };
  let image = '';
  let saves = 0;
  let uploads = 0;
  await page.route('**/api/base-marketplace', (route) =>
    route.fulfill({ json: { ok: true, listings: [summary], total: 1 } }),
  );
  await page.route(`**/api/base-marketplace/${id}*`, (route) =>
    new URL(route.request().url()).searchParams.get('image') === '1'
      ? route.fulfill({ contentType: 'image/png', body: Buffer.from(image.split(',')[1], 'base64') })
      : route.fulfill({ json: { summary, layout } }),
  );
  await page.route('**/api/bases/0/marketplace', (route) => {
    uploads++;
    return route.abort();
  });
  await page.route('**/api/bases/import', (route) => {
    uploads++;
    return route.abort();
  });
  await page.route('**/api/bases/0/export', (route) => {
    uploads++;
    return route.abort();
  });
  await page.route('**/api/bases/0/preview', (route) => {
    expect(route.request().method()).toBe('POST');
    const body = route.request().postDataJSON();
    expect(body.view.facing).toBe(91);
    image = body.image;
    saves++;
    return saves === 1
      ? route.fulfill({ status: 403, json: { error: 'Not authorized' } })
      : route.fulfill({ json: { ok: true, revision } });
  });
  await page.goto('/portal?view=base-market');
  await page.getByRole('button', { name: 'Change picture', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Existing fortress change picture', exact: true });
  const save = dialog.getByRole('button', { name: 'Save picture', exact: true });
  await expect(save).toBeDisabled();
  await expect(dialog.getByRole('button', { name: 'Use this front and picture', exact: true })).toBeEnabled({
    timeout: 30000,
  });
  await dialog.getByLabel('Base facing degrees').fill('91');
  await dialog.getByRole('button', { name: 'Level front view', exact: true }).click();
  await dialog.getByRole('button', { name: 'Use this front and picture', exact: true }).click();
  await save.click();
  await expect(dialog.getByRole('alert')).toHaveText('Could not save the picture. Please try again.');
  await save.click();
  await expect(dialog).toHaveCount(0);
  const picture = page.getByRole('img', { name: 'Existing fortress front picture', exact: true });
  await expect(picture).toHaveAttribute('src', `/api/base-marketplace/${id}?image=1&v=${revision}`);
  await expect.poll(() => picture.evaluate((element: HTMLImageElement) => element.naturalWidth)).toBe(640);
  await expect(page.locator('time')).toHaveAttribute('datetime', summary.publishedAt);
  expect(uploads).toBe(0);
  expect(saves).toBe(2);
  await expect(page.getByRole('button', { name: 'Import to my character', exact: true })).toBeVisible();
  await page.screenshot({ path: 'test-results/marketplace-change-picture.png', fullPage: true });
});

test('saved front pictures survive reload and marketplace cards skip 3D downloads', async ({ page }) => {
  const id = 'b'.repeat(24);
  let saved: { view: { facing: number }; image: string } | null = null;
  let modelReads = 0;
  const layout = {
    instances: [
      { building_type: 'Atreides_Outpost_Foundation', x: -1024, y: 0, z: 0 },
      { building_type: 'Atreides_Outpost_Foundation', x: 1024, y: 0, z: 0 },
      { building_type: 'Atreides_Outpost_Wall_01', x: 1024, y: 0, z: 384 },
    ],
    placeables: [],
  };
  await page.route('**/api/bases/*/export', (route) => route.fulfill({ json: layout }));
  await page.route('**/api/bases/*/preview', (route) => {
    if (route.request().method() === 'POST') saved = route.request().postDataJSON();
    return route.fulfill({ json: { ok: true, view: saved?.view ?? null } });
  });
  await page.goto('/portal?view=bases');
  await page.getByRole('button', { name: 'Open full-screen preview' }).click();
  const preview = page.getByRole('region', { name: '3D base preview', exact: true });
  await openPreviewControls(preview);
  await expect(preview.getByRole('button', { name: 'Take picture & save front', exact: true })).toBeEnabled({
    timeout: 30000,
  });
  await preview.getByLabel('Base facing degrees').fill('73');
  await preview.getByRole('button', { name: 'Fit whole base', exact: true }).click();
  await preview.getByRole('button', { name: 'Take picture & save front', exact: true }).click();
  await expect(
    preview.getByText('Front and picture saved for this base. Shared cards will use this picture.', { exact: true }),
  ).toBeVisible();
  expect(saved?.view.facing).toBe(73);
  expect(saved?.image).toMatch(/^data:image\/png;base64,/);
  await preview.getByRole('button', { name: 'Reload preview', exact: true }).click();
  await openPreviewControls(preview);
  await expect(preview.getByLabel('Base facing degrees')).toHaveValue('73', { timeout: 30000 });
  await page.screenshot({ path: 'test-results/saved-base-front.png', fullPage: true });
  const summary = {
    id,
    title: 'Photographed base',
    author: 'Owner',
    baseType: 'Sub-Fief',
    map: 'Hagga Basin',
    pieceCount: 3,
    placeableCount: 0,
    publishedAt: '2026-10-27T12:00:00.000Z',
    previewRevision: 'c'.repeat(24),
  };
  await page.route('**/api/base-marketplace', (route) =>
    route.fulfill({ json: { ok: true, listings: [summary], total: 1 } }),
  );
  await page.route(`**/api/base-marketplace/${id}*`, (route) => {
    if (new URL(route.request().url()).searchParams.get('image') === '1')
      return route.fulfill({ contentType: 'image/png', body: Buffer.from(saved!.image.split(',')[1], 'base64') });
    modelReads++;
    return route.fulfill({ json: { summary, layout } });
  });
  await page.goto('/portal?view=base-market');
  const image = page.getByRole('img', { name: 'Photographed base front picture' });
  await expect(image).toBeVisible();
  await expect
    .poll(() => image.evaluate((element: HTMLImageElement) => [element.naturalWidth, element.naturalHeight]))
    .toEqual([640, 360]);
  expect(modelReads).toBe(0);
  await expect(page.locator('canvas')).toHaveCount(0);
  await page.screenshot({ path: 'test-results/saved-base-marketplace.png', fullPage: true });
});

test('base preview hides private export errors and recovers on reload', async ({ page }) => {
  let denied = true;
  let exports = 0;
  await page.route('**/api/bases/*/export', (route) => {
    exports++;
    return denied
      ? route.fulfill({ status: 403, json: { error: 'private provider information' } })
      : route.fulfill({
          json: { instances: [{ building_type: 'Atreides_Outpost_Foundation', x: 0, y: 0, z: 0 }], placeables: [] },
        });
  });
  await page.goto('/portal?view=bases');
  await page.getByRole('button', { name: 'Open full-screen preview' }).click();
  const preview = page.getByRole('region', { name: '3D base preview', exact: true });
  await expect(preview.getByText('This base is not available to your account.')).toBeVisible();
  expect(exports).toBe(1);
  await expect(preview.getByText('private provider information')).toHaveCount(0);
  denied = false;
  await preview.getByRole('button', { name: 'Reload preview', exact: true }).click();
  await expect(preview.locator('[data-base-preview-state]')).toHaveAttribute('data-base-preview-state', 'ready', {
    timeout: 30000,
  });
  expect(exports).toBe(2);
  await expect(preview.locator('canvas')).toHaveCount(1);
});

test('base storage matches the dark workspace and keeps long container lists usable', async ({ page }) => {
  const containers = Array.from({ length: 26 }, (_, index) => ({
    placeableId: String(index),
    name: `Container ${index + 1}`,
    typeName: index < 7 ? 'Storage Container' : 'Chest',
    usedSlots: index === 1 ? 15 : 0,
    maxSlots: 45,
    itemCount: index === 1 ? 15 : 0,
    items:
      index === 1
        ? Array.from({ length: 15 }, (_, item) => ({
            templateId: `spice_${item}`,
            name: `Spice stack ${item + 1}`,
            quantity: 20,
          }))
        : [],
  }));
  await page.route('**/api/player', (route) =>
    route.fulfill({
      json: {
        ...player,
        details: {
          ...player.details,
          bases: { rows: [{ ...player.details.bases.rows[0], inventory: { containers } }] },
        },
      },
    }),
  );
  await page.setViewportSize({ width: 1446, height: 1030 });
  await page.goto('/portal?view=bases&theme=default');
  const card = page.locator('.base-grid [role="button"]').first();
  await card.click();
  const dialog = page.getByRole('dialog', { name: 'Stronghold 1 storage', exact: true });
  const sidebar = dialog.getByRole('complementary', { name: 'Base storage containers' });
  await expect(dialog.getByRole('heading', { name: 'This container is empty' })).toBeVisible();
  expect(await dialog.evaluate((element) => getComputedStyle(element).backgroundImage)).toBe('none');
  await expect(sidebar.getByText('Containers page 1 of 3')).toBeVisible();
  await dialog.focus();
  await page.keyboard.press('Tab');
  await expect(dialog.getByRole('button', { name: 'Close base storage' })).toBeFocused();
  await page.screenshot({ path: 'test-results/base-storage-desktop.png' });
  await sidebar.getByRole('button', { name: /^Container 2 / }).click();
  await expect(dialog.getByRole('list', { name: 'Container items' }).getByRole('listitem')).toHaveCount(12);
  await dialog.getByRole('button', { name: 'Next items page' }).click();
  await expect(dialog.getByRole('list', { name: 'Container items' }).getByRole('listitem')).toHaveCount(3);
  await dialog.getByRole('textbox', { name: 'Search items' }).fill('nothing-found');
  await expect(dialog.getByRole('heading', { name: 'No matching items' })).toBeVisible();
  await dialog.getByRole('button', { name: 'Clear search' }).click();
  await expect(dialog.getByRole('listitem')).toHaveCount(12);
  await page.setViewportSize({ width: 390, height: 844 });
  const nextContainers = sidebar.getByRole('button', { name: 'Next containers page' });
  await nextContainers.click();
  await nextContainers.click();
  await expect(sidebar.getByText('Containers page 3 of 3')).toBeVisible();
  await sidebar.getByRole('button', { name: /^Container 26 / }).click();
  await expect(
    dialog.getByRole('region', { name: 'Container contents' }).getByRole('heading', { name: 'Container 26' }),
  ).toBeVisible();
  await expect(dialog.getByRole('heading', { name: 'This container is empty' })).toBeVisible();
  expect(await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
  const box = await dialog.boundingBox();
  expect(box!.y + box!.height).toBeLessThanOrEqual(844);
  const pager = await sidebar.getByRole('navigation').boundingBox();
  const side = await sidebar.boundingBox();
  expect(pager!.y + pager!.height).toBeLessThanOrEqual(side!.y + side!.height);
  await page.screenshot({ path: 'test-results/base-storage-mobile.png' });
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(card).toBeFocused();
  expect(await page.evaluate(() => document.body.style.overflow)).not.toBe('hidden');
});
