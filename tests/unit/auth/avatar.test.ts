import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ eval: vi.fn(), limit: vi.fn() }));
vi.mock('../../../src/lib/redis/client', () => ({ getRedisClient: () => ({ eval: mocks.eval }) }));
vi.mock('../../../src/lib/security/rate-limit', () => ({ checkRateLimit: mocks.limit }));
import { serveDiscordAvatar } from '../../../src/features/auth/server/avatar';
import { keySlot } from '../../../src/lib/redis/connection';

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1sAAAAASUVORK5CYII=',
  'base64',
);
const hash = 'a'.repeat(32);
const request = new Request('https://dashboard.test/api/v2/auth/avatar/123/' + hash);
const serve = (avatar = hash) => serveDiscordAvatar(request, '123', avatar, 'viewer');

beforeEach(() => {
  vi.clearAllMocks();
  mocks.eval.mockResolvedValue(null);
  mocks.limit.mockResolvedValue({ allowed: true });
  vi.stubGlobal(
    'fetch',
    vi.fn().mockImplementation(async () => new Response(PNG, { headers: { 'Content-Type': 'image/png' } })),
  );
});
afterEach(() => vi.unstubAllGlobals());

describe('Redis avatar storage', () => {
  it('downloads only from the fixed verified HTTPS origin and persists bytes before serving', async () => {
    const response = await serve();
    expect(Buffer.from(await response.arrayBuffer())).toEqual(PNG);
    expect(fetch).toHaveBeenCalledWith(
      `https://cdn.discordapp.com/avatars/123/${hash}.png?size=128`,
      expect.objectContaining({ redirect: 'error', cache: 'no-store', signal: expect.any(AbortSignal) }),
    );
    const [script, keys, args] = mocks.eval.mock.calls[1];
    expect(script).toContain("redis.call('HDEL'");
    expect(new Set(keys.map(keySlot)).size).toBe(1);
    expect(args).toEqual([`123:${hash}`, PNG.toString('base64'), expect.any(Number), 512, 30 * 86_400]);
    expect(response.headers.get('content-type')).toBe('image/png');
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    expect(response.headers.get('cross-origin-resource-policy')).toBe('same-origin');
  });

  it('serves the saved bytes with Discord offline and does not consume download limits', async () => {
    mocks.eval.mockResolvedValue(PNG.toString('base64'));
    vi.mocked(fetch).mockRejectedValue(new Error('offline'));
    expect(Buffer.from(await (await serve()).arrayBuffer())).toEqual(PNG);
    expect(fetch).not.toHaveBeenCalled();
    expect(mocks.limit).not.toHaveBeenCalled();
  });

  it('shares one in-flight fetch and write for simultaneous requests', async () => {
    const responses = await Promise.all([serve(), serve(), serve()]);
    expect(responses.map((response) => response.status)).toEqual([200, 200, 200]);
    expect(fetch).toHaveBeenCalledOnce();
    expect(mocks.eval.mock.calls.filter(([script]) => script.includes("redis.call('HSET'"))).toHaveLength(1);
  });

  it('caps simultaneous cache-miss downloads and releases capacity after completion', async () => {
    const finish: Array<(value: Response) => void> = [];
    vi.mocked(fetch).mockImplementation(() => new Promise((resolve) => finish.push(resolve)));
    const held = Array.from({ length: 8 }, (_, index) => serve(index.toString(16).repeat(32)));
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(8));
    await expect(serve('f'.repeat(32))).rejects.toMatchObject({ statusCode: 429 });
    for (const resolve of finish) resolve(new Response(PNG, { headers: { 'Content-Type': 'image/png' } }));
    await Promise.all(held);
    vi.mocked(fetch).mockResolvedValue(new Response(PNG, { headers: { 'Content-Type': 'image/png' } }));
    expect((await serve('f'.repeat(32))).status).toBe(200);
  });

  it('uses separate versioned cache entries after a profile picture changes', async () => {
    await serve();
    await serve('b'.repeat(32));
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(mocks.eval.mock.calls[2][2][0]).toBe(`123:${'b'.repeat(32)}`);
  });

  it.each(['../secret', 'https://evil.test/image', 'a'.repeat(33), ''])(
    'rejects invalid avatar identifiers %s before cache or network access',
    async (value) => {
      await expect(serve(value)).rejects.toMatchObject({ statusCode: 400, code: 'INVALID_AVATAR' });
      expect(fetch).not.toHaveBeenCalled();
      expect(mocks.eval).not.toHaveBeenCalled();
    },
  );

  it('fails closed when Redis reads or writes fail without exposing underlying errors', async () => {
    mocks.eval.mockRejectedValueOnce(new Error('redis://user:password@private-host'));
    await expect(serve()).rejects.toMatchObject({
      statusCode: 503,
      message: 'Profile image is temporarily unavailable.',
    });
    expect(fetch).not.toHaveBeenCalled();
    mocks.eval.mockResolvedValueOnce(null).mockRejectedValueOnce(new Error('secret'));
    await expect(serve()).rejects.toMatchObject({
      statusCode: 503,
      message: 'Profile image is temporarily unavailable.',
    });
  });

  it('bounds download abuse and avoids a fetch on rate-limit refusal', async () => {
    mocks.limit.mockResolvedValue({ allowed: false });
    await expect(serve()).rejects.toMatchObject({ statusCode: 429 });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('does not fall back to process-local rate limits when Redis limit storage is unavailable', async () => {
    mocks.limit.mockResolvedValue({ allowed: true, storageUnavailable: true });
    await expect(serve()).rejects.toMatchObject({ statusCode: 503 });
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each([
    () => new Response('<svg/>', { headers: { 'Content-Type': 'image/svg+xml' } }),
    () => new Response('not png', { headers: { 'Content-Type': 'image/png' } }),
    () => new Response(PNG, { headers: { 'Content-Type': 'image/png', 'Content-Length': '999999' } }),
    () => new Response(new Uint8Array(128 * 1024 + 1), { headers: { 'Content-Type': 'image/png' } }),
    () => {
      const bytes = Buffer.from(PNG);
      bytes.writeUInt32BE(10000, 16);
      return new Response(bytes, { headers: { 'Content-Type': 'image/png' } });
    },
    () => new Response(null, { status: 302, headers: { location: 'http://127.0.0.1' } }),
  ])('rejects invalid, oversized, or redirect image responses before writing', async (response) => {
    vi.mocked(fetch).mockResolvedValueOnce(response());
    await expect(serve()).rejects.toMatchObject({ code: 'AVATAR_UNAVAILABLE' });
    expect(mocks.eval).toHaveBeenCalledOnce();
  });

  it('bounds download time and sanitizes upstream failures', async () => {
    vi.useFakeTimers();
    vi.mocked(fetch).mockImplementationOnce(
      (_url, options) =>
        new Promise((_resolve, reject) => {
          options?.signal?.addEventListener('abort', () => reject(new Error('secret-url-and-token')));
        }),
    );
    try {
      const result = expect(serve()).rejects.toMatchObject({
        statusCode: 502,
        message: 'Profile image is temporarily unavailable.',
      });
      await vi.advanceTimersByTimeAsync(5_000);
      await result;
    } finally {
      vi.useRealTimers();
    }
  });

  it('refetches a corrupted cache entry instead of returning its contents', async () => {
    mocks.eval.mockResolvedValueOnce(Buffer.from('<script>private</script>').toString('base64'));
    expect(Buffer.from(await (await serve()).arrayBuffer())).toEqual(PNG);
    expect(fetch).toHaveBeenCalledOnce();
  });
});
