import { beforeEach, describe, expect, it, vi } from 'vitest';
import { discordContainer } from '../../../src/lib/discord-components';
const mocks = vi.hoisted(() => ({ values: new Map<string, unknown>(), sync: vi.fn(), remove: vi.fn() }));
vi.mock('../../../src/lib/assert-server', () => ({}));
vi.mock('node:timers/promises', () => ({ setTimeout: vi.fn().mockResolvedValue(undefined) }));
vi.mock('../../../src/server/integrations/discord-bot', () => ({
  syncDiscordAnnouncement: mocks.sync,
  removeDiscordAnnouncement: mocks.remove,
}));
vi.mock('../../../src/lib/redis/client', () => ({
  getRedisClient: () => ({
    get: async (key: string) => mocks.values.get(key) ?? null,
    set: async (key: string, value: unknown, options?: { nx?: boolean }) => {
      if (options?.nx && mocks.values.has(key)) return null;
      mocks.values.set(key, value);
      return 'OK';
    },
    eval: async (script: string, keys: string[], args: string[]) => {
      if (mocks.values.get(keys[0]) !== args[0]) return 0;
      if (script.includes("'DEL'")) mocks.values.delete(keys[0]);
      return 1;
    },
  }),
}));
import { syncChangelogSeries } from '../../../src/features/changelog/server/discord-series';
const key = 'arrakis:{cl}:v2:bot:release:2.0.0';
const channel = '1538602111951175794';
const pages = [discordContainer('Part one'), discordContainer('Part two'), discordContainer('Part three')];
beforeEach(() => {
  mocks.values.clear();
  vi.clearAllMocks();
  mocks.sync.mockResolvedValue({ status: 'sent', edited: false });
  mocks.remove.mockResolvedValue({ status: 'removed' });
});

describe('tracked announcement series', () => {
  it('retries only a confirmed short rate-limit rejection', async () => {
    mocks.sync
      .mockResolvedValueOnce({ status: 'failed', retryAfterSeconds: 1 })
      .mockResolvedValue({ status: 'sent', edited: false });
    await syncChangelogSeries(key, channel, pages.slice(0, 1));
    expect(mocks.sync).toHaveBeenCalledTimes(2);
  });
  it('preserves the original message key and tracks every continuation', async () => {
    expect(await syncChangelogSeries(key, channel, pages)).toEqual({ edited: false, parts: 3 });
    expect(mocks.sync.mock.calls.map((call) => call[0])).toEqual([key, `${key}:part:2`, `${key}:part:3`]);
    expect(mocks.values.get(`${key}:series`)).toBe(3);
    mocks.sync.mockResolvedValue({ status: 'unchanged' });
    expect(await syncChangelogSeries(key, channel, pages)).toEqual({ edited: true, parts: 3 });
  });
  it('removes surplus tracked messages when a release becomes shorter', async () => {
    mocks.values.set(`${key}:series`, 3);
    await syncChangelogSeries(key, channel, pages.slice(0, 1));
    expect(mocks.remove.mock.calls.map((call) => call[0])).toEqual([`${key}:part:2`, `${key}:part:3`]);
    expect(mocks.values.get(`${key}:series`)).toBe(1);
  });
  it('keeps the high-water mark after a partial unknown send and stops later parts', async () => {
    mocks.sync.mockResolvedValueOnce({ status: 'sent' }).mockResolvedValueOnce({ status: 'unknown' });
    await expect(syncChangelogSeries(key, channel, pages)).rejects.toThrow('unknown');
    expect(mocks.sync).toHaveBeenCalledTimes(2);
    expect(mocks.values.get(`${key}:series`)).toBe(3);
    expect(mocks.values.has(`${key}:series-lock`)).toBe(false);
  });
  it('preserves cleanup tracking if an obsolete part cannot yet be removed', async () => {
    mocks.values.set(`${key}:series`, 3);
    mocks.remove.mockResolvedValue({ status: 'failed' });
    await expect(syncChangelogSeries(key, channel, pages.slice(0, 1))).rejects.toThrow('incomplete');
    expect(mocks.values.get(`${key}:series`)).toBe(3);
  });
  it('rejects concurrent edits of the same series', async () => {
    mocks.values.set(`${key}:series-lock`, 'another instance');
    await expect(syncChangelogSeries(key, channel, pages)).rejects.toThrow('already being updated');
    expect(mocks.sync).not.toHaveBeenCalled();
    expect(mocks.values.get(`${key}:series-lock`)).toBe('another instance');
  });
  it('rejects an invalid manifest and excessive page count before external writes', async () => {
    mocks.values.set(`${key}:series`, 'malformed');
    await expect(syncChangelogSeries(key, channel, pages)).rejects.toThrow('tracking');
    await expect(syncChangelogSeries(key, channel, Array(51).fill(pages[0]))).rejects.toThrow('part count');
    expect(mocks.sync).not.toHaveBeenCalled();
  });
});
