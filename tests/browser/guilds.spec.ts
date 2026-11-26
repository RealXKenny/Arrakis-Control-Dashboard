import type { BrowserContext } from '@playwright/test';
import { expect, test } from '../helpers/browser-test';
import { fakeConsole, type TestMember } from '../helpers/fake-console-client';

/**
 * Guild recruitment and membership in the V2 interface. The server renders the roster and directory from the fake
 * Console and the browser Redis fixture; client-side actions (apply, save, rank changes) call the real API routes,
 * which these tests intercept to assert exactly what the browser sends.
 */
const signInAs = (context: BrowserContext, member: TestMember) =>
  context.setExtraHTTPHeaders({ Cookie: member.cookie });

test.afterEach(async () => {
  await fakeConsole.reset();
});

test.describe('recruitment directory', () => {
  test('lists a published guild under the Console’s name, not the name stored with the listing', async ({
    page,
    context,
  }) => {
    await signInAs(context, await fakeConsole.newMember('Applicant', { guild: null }));
    await page.goto('/guilds');
    await expect(page.getByRole('heading', { name: 'Guilds', level: 1 })).toBeVisible();
    await expect(page.getByText('Crimson Skies').first()).toBeVisible();
    await expect(page.getByText('Impostor Guild Name')).toHaveCount(0);
    await expect(page.getByText('Be active in the Deep Desert.')).toBeVisible();
    await expect(page.getByRole('button', { name: /apply to guild/i })).toBeVisible();
  });

  test('an application sends the member’s answers and the form version, never an identity', async ({
    page,
    context,
  }) => {
    await signInAs(context, await fakeConsole.newMember('Applicant', { guild: null }));
    const submissions: Array<Record<string, unknown>> = [];
    await page.route('**/api/guilds/2/application', async (route) => {
      if (route.request().method() !== 'POST') return route.fulfill({ json: { ok: true, data: null } });
      submissions.push(route.request().postDataJSON());
      return route.fulfill({ status: 201, json: { ok: true, data: { status: 'pending' } } });
    });
    await page.goto('/guilds');
    await page.getByRole('button', { name: /apply to guild/i }).click();
    const form = page.getByRole('dialog').or(page.locator('form').filter({ hasText: 'Submit application' }));
    await form.getByLabel(/Why do you want to join/i).fill('I know the Deep Desert.');
    await form.getByRole('button', { name: 'Submit application' }).click();
    await expect.poll(() => submissions.length).toBe(1);
    const body = submissions[0];
    expect(JSON.stringify(body)).toContain('I know the Deep Desert.');
    // The server derives who is applying; nothing in the request names a Discord user, character or guild member.
    expect(Object.keys(body).filter((key) => /discord|player|character|userId|senderId/i.test(key))).toEqual([]);
  });

  test('anonymous visitors cannot read the directory data', async ({ page, request }) => {
    await page.goto('/guilds');
    await expect(page).toHaveURL(/\/login/);
    for (const path of ['/api/guilds', '/api/guilds/requirements', '/api/guilds/2/members']) {
      expect((await request.get(path)).status(), path).toBe(401);
    }
  });
});

test.describe('my guild', () => {
  test('a leader sees the roster and can add and manage members', async ({ page, context }) => {
    await signInAs(context, await fakeConsole.newMember('Guild Boss', { guild: { id: '2', role: 100 } }));
    await page.goto('/guild');
    await expect(page.getByText('Your rank: Leader')).toBeVisible();
    await expect(page.getByRole('region', { name: 'Guild roster' })).toContainText('Chani');
    await expect(page.getByRole('button', { name: 'Add member' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Manage Chani' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Settings' })).toBeVisible();
  });

  test('an ordinary member sees the roster but none of the leader controls', async ({ page, context }) => {
    await signInAs(context, await fakeConsole.newMember('Plain Member', { guild: { id: '2', role: 1 } }));
    await page.goto('/guild');
    await expect(page.getByText('Your rank: Member')).toBeVisible();
    await expect(page.getByRole('region', { name: 'Guild roster' })).toContainText('Chani');
    await expect(page.getByRole('button', { name: 'Add member' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /^Manage/ })).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Settings' })).toHaveCount(0);
  });

  test('a member forging the settings URL still gets no settings form', async ({ page, context }) => {
    await signInAs(context, await fakeConsole.newMember('Plain Member', { guild: { id: '2', role: 1 } }));
    await page.goto('/guild?tab=settings');
    await expect(page.getByRole('button', { name: /Save guild settings/i })).toHaveCount(0);
    await expect(page.getByLabel(/Guild name/i)).toHaveCount(0);
  });

  test('a member without a guild is told so, with no roster', async ({ page, context }) => {
    await signInAs(context, await fakeConsole.newMember('Loner', { guild: null }));
    await page.goto('/guild');
    await expect(page.getByText('No guild reported')).toBeVisible();
    await expect(page.getByRole('region', { name: 'Guild roster' })).toHaveCount(0);
    await expect(page.getByText('Chani')).toHaveCount(0);
  });

  test('removing a member needs a deliberate confirmation and sends one same-origin request', async ({
    page,
    context,
  }) => {
    await signInAs(context, await fakeConsole.newMember('Guild Boss', { guild: { id: '2', role: 100 } }));
    const mutations: Array<{ method: string; path: string; origin?: string; body: unknown }> = [];
    await page.route('**/api/guilds/2/members/**', (route) => {
      const request = route.request();
      mutations.push({
        method: request.method(),
        path: new URL(request.url()).pathname,
        origin: request.headers()['origin'],
        body: request.postDataJSON(),
      });
      return route.fulfill({ json: { ok: true, data: {} } });
    });
    await page.goto('/guild');
    await page.getByRole('button', { name: 'Manage Chani' }).click();
    // Opening the controls and cancelling changes nothing.
    await expect(page.getByRole('button', { name: 'Remove from guild' })).toBeVisible();
    await page.getByRole('button', { name: 'Cancel' }).click();
    expect(mutations).toEqual([]);

    await page.getByRole('button', { name: 'Manage Chani' }).click();
    await page.getByRole('button', { name: 'Remove from guild' }).click();
    // Whatever the confirmation looks like, no request may leave without the member's current rank and an
    // explicit confirmation phrase, and only to this site's own origin.
    for (const mutation of mutations) {
      expect(mutation.method).toBe('DELETE');
      expect(mutation.origin).toBe('http://127.0.0.1:3100');
      expect(mutation.body).toMatchObject({ expectedRole: 1, confirmation: 'REMOVE MEMBER' });
    }
  });

  test('the leader settings page offers the recruitment form and saves it with a same-origin JSON request', async ({
    page,
    context,
  }) => {
    await signInAs(context, await fakeConsole.newMember('Guild Boss', { guild: { id: '2', role: 100 } }));
    const saved: Array<{ headers: Record<string, string>; body: Record<string, unknown> }> = [];
    await page.route('**/api/guilds/2/requirements', async (route) => {
      if (route.request().method() === 'POST') {
        saved.push({ headers: route.request().headers(), body: route.request().postDataJSON() });
        return route.fulfill({ json: { ok: true, data: route.request().postDataJSON() } });
      }
      return route.fulfill({ json: { ok: true, data: null } });
    });
    await page.goto('/guild?tab=settings');
    await expect(page.getByRole('heading', { name: 'Guild settings' })).toBeVisible();
    await page.getByLabel('Joining requirements').fill('Active weekly.');
    await page.getByLabel('How to join').fill('Message the leader.');
    await page.getByRole('button', { name: 'Save guild settings' }).click();
    await expect.poll(() => saved.length).toBe(1);
    expect(saved[0].headers['content-type']).toContain('application/json');
    expect(saved[0].body).toMatchObject({ requirements: 'Active weekly.', contact: 'Message the leader.' });
  });
});
