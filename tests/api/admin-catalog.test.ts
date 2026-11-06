import { Readable } from 'node:stream';
import { mkdirSync, writeFileSync } from 'node:fs';
import { afterAll, afterEach, beforeEach, expect, it, vi } from 'vitest';
import catalog from '../../src/modules/admin/catalog.json';
import { POST as execute } from '../../src/modules/admin/server/execute';
import { POST as upload } from '../../src/modules/admin/server/upload';
import { responseMock } from '../helpers/response';

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
vi.mock('../../src/lib/security/session-store', () => ({
  getSession: async () => ({
    user: { id: '456084885220884480', username: 'Administrator' },
    guildId: 'guild',
    roleIds: ['verified'],
    expiresAt: Date.now() + 60000,
  }),
}));
vi.mock('../../src/lib/redis/client', () => ({ getRedisClient: () => ({ eval: async () => 1 }) }));
const headers = {
  cookie: 'dashboard_session=fixture',
  origin: 'https://dashboard.test',
  'content-type': 'application/json',
};
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
  const req = { headers, body: metadata };
  if (operation.restriction) {
    await expect(execute(req, responseMock())).rejects.toMatchObject({
      statusCode: 403,
      code: 'CONSOLE_OPERATION_RESTRICTED',
    });
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
  let response;
  if (['multipart', 'upload'].includes(operation.mode)) {
    const form = new FormData();
    form.set('request', JSON.stringify(metadata));
    for (const name of operation.files ?? [])
      form.set(name, new File(['{"fixture":true}'], `${name}.json`, { type: 'application/json' }));
    const encoded = new Request('https://upload.test', { method: 'POST', body: form });
    const incoming = Readable.from([Buffer.from(await encoded.arrayBuffer())]);
    Object.assign(incoming, { headers: { ...headers, 'content-type': encoded.headers.get('content-type')! } });
    response = await upload(incoming, responseMock());
  } else response = await execute(req, responseMock());
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
  if (response.stream) {
    const text = await new Response(response.stream.body).text();
    expect(text).toContain(operation.mode === 'events' ? 'fixture event' : 'fixture download');
    if (operation.mode === 'events') expect(text).not.toContain('private');
    response.stream.cleanup?.();
  } else if (operation.mode === 'download') {
    expect(response.headers['Content-Type']).toContain('text/plain');
    expect(JSON.parse(response.body!).text).toBe('fixture download');
  } else {
    const result = JSON.parse(response.body!);
    expect(result.ok).toBe(true);
    expect(result.data.rows[0].id).toBe('9007199254740993123');
    expect(result.data.token).toBe('[REDACTED]');
  }
  passed.set(operation.id, 'Mocked contract passed');
});

afterAll(() => {
  mkdirSync('test-results', { recursive: true });
  const rows = catalog.map(
    (entry) =>
      `| ${entry.method} | ${entry.route} | ${entry.title.replaceAll('|', '/')} | ${entry.parameters.replaceAll('|', '/')} | ${passed.get(entry.id) ?? 'Failed or not completed'} |`,
  );
  writeFileSync(
    'test-results/admin-api-report.md',
    `# Administrative API contract report\n\n${passed.size}/${catalog.length} catalog entries verified.\n\nTests use mocked Console responses and synthetic parameters. They verify routing, methods, credentials, restrictions, redaction, uploads, downloads, and event streams. They do not certify live Console business rules, installed capabilities, or key scopes, and do not mutate a live game server.\n\n| Method | Route | Purpose | Parameters | Result |\n| --- | --- | --- | --- | --- |\n${rows.join('\n')}\n`,
  );
});
