import type { BrowserContext } from '@playwright/test';
import { expect, test } from '../helpers/browser-test';
import { fakeConsole, type TestMember } from '../helpers/fake-console-client';

/**
 * Bases: holdings, blueprint export/import and the community marketplace in the V2 interface. Ownership comes from
 * the fake Console; the marketplace's own storage (Redis Lua) is covered by the API tests, so these tests assert what
 * the browser shows and sends, and what the API refuses.
 */
const ORIGIN = 'http://127.0.0.1:3100';
const signInAs = (context: BrowserContext, member: TestMember) =>
  context.setExtraHTTPHeaders({ Cookie: member.cookie });
const layout = {
  name: 'Test Outpost',
  base_type: 'Outpost',
  instances: [{ instance_id: 1, building_type: 'BP_Wall_01', x: 0, y: 0, z: 0, rotation: 0 }],
  placeables: [],
};

test.afterEach(async () => {
  await fakeConsole.reset();
});

test.describe('holdings and export', () => {
  test('owned bases list their export and sharing actions', async ({ page, context }) => {
    await signInAs(context, await fakeConsole.newMember('Builder', { guild: null }));
    await page.goto('/holdings');
    await expect(page.getByText('Stronghold One')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Download blueprint' })).toHaveAttribute(
      'href',
      '/api/bases/b1/export',
    );
    await expect(page.getByRole('link', { name: 'Share to marketplace' })).toHaveAttribute('href', '/bases/upload');
  });

  test('a member can export a base they own and nobody else’s', async ({ context }) => {
    await signInAs(context, await fakeConsole.newMember('Builder', { guild: null }));
    const mine = await context.request.get('/api/bases/b1/export');
    expect(mine.status()).toBe(200);
    expect(mine.headers()['content-disposition']).toMatch(/^attachment; filename="base-b1\.json"$/);
    expect(await mine.json()).toMatchObject({ name: 'Exported Stronghold' });

    // A real base ID that belongs to the fixture member, requested by someone who does not own it.
    const stranger = await fakeConsole.newMember('Stranger', { details: { bases: { rows: [] } } });
    await signInAs(context, stranger);
    const foreign = await context.request.get('/api/bases/b1/export');
    expect(foreign.status()).toBe(403);
    expect(await foreign.text()).not.toContain('Exported Stronghold');
  });

  test('export requires a session and sanitises the download name', async ({ context, request }) => {
    expect((await request.get('/api/bases/b1/export')).status()).toBe(401);
    await signInAs(context, await fakeConsole.newMember('Builder', { guild: null }));
    const hostile = await context.request.get('/api/bases/..%2F..%2Fetc%2Fpasswd/export');
    expect([400, 403, 404]).toContain(hostile.status());
    expect(hostile.headers()['content-disposition'] ?? '').not.toContain('..');
  });
});

test.describe('blueprint import safeguards', () => {
  test('imports must come from this site, as JSON, from a signed-in member', async ({ context, request }) => {
    const body = { requestId: '0f6a2f1e-3f6c-4a9c-8b0e-7c1d2e3f4a5b', title: 'Outpost', blueprint: layout };
    expect((await request.post('/api/bases/import', { data: body, headers: { Origin: ORIGIN } })).status()).toBe(401);

    await signInAs(context, await fakeConsole.newMember('Builder', { guild: null }));
    const crossSite = await context.request.post('/api/bases/import', {
      data: body,
      headers: { Origin: 'https://evil.example' },
    });
    expect(crossSite.status()).toBe(403);
    const notJson = await context.request.post('/api/bases/import', {
      data: 'blueprint=1',
      headers: { Origin: ORIGIN, 'Content-Type': 'text/plain' },
    });
    expect(notJson.status()).toBe(415);
  });

  test('a malformed blueprint is refused before anything reaches the Console', async ({ context }) => {
    await signInAs(context, await fakeConsole.newMember('Builder', { guild: null }));
    const before = (await fakeConsole.requests()).length;
    for (const blueprint of [
      { instances: 'nope' },
      { instances: [{ building_type: 'BP_Wall;rm -rf', x: 0, y: 0, z: 0, rotation: 0, instance_id: 1 }] },
      { instances: [{ building_type: 'BP_Wall', x: 1e12, y: 0, z: 0, rotation: 0, instance_id: 1 }] },
      { instances: [], placeables: [] },
    ]) {
      const response = await context.request.post('/api/bases/import', {
        data: { requestId: crypto.randomUUID(), title: 'Bad', blueprint },
        headers: { Origin: ORIGIN },
      });
      expect(response.status()).toBe(400);
    }
    const imports = (await fakeConsole.requests()).slice(before).filter((call) => call.path.includes('blueprints'));
    expect(imports).toEqual([]);
  });

  test('claim consoles are refused so a blueprint cannot claim land', async ({ context }) => {
    await signInAs(context, await fakeConsole.newMember('Builder', { guild: null }));
    const response = await context.request.post('/api/bases/import', {
      data: {
        requestId: crypto.randomUUID(),
        title: 'Claim',
        blueprint: {
          instances: [],
          placeables: [{ placeable_id: 1, building_type: 'totem_placeable', x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0 }],
        },
      },
      headers: { Origin: ORIGIN },
    });
    expect(response.status()).toBe(400);
    expect(await response.text()).toMatch(/claim/i);
  });
});

test.describe('marketplace', () => {
  test('an unreachable marketplace says so without leaking internals', async ({ page, context }) => {
    await signInAs(context, await fakeConsole.newMember('Browser', { guild: null }));
    await page.goto('/bases');
    await expect(page.getByText('Marketplace unavailable')).toBeVisible();
    expect(await page.content()).not.toMatch(/redis|ECONN|stack|arrakis:\{bm\}/i);
  });

  test('the marketplace needs a session', async ({ page, request }) => {
    await page.goto('/bases');
    await expect(page).toHaveURL(/\/login/);
    for (const path of [
      '/api/v2/bases/marketplace/aaaaaaaaaaaaaaaaaaaaaaaa',
      '/api/v2/bases/marketplace/aaaaaaaaaaaaaaaaaaaaaaaa/image',
    ]) {
      expect((await request.get(path)).status(), path).toBe(401);
    }
  });

  test('publishing sends the layout as multipart from this origin and shows the server’s refusal', async ({
    page,
    context,
  }) => {
    await signInAs(context, await fakeConsole.newMember('Builder', { guild: null }));
    const uploads: Array<{ type: string; origin?: string; text: string }> = [];
    await page.route('**/api/v2/bases/marketplace', async (route) => {
      const request = route.request();
      if (request.method() !== 'POST') return route.continue();
      uploads.push({
        type: request.headers()['content-type'] ?? '',
        origin: request.headers()['origin'],
        text: request.postData() ?? '',
      });
      return route.fulfill({
        status: 409,
        json: { ok: false, error: 'You can share up to 25 bases. Remove one first.', code: 'USER_LIMIT' },
      });
    });
    await page.goto('/bases/upload');
    await page.getByLabel('Base layout (.json)').setInputFiles({
      name: 'outpost.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(layout)),
    });
    await page.getByLabel('Title').fill('Test Outpost');
    await page.getByRole('button', { name: 'Publish to marketplace' }).click();
    await expect.poll(() => uploads.length).toBe(1);
    expect(uploads[0].type).toContain('multipart/form-data');
    expect(uploads[0].origin).toBe(ORIGIN);
    expect(uploads[0].text).toContain('BP_Wall_01');
    expect(uploads[0].text).toContain('Test Outpost');
    await expect(page.getByText('You can share up to 25 bases. Remove one first.')).toBeVisible();
  });

  test('a layout that is not a base is refused by the server with a clear message', async ({ context }) => {
    await signInAs(context, await fakeConsole.newMember('Builder', { guild: null }));
    const response = await context.request.post('/api/v2/bases/marketplace', {
      headers: { Origin: ORIGIN },
      multipart: {
        title: 'Not a base',
        description: '',
        file: { name: 'x.json', mimeType: 'application/json', buffer: Buffer.from('{"hello":"world"}') },
      },
    });
    expect([400, 422, 503]).toContain(response.status());
    expect(await response.text()).not.toMatch(/stack|at .*\.ts/);
  });
});
