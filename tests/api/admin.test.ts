import { Readable } from 'node:stream';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import catalog from '../../src/pages/api/admin/catalog';
import execute from '../../src/pages/api/admin/execute';
import upload from '../../src/pages/api/admin/upload';
import { getSession } from '../../src/lib/session-store';
import { sanitizedEvents, executeOperation } from '../../src/modules/admin/server/execute';
import { parseAdminRequest } from '../../src/modules/admin/server/request';
import { responseMock } from '../helpers/response';

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
vi.mock('../../src/config/env', () => ({ getServerEnv: () => config }));
vi.mock('../../src/lib/session-store', () => ({ getSession: vi.fn() }));
vi.mock('../../src/lib/rate-limit', () => ({
  checkRateLimit: async () => ({ allowed: true, remaining: 20, retryAfter: 60 }),
  getClientAddress: () => 'test',
}));
const session = () => ({
  user: { id: '456084885220884480' },
  guildId: 'guild',
  roleIds: ['verified'],
  expiresAt: Date.now() + 60_000,
});
const fetcher = vi.fn();
const request = (body = {}, headers: Record<string, string> = {}) => ({
  method: 'POST',
  url: '/api/admin/execute',
  headers: { cookie: 'dashboard_session=admin', origin: 'https://dashboard.test', ...headers } as Record<
    string,
    string
  >,
  body,
});
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
    for (const route of [catalog, execute, upload]) {
      const req = {
        ...request(),
        method: route === catalog ? 'GET' : 'POST',
        url: route === catalog ? '/api/admin/catalog' : '/api/admin/execute',
      };
      const res = responseMock();
      await route(req, res);
      expect(res.statusCode).toBe(who === null ? 401 : 403);
    }
  }
  expect(fetcher).not.toHaveBeenCalled();
});

it('returns an authorized catalog without exposing any configured credential', async () => {
  const res = responseMock();
  await catalog({ ...request(), method: 'GET', url: '/api/admin/catalog' }, res);
  const body = JSON.parse(String(res.body));
  expect(body.operations).toHaveLength(378);
  expect(body.configured).toBe(true);
  expect(String(res.body)).not.toContain('separate-admin-key');
  expect(res.getHeader('Cache-Control')).toContain('no-store');
});

it('rejects cross-origin requests and missing confirmations before contacting Console', async () => {
  for (const req of [
    request({ operation: 'get-server-status' }, { origin: 'https://evil.test' }),
    request({ operation: 'post-server-stop' }),
  ]) {
    const res = responseMock();
    await execute(req, res);
    expect(res.statusCode).toBeGreaterThanOrEqual(400);
  }
  expect(fetcher).not.toHaveBeenCalled();
});

it('uses the independent administrator credential and normalizes responses', async () => {
  const res = responseMock();
  await execute(request({ operation: 'get-server-status' }), res);
  expect(res.statusCode).toBe(200);
  expect(fetcher.mock.calls[0][0].toString()).toBe('https://console.test/api/server/status?raw=0');
  expect(fetcher.mock.calls[0][1]).toMatchObject({
    headers: { Authorization: 'Bearer separate-admin-key' },
    redirect: 'error',
  });
  expect(JSON.parse(String(res.body)).data.secret).toBe('[REDACTED]');
});

it('binds adapter actor identity to the verified session and never interchanges keys', async () => {
  const res = responseMock();
  await execute(request({ operation: 'get-integrations-discord-players-me', query: { actor: 'forged' } }), res);
  const url = new URL(fetcher.mock.calls[0][0]);
  expect(JSON.parse(url.searchParams.get('actor')!).userId).toBe('456084885220884480');
  expect(fetcher.mock.calls[0][1].headers.Authorization).toBe('Bearer separate-adapter-key');
});

it('never retries an uncertain mutation and retains queued/conflict responses', async () => {
  fetcher.mockRejectedValueOnce(new Error('private internal connection error'));
  const res = responseMock();
  await execute(request({ operation: 'post-server-restart', acknowledgement: 'POST /api/server/restart' }), res);
  expect(res.statusCode).toBe(502);
  expect(res.body).toMatchObject({ code: 'OPERATION_OUTCOME_UNKNOWN' });
  expect(fetcher).toHaveBeenCalledTimes(1);
  fetcher.mockResolvedValueOnce(
    new Response(JSON.stringify({ queued: true, task: { id: 'task-one' } }), {
      status: 202,
      headers: { 'Content-Type': 'application/json' },
    }),
  );
  const queued = responseMock();
  await execute(request({ operation: 'post-server-restart', acknowledgement: 'POST /api/server/restart' }), queued);
  expect(queued.statusCode).toBe(202);
  expect(JSON.parse(String(queued.body)).data.queued).toBe(true);
});

it('rejects restricted operations and insecure admin transport', async () => {
  const denied = responseMock();
  await execute(request({ operation: 'post-database-query' }), denied);
  expect(denied.statusCode).toBe(403);
  config.CONSOLE_URL = 'http://remote-console.test';
  const insecure = responseMock();
  await execute(request({ operation: 'get-server-status' }), insecure);
  expect(insecure.statusCode).toBe(503);
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
  const response = await executeOperation(
    parseAdminRequest({ operation: 'get-backups-backup-download', path: { backup: 'fixture' } }),
    session(),
    responseMock(),
  );
  expect(response.headers['Content-Type']).toBe('application/octet-stream');
  expect(response.headers['Set-Cookie']).toBeUndefined();
  expect(response.headers['Content-Disposition']).not.toContain('unsafe.html');
  expect(response.stream?.maximumBytes).toBe(128 * 1024 * 1024);
  expect(await new Response(response.stream!.body).text()).toBe('fixture backup');
  response.stream?.cleanup?.();
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
  const form = new FormData();
  form.set(
    'request',
    JSON.stringify({
      operation: 'post-blueprints-import',
      acknowledgement: 'POST /api/blueprints/import',
      body: { player_id: '90071992547409931' },
    }),
  );
  form.set('file', new File(['{"name":"fixture"}'], 'fixture.json', { type: 'application/json' }));
  const encoded = new Request('http://upload.test', { method: 'POST', body: form });
  const req = Readable.from([Buffer.from(await encoded.arrayBuffer())]) as unknown as ReturnType<typeof request>;
  req.method = 'POST';
  req.url = '/api/admin/upload';
  req.headers = { ...request().headers, 'content-type': encoded.headers.get('content-type')! };
  const res = responseMock();
  await upload(req, res);
  expect(res.statusCode).toBe(200);
  const outgoing = fetcher.mock.calls[0][1].body as FormData;
  expect(outgoing.get('player_id')).toBe('90071992547409931');
  expect((outgoing.get('file') as File).name).toBe('fixture.json');
});
