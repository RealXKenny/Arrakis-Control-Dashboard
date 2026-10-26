import { afterEach, expect, it, vi } from 'vitest';
import { ReadCache } from '../../src/lib/read-cache';
afterEach(() => {
  vi.useRealTimers();
});
it('coalesces simultaneous reads, caches for 30 seconds and supports forced refresh', async () => {
  vi.useFakeTimers();
  const cache = new ReadCache<number>(
    () => 1,
    () => true,
  );
  const load = vi.fn().mockResolvedValue(10);
  await Promise.all([cache.get('a', load), cache.get('a', load)]);
  await vi.advanceTimersByTimeAsync(29999);
  await cache.get('a', load);
  expect(load).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(1);
  await cache.get('a', load);
  expect(load).toHaveBeenCalledTimes(2);
  await cache.get('a', load, true);
  expect(load).toHaveBeenCalledTimes(3);
});
it('does not cache failures and isolates keys', async () => {
  const cache = new ReadCache<number>(
    () => 1,
    (value) => value > 0,
  );
  const load = vi.fn().mockResolvedValue(0);
  await cache.get('a', load);
  await cache.get('a', load);
  expect(load).toHaveBeenCalledTimes(2);
  load.mockResolvedValue(1);
  await cache.get('a', load);
  await cache.get('b', load);
  expect(load).toHaveBeenCalledTimes(4);
  await expect(
    cache.get('error', async () => {
      throw new Error('down');
    }),
  ).rejects.toThrow();
  expect((await cache.get('error', async () => 2)).data).toBe(2);
});
it('does not resurrect an invalidated in-flight reading', async () => {
  const cache = new ReadCache<number>(
    () => 1,
    () => true,
  );
  let finish: (value: number) => void = () => undefined;
  const pending = cache.get(
    'user:a',
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  cache.clear('user:');
  finish(1);
  await pending;
  expect((await cache.get('user:a', async () => 2)).data).toBe(2);
});

it('coalesces a burst but rejects distinct work beyond the pending budget', async () => {
  const cache = new ReadCache<number>(
    () => 1,
    () => true,
    { maxPending: 1 },
  );
  let finish: (value: number) => void;
  const load = vi.fn(
    () =>
      new Promise<number>((resolve) => {
        finish = resolve;
      }),
  );
  const burst = Array.from({ length: 1000 }, () => cache.get('shared', load));
  const overflow = vi.fn().mockResolvedValue(2);
  await expect(cache.get('other', overflow)).rejects.toMatchObject({ statusCode: 503, code: 'SERVER_BUSY' });
  expect(load).toHaveBeenCalledTimes(1);
  expect(overflow).not.toHaveBeenCalled();
  finish!(1);
  await Promise.all(burst);
  expect((await cache.get('other', overflow)).data).toBe(2);
});
