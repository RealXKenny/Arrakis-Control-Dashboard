import { afterEach, expect, it, vi } from 'vitest';
import { DuneConsoleClient } from '../../src/infrastructure/dune';
import { parseProviderResponse, providerUrl } from '../../src/infrastructure/dunedocker/transport';
import { normalizeLinkedPlayer } from '../../src/modules/player/server/linked-player';
import { getSafeError } from '../../src/lib/errors';
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
  await expect(
    parseProviderResponse(new Response('{}', { headers: { 'Content-Length': String(17 * 1024 * 1024) } })),
  ).rejects.toThrow('Response body exceeded limit');
});
it('returns a successful console response without exposing query strings or request secrets', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ rows: [{ id: 1 }] })));
  const client = new DuneConsoleClient('https://console.test', null, 'test-api-key');
  expect(await client.request('GET', '/api/items?q=private')).toEqual({ rows: [{ id: 1 }] });
  expect(fetch).toHaveBeenCalledWith(
    'https://console.test/api/items?q=private',
    expect.objectContaining({ headers: expect.objectContaining({ Authorization: 'Bearer test-api-key' }) }),
  );
});
it('does not replay mutations or disclose upstream errors', async () => {
  const fetcher = vi.fn().mockResolvedValue(Response.json({ error: 'password=private' }, { status: 503 }));
  vi.stubGlobal('fetch', fetcher);
  const client = new DuneConsoleClient('https://console.test', null, 'test-api-key');
  const error = await client.request('POST', '/api/action', { body: {} }).catch((value) => value);
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(error).toMatchObject({ message: 'Console API request failed', details: null });
  expect(getSafeError(error).message).toBe('Internal server error');
});
it('does not retry forbidden scopes or rate limits', async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(Response.json({}, { status: 403 }))
    .mockResolvedValueOnce(Response.json({}, { status: 429 }));
  vi.stubGlobal('fetch', fetcher);
  const client = new DuneConsoleClient('https://console.test', null, 'test-api-key');
  await expect(client.request('GET', '/api/settings')).rejects.toMatchObject({ status: 403 });
  await expect(client.request('GET', '/api/items')).rejects.toMatchObject({ status: 429 });
  expect(fetcher).toHaveBeenCalledTimes(2);
});
it('handles multipart and network failures through the same transport', async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(Response.json({ ok: true }))
    .mockRejectedValueOnce(new Error('private-network-secret'));
  vi.stubGlobal('fetch', fetcher);
  const client = new DuneConsoleClient('https://console.test', null, 'test-api-key');
  await client.requestMultipart('POST', '/api/blueprints/import', new FormData());
  await expect(client.requestMultipart('POST', '/api/blueprints/import', new FormData())).rejects.toMatchObject({
    message: 'Console API request failed',
  });
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
