import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cachedFetch, clearClientReadCache } from '../../src/lib/client-cache';
let storage: Record<string, string>;
const identity = (scope = 'a') =>
  Response.json({ ok: true, cacheScope: scope.repeat(64), expiresAt: Date.now() + 60000 });
beforeEach(() => {
  storage = {};
  vi.stubGlobal('sessionStorage', {
    getItem: (key: string) => storage[key] ?? null,
    setItem: (key: string, value: string) => {
      storage[key] = value;
    },
    removeItem: (key: string) => {
      delete storage[key];
    },
  });
  clearClientReadCache();
});
afterEach(() => {
  clearClientReadCache();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
it('avoids repeated private API fetches inside the 30-second window', async () => {
  const fetcher = vi
    .fn()
    .mockImplementation(async (url: string) => (url === '/api/session' ? identity() : Response.json({ value: 1 })));
  vi.stubGlobal('fetch', fetcher);
  await cachedFetch('/api/player');
  await cachedFetch('/api/player');
  expect(fetcher.mock.calls.filter(([url]) => url === '/api/player')).toHaveLength(1);
  await cachedFetch('/api/player', { force: true });
  expect(fetcher.mock.calls.filter(([url]) => url === '/api/player')).toHaveLength(2);
});
it('revalidates stale data and does not reuse snapshots for another account', async () => {
  vi.useFakeTimers();
  let scope = 'a';
  let value = 1;
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockImplementation(async (url: string) => (url === '/api/session' ? identity(scope) : Response.json({ value }))),
  );
  await cachedFetch('/api/player');
  await vi.advanceTimersByTimeAsync(30001);
  value = 2;
  const onCached = vi.fn(async (response: Response) => {
    expect(await response.json()).toEqual({ value: 1 });
  });
  expect(await (await cachedFetch('/api/player', { onCached })).json()).toEqual({ value: 2 });
  expect(onCached).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(30001);
  scope = 'b';
  value = 3;
  const otherCached = vi.fn();
  expect(await (await cachedFetch('/api/player', { onCached: otherCached })).json()).toEqual({ value: 3 });
  expect(otherCached).not.toHaveBeenCalled();
});
it('does not restore private data when session validation fails', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 401 })));
  expect((await cachedFetch('/api/player')).status).toBe(401);
});
it('discards a session validation that completes after logout', async () => {
  let finish!: (response: Response) => void;
  vi.stubGlobal(
    'fetch',
    vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          finish = resolve;
        }),
    ),
  );
  const pending = cachedFetch('/api/player');
  clearClientReadCache();
  finish(identity());
  await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
});
