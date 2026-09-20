import { afterEach, expect, it, vi } from 'vitest';
import { DuneConsoleClient } from '../../src/infrastructure/dune';
import { parseProviderResponse, providerUrl } from '../../src/infrastructure/dunedocker/transport';
import { captureApiSnapshot } from '../../src/lib/api-debug';
import { normalizeLinkedPlayer } from '../../src/modules/player/server/linked-player';
import { getSafeError } from '../../src/lib/errors';
vi.mock('../../src/lib/api-debug', () => ({ captureApiSnapshot: vi.fn() }));
vi.mock('../../src/config/env', () => ({ getServerEnv: () => ({ LOG_LEVEL: 'ERROR', NODE_ENV: 'test' }) }));
afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});
it('preserves provider prefixes and refuses off-origin routes', () => {
  expect(providerUrl('https://console.test/prefix', '/api/player?q=1').toString()).toBe(
    'https://console.test/prefix/api/player?q=1',
  );
  expect(() => providerUrl('https://console.test', 'https://other.test/api/player')).toThrow();
});
it('parses JSON exports and normalizes empty bodies', async () => {
  expect(
    await parseProviderResponse(
      new Response('{"rows":[]}', { headers: { 'Content-Type': 'application/octet-stream' } }),
    ),
  ).toEqual({ rows: [] });
  expect(await parseProviderResponse(new Response(null, { status: 204 }))).toBeNull();
  await expect(parseProviderResponse(new Response('<html>secret</html>'))).rejects.toThrow('Invalid provider JSON');
});
it('traces a successful console response without query strings or request secrets', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ rows: [{ id: 1 }] })));
  const client = new DuneConsoleClient('https://console.test');
  expect(await client.request('GET', '/api/items?q=private')).toEqual({ rows: [{ id: 1 }] });
  expect(captureApiSnapshot).toHaveBeenCalledWith('/api/items', 200, { rows: [{ id: 1 }] }, 'console', 'GET');
});
it('does not replay mutations or disclose upstream errors', async () => {
  const fetcher = vi.fn().mockResolvedValue(Response.json({ error: 'password=private' }, { status: 503 }));
  vi.stubGlobal('fetch', fetcher);
  const client = new DuneConsoleClient('https://console.test');
  const error = await client.request('POST', '/api/action', { body: {} }).catch((value) => value);
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(error).toMatchObject({ message: 'Console API request failed', details: null });
  expect(getSafeError(error).message).toBe('Internal server error');
});
it('does not reauthenticate forbidden scopes or retry 429', async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(Response.json({}, { status: 403 }))
    .mockResolvedValueOnce(Response.json({}, { status: 429 }));
  vi.stubGlobal('fetch', fetcher);
  const client = new DuneConsoleClient('https://console.test');
  client.password = 'private';
  await expect(client.request('GET', '/api/settings')).rejects.toMatchObject({ status: 403 });
  await expect(client.request('GET', '/api/items')).rejects.toMatchObject({ status: 429 });
  expect(fetcher).toHaveBeenCalledTimes(2);
});
it('traces multipart and network failures through the same transport', async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(Response.json({ ok: true }))
    .mockRejectedValueOnce(new Error('private-network-secret'));
  vi.stubGlobal('fetch', fetcher);
  const client = new DuneConsoleClient('https://console.test');
  await client.requestMultipart('POST', '/api/blueprints/import', new FormData());
  await expect(client.requestMultipart('POST', '/api/blueprints/import', new FormData())).rejects.toMatchObject({
    message: 'Console API request failed',
  });
  expect(captureApiSnapshot).toHaveBeenLastCalledWith(
    '/api/blueprints/import',
    0,
    { error: 'Provider network failure' },
    'console',
    'POST',
  );
});
it('validates the feature-owned linked player schema and strips provider-only fields', () => {
  expect(
    normalizeLinkedPlayer({ linked: true, pawnId: '42', characterName: 'Kenny', secret: 'hidden', error: 'raw' }),
  ).toEqual({ linked: true, pawnId: '42', characterName: 'Kenny' });
  expect(() => normalizeLinkedPlayer({ linked: 'true' })).toThrow('Unable to read linked character');
});

it('accepts Console capitalized online status without losing it', () => {
  expect(normalizeLinkedPlayer({ ok: true, linked: true, pawnId: '42', onlineStatus: 'Offline' }).onlineStatus).toBe(
    'Offline',
  );
});
