import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { GET as catalog } from '../../src/app/api/v2/admin/catalog/route';
import { POST as execute } from '../../src/app/api/v2/admin/execute/route';
import { POST as upload } from '../../src/app/api/v2/admin/upload/route';
import { getSession } from '../../src/lib/security/session-store';
import { executeAdminOperation, limitBytes, sanitizedEvents } from '../../src/server/admin/execute';
import { parseAdminRequest } from '../../src/modules/admin/server/request';
import { adminGet, adminPost, adminUpload } from '../helpers/admin-v2';

const config = vi.hoisted(() => ({
  NODE_ENV: 'test',
  LOG_LEVEL: 'FATAL',
  CONSOLE_URL: 'https://console.test',
  APP_URL: 'https://dashboard.test',
  DISCORD_GUILD_ID: 'guild',
  VERIFIED_MEMBER_ROLE_ID: 'verified',
  ADMIN_CONSOLE_API_KEY: 'separate-admin-key',
  CONSOLE_API_KEY: 'ordinary-key',
  ADAPTER_TOKEN: 'separate-adapter-key',
}));
vi.mock('../../src/lib/env', () => ({ getServerEnv: () => config }));
vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => ({ value: 'admin' }) }) }));
vi.mock('next/navigation', () => ({ redirect: vi.fn() }));
vi.mock('../../src/lib/security/session-store', () => ({ getSession: vi.fn() }));
vi.mock('../../src/lib/redis/client', () => ({ getRedisClient: () => ({ eval: async () => 1 }) }));

const session = () => ({
  user: { id: '456084885220884480' },
  guildId: 'guild',
  roleIds: ['verified'],
  expiresAt: Date.now() + 60_000,
});
const fetcher = vi.fn();
const run = (body: unknown, headers: Record<string, string> = {}) =>
  execute(adminPost('/api/v2/admin/execute', body, headers));

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('fetch', fetcher);
  config.CONSOLE_URL = 'https://console.test';
  vi.mocked(getSession).mockResolvedValue(session());
  fetcher.mockResolvedValue(
    new Response(JSON.stringify({ ok: true, rows: [{ id: '123' }], secret: 'must-hide' }), {
      headers: { 'Content-Type': 'application/json' },
    }),
  );
});
afterEach(() => vi.unstubAllGlobals());

it('rejects anonymous and non-admin users on every administrative API', async () => {
  for (const who of [
    null,
    { ...session(), user: { id: 'ordinary-user' } },
    { ...session(), guildId: 'other' },
    { ...session(), roleIds: [] },
  ]) {
    vi.mocked(getSession).mockResolvedValue(who);
    const expected = who === null ? 401 : 403;
    expect((await catalog(adminGet('/api/v2/admin/catalog'))).status).toBe(expected);
    expect((await run({ operation: 'get-server-status' })).status).toBe(expected);
    expect((await upload(adminPost('/api/v2/admin/upload', '', {}, 'multipart/form-data; boundary=x'))).status).toBe(
      expected,
    );
  }
  expect(fetcher).not.toHaveBeenCalled();
});

it('returns an authorized catalog without exposing any configured credential', async () => {
  const response = await catalog(adminGet('/api/v2/admin/catalog'));
  const text = await response.text();
  const body = JSON.parse(text);
  expect(body.operations).toHaveLength(383);
  expect(body.configured).toBe(true);
  expect(text).not.toContain('separate-admin-key');
  expect(response.headers.get('Cache-Control')).toContain('no-store');
});

it('rejects cross-origin requests and missing confirmations before contacting Console', async () => {
  for (const response of [
    await run({ operation: 'get-server-status' }, { origin: 'https://evil.test' }),
    await run({ operation: 'get-server-status' }, { 'sec-fetch-site': 'cross-site' }),
    await run({ operation: 'post-server-stop' }),
  ])
    expect(response.status).toBeGreaterThanOrEqual(400);
  expect(fetcher).not.toHaveBeenCalled();
});

it('bounds request bodies and rejects malformed JSON', async () => {
  expect((await execute(adminPost('/api/v2/admin/execute', 'x'.repeat(129 * 1024)))).status).toBe(413);
  expect((await execute(adminPost('/api/v2/admin/execute', '{not json'))).status).toBe(400);
  expect(fetcher).not.toHaveBeenCalled();
});

it('uses the independent administrator credential and normalizes responses', async () => {
  const response = await run({ operation: 'get-server-status' });
  expect(response.status).toBe(200);
  expect(fetcher.mock.calls[0][0].toString()).toBe('https://console.test/api/server/status?raw=0');
  expect(fetcher.mock.calls[0][1]).toMatchObject({
    headers: { Authorization: 'Bearer separate-admin-key' },
    redirect: 'error',
  });
  expect((await response.json()).data.secret).toBe('[REDACTED]');
});

it('accepts a native form post for downloads', async () => {
  const body = new URLSearchParams({ request: JSON.stringify({ operation: 'get-server-status' }) }).toString();
  const response = await execute(adminPost('/api/v2/admin/execute', body, {}, 'application/x-www-form-urlencoded'));
  expect(response.status).toBe(200);
});

it('binds adapter actor identity to the verified session and never interchanges keys', async () => {
  await run({ operation: 'get-integrations-discord-players-me', query: { actor: 'forged' } });
  const url = new URL(fetcher.mock.calls[0][0]);
  expect(JSON.parse(url.searchParams.get('actor')!).userId).toBe('456084885220884480');
  expect(fetcher.mock.calls[0][1].headers.Authorization).toBe('Bearer separate-adapter-key');
});

it('never retries an uncertain mutation and retains queued/conflict responses', async () => {
  fetcher.mockRejectedValueOnce(new Error('private internal connection error'));
  const failed = await run({ operation: 'post-server-restart', acknowledgement: 'POST /api/server/restart' });
  expect(failed.status).toBe(502);
  expect(await failed.json()).toMatchObject({ code: 'OPERATION_OUTCOME_UNKNOWN' });
  expect(fetcher).toHaveBeenCalledTimes(1);
  fetcher.mockResolvedValueOnce(
    new Response(JSON.stringify({ queued: true, task: { id: 'task-one' } }), {
      status: 202,
      headers: { 'Content-Type': 'application/json' },
    }),
  );
  const queued = await run({ operation: 'post-server-restart', acknowledgement: 'POST /api/server/restart' });
  expect(queued.status).toBe(202);
  expect((await queued.json()).data.queued).toBe(true);
});

it('rejects restricted operations and insecure admin transport', async () => {
  expect((await run({ operation: 'post-database-query' })).status).toBe(403);
  config.CONSOLE_URL = 'http://remote-console.test';
  expect((await run({ operation: 'get-server-status' })).status).toBe(503);
  expect(fetcher).not.toHaveBeenCalled();
});

it('provides bounded download streams with safe attachment headers', async () => {
  fetcher.mockResolvedValueOnce(
    new Response('fixture backup', {
      headers: {
        'Content-Type': 'text/html',
        'Set-Cookie': 'secret=one',
        'Content-Disposition': 'attachment; filename="../../unsafe.html"',
      },
    }),
  );
  const response = await executeAdminOperation(
    parseAdminRequest({ operation: 'get-backups-backup-download', path: { backup: 'fixture' } }),
    session(),
  );
  expect(response.headers.get('Content-Type')).toBe('application/octet-stream');
  expect(response.headers.get('Set-Cookie')).toBeNull();
  expect(response.headers.get('Content-Disposition')).not.toContain('unsafe.html');
  expect(await response.text()).toBe('fixture backup');
});

it('stops a relayed stream at its byte limit and releases the provider', async () => {
  const stop = vi.fn();
  const source = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new Uint8Array(6));
      controller.enqueue(new Uint8Array(6));
      controller.close();
    },
  });
  const received = new Uint8Array(await new Response(limitBytes(source, 8, stop)).arrayBuffer());
  expect(received.byteLength).toBe(6);
  expect(stop).toHaveBeenCalled();
});

it('redacts streamed events even when frames and CRLF boundaries span chunks', async () => {
  const encoder = new TextEncoder();
  const source = new ReadableStream({
    start(controller) {
      for (const part of ['data: {"token":"hidden","text":"Bearer unsafe"}\r', '\n\r\n'])
        controller.enqueue(encoder.encode(part));
      controller.close();
    },
  });
  const text = await new Response(sanitizedEvents(source)).text();
  expect(text).toContain('[REDACTED]');
  expect(text).not.toContain('hidden');
  expect(text).not.toContain('Bearer unsafe');
});

it('uploads multipart files only after authorization and explicit confirmation', async () => {
  const request = await adminUpload(
    '/api/v2/admin/upload',
    {
      operation: 'post-blueprints-import',
      acknowledgement: 'POST /api/blueprints/import',
      body: { player_id: '90071992547409931' },
    },
    { file: new File(['{"name":"fixture"}'], 'fixture.json', { type: 'application/json' }) },
  );
  const response = await upload(request);
  expect(response.status).toBe(200);
  const outgoing = fetcher.mock.calls[0][1].body as FormData;
  expect(outgoing.get('player_id')).toBe('90071992547409931');
  expect((outgoing.get('file') as File).name).toBe('fixture.json');
});

it('refuses uploads with an unexpected field, a missing confirmation, or a cross-origin post', async () => {
  const metadata = {
    operation: 'post-blueprints-import',
    acknowledgement: 'POST /api/blueprints/import',
    body: {},
  };
  const file = new File(['{}'], 'fixture.json');
  const extra = await upload(await adminUpload('/api/v2/admin/upload', metadata, { file, stray: file }));
  expect(extra.status).toBe(400);
  const unconfirmed = await upload(
    await adminUpload('/api/v2/admin/upload', { ...metadata, acknowledgement: '' }, { file }),
  );
  expect(unconfirmed.status).toBe(400);
  const cross = await adminUpload('/api/v2/admin/upload', metadata, { file });
  const foreign = new Request(cross.url, {
    method: 'POST',
    headers: new Headers([...cross.headers, ['origin', 'https://evil.test']]),
    body: await cross.arrayBuffer(),
  });
  expect((await upload(foreign)).status).toBe(403);
  expect(fetcher).not.toHaveBeenCalled();
});

it('forwards guild membership controls with the separate admin key and stable player IDs', async () => {
  const response = await run({
    operation: 'post-guilds-guildid-members',
    path: { guildId: '2' },
    body: { playerId: '9007199254740993123', roleId: 1 },
    acknowledgement: 'POST /api/guilds/{guildId}/members',
  });
  expect(response.status).toBe(200);
  expect(String(fetcher.mock.calls[0][0])).toBe('https://console.test/api/guilds/2/members');
  expect(fetcher.mock.calls[0][1].headers.Authorization).toBe('Bearer separate-admin-key');
  expect(JSON.parse(fetcher.mock.calls[0][1].body)).toEqual({ playerId: '9007199254740993123', roleId: 1 });
});

it('treats an explicit Console refusal in an HTTP 200 response as a failed operation', async () => {
  fetcher.mockResolvedValueOnce(
    new Response(JSON.stringify({ ok: false, error: 'refused' }), { headers: { 'Content-Type': 'application/json' } }),
  );
  const response = await run({ operation: 'post-server-restart', acknowledgement: 'POST /api/server/restart' });
  expect(response.status).toBe(502);
  expect((await response.json()).ok).toBe(false);
  expect(fetcher).toHaveBeenCalledTimes(1);
});
