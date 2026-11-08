import { mkdirSync, writeFileSync } from 'node:fs';
import { afterAll, afterEach, beforeEach, expect, it, vi } from 'vitest';
import catalog from '../../src/features/admin/catalog.json' with { type: 'json' };
import { POST as execute } from '../../src/app/api/v2/admin/execute/route';
import { POST as upload } from '../../src/app/api/v2/admin/upload/route';
import { adminPost, adminUpload } from '../helpers/admin-v2';
import { tabForOperation } from '../../src/features/admin/navigation';
import type { AdminOperation } from '../../src/features/admin/types';

const { fetcher } = vi.hoisted(() => ({ fetcher: vi.fn() }));
vi.mock('../../src/config/env', () => ({
  getServerEnv: () => ({
    CONSOLE_URL: 'https://console.test',
    APP_URL: 'https://dashboard.test',
    ADMIN_CONSOLE_API_KEY: 'fixture-admin-key',
    ADAPTER_TOKEN: 'fixture-adapter-key',
    DISCORD_GUILD_ID: 'guild',
    VERIFIED_MEMBER_ROLE_ID: 'verified',
    LOG_LEVEL: 'FATAL',
  }),
}));
vi.mock('../../src/features/auth/server/session', () => {
  const getSession = async () => ({
    user: { id: '456084885220884480', username: 'Administrator' },
    guildId: 'guild',
    roleIds: ['verified'],
    authenticatedAt: Date.now(),
    expiresAt: Date.now() + 60000,
  });
  return { getSession, currentSession: () => getSession() };
});
vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => ({ value: 'fixture' }) }) }));
vi.mock('next/navigation', () => ({ redirect: vi.fn() }));
// The catalog sweep runs every operation in one minute; the administrator budget has its own unit test.
vi.mock('../../src/lib/security/rate-limit', () => ({
  checkRateLimit: async () => ({ allowed: true, remaining: 1, retryAfter: 1 }),
}));
vi.mock('../../src/lib/redis/client', () => ({ getRedisClient: () => ({ eval: async () => 1 }) }));
const passed = new Map<string, string>();
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('fetch', fetcher);
});
afterEach(() => vi.unstubAllGlobals());

it.each(catalog)('$method $route — $title', async (operation) => {
  const path = Object.fromEntries(
    operation.pathParameters.map((name) => [name, name === 'path' ? 'folder/file.json' : 'fixture']),
  );
  const metadata = {
    operation: operation.id,
    path,
    query: { fixture: 'read', ...(operation.provider === 'adapter' ? { actor: 'forged' } : {}) },
    body:
      operation.method === 'GET'
        ? {}
        : {
            fixture: true,
            ...(operation.confirmationPhrases.length ? { confirmation: operation.confirmationPhrases[0] } : {}),
          },
    acknowledgement: `${operation.method} ${operation.route}`,
  };
  if (operation.restriction) {
    const refused = await execute(adminPost('/api/v2/admin/execute', metadata));
    expect(refused.status).toBe(403);
    expect(await refused.json()).toMatchObject({ code: 'CONSOLE_OPERATION_RESTRICTED' });
    expect(fetcher).not.toHaveBeenCalled();
    passed.set(operation.id, 'Restricted as documented');
    return;
  }
  fetcher.mockImplementation(async () =>
    operation.mode === 'events'
      ? new Response('data: {"message":"fixture event","token":"private"}\n\n', {
          headers: { 'Content-Type': 'text/event-stream' },
        })
      : operation.mode === 'download'
        ? new Response('fixture download', { headers: { 'Content-Type': 'application/octet-stream' } })
        : new Response('{"ok":true,"rows":[{"id":9007199254740993123}],"token":"private"}', {
            headers: { 'Content-Type': 'application/json' },
          }),
  );
  let response: Response;
  if (['multipart', 'upload'].includes(operation.mode)) {
    const files = Object.fromEntries(
      (operation.files ?? []).map((name) => [
        name,
        new File(['{"fixture":true}'], `${name}.json`, { type: 'application/json' }),
      ]),
    );
    response = await upload(await adminUpload('/api/v2/admin/upload', metadata, files));
  } else response = await execute(adminPost('/api/v2/admin/execute', metadata));
  expect(response.status).toBe(200);
  expect(fetcher).toHaveBeenCalledTimes(1);
  const [url, options] = fetcher.mock.calls[0];
  const expected = operation.pathParameters.reduce(
    (route, name) => route.replace(`{${name}}`, path[name].split('/').map(encodeURIComponent).join('/')),
    operation.route,
  );
  expect(new URL(url).pathname).toBe(expected);
  expect(options.method).toBe(operation.method);
  expect(options.headers.Authorization).toBe(
    operation.provider === 'adapter' ? 'Bearer fixture-adapter-key' : 'Bearer fixture-admin-key',
  );
  expect(options.redirect).toBe('error');
  expect(options.cache).toBe('no-store');
  if (operation.provider === 'adapter') {
    const actor =
      operation.method === 'GET' ? JSON.parse(new URL(url).searchParams.get('actor')!) : JSON.parse(options.body).actor;
    expect(actor.userId).toBe('456084885220884480');
    expect(actor.guildId).toBe('guild');
  }
  if (operation.method === 'GET') expect(options.body).toBeUndefined();
  if (operation.mode === 'multipart') expect(options.body).toBeInstanceOf(FormData);
  if (operation.mode === 'upload') expect(options.body).toBeInstanceOf(Blob);
  const streamed = operation.mode === 'events' || response.headers.get('Content-Type') === 'application/octet-stream';
  if (streamed) {
    const text = await response.text();
    expect(text).toContain(operation.mode === 'events' ? 'fixture event' : 'fixture download');
    if (operation.mode === 'events') expect(text).not.toContain('private');
  } else if (operation.mode === 'download') {
    expect(response.headers.get('Content-Type')).toContain('text/plain');
    expect(JSON.parse(await response.text()).text).toBe('fixture download');
  } else {
    const result = await response.json();
    expect(result.ok).toBe(true);
    expect(result.data.rows[0].id).toBe('9007199254740993123');
    expect(result.data.token).toBe('[REDACTED]');
  }
  passed.set(operation.id, 'Mocked contract passed');
});

afterAll(() => {
  mkdirSync('test-results', { recursive: true });
  const cell = (value: string) => value.replaceAll('|', '/');
  const rows = (catalog as AdminOperation[]).map((entry) => {
    const owner = tabForOperation(entry);
    const screen = owner ? `${owner.section.label} › ${owner.tab.label}` : 'UNMAPPED';
    const credential = entry.provider === 'adapter' ? 'ADAPTER_TOKEN (bound actor)' : 'ADMIN_CONSOLE_API_KEY';
    const params = entry.pathParameters.length ? `path: ${entry.pathParameters.join(', ')}` : 'no path parameters';
    const interfaceKind = entry.restriction
      ? 'Console handoff, no form'
      : entry.mode === 'json'
        ? 'Typed form and result table'
        : `Typed form, ${entry.mode} transport`;
    const gap = entry.restriction
      ? `Console-only: ${entry.restriction}`
      : 'Live support not verified without deployment credentials';
    return `| ${entry.method} | ${entry.route} | ${cell(entry.title)} | ${screen} | ${credential} | ${params}; ${cell(entry.parameters)} | ${entry.mode} | ${interfaceKind} | ${passed.get(entry.id) ?? 'Failed or not completed'} | ${cell(gap)} |`;
  });
  writeFileSync(
    'test-results/admin-api-report.md',
    `# Administrative API contract report and coverage matrix\n\n${passed.size}/${catalog.length} catalog entries verified.\n\nTests use mocked Console responses and synthetic parameters. They verify routing, methods, credentials, restrictions, redaction, uploads, downloads, and event streams. They do not certify live Console business rules, installed capabilities, or key scopes, and do not mutate a live game server.\n\n| Method | Route | Purpose | Navigation screen | Credential | Parameters | Transport | Interface | Verification | Gap or restriction |\n| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |\n${rows.join('\n')}\n`,
  );
});
