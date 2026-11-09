import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { discordContainer } from '../../../src/lib/discord-components';

const state = vi.hoisted(() => ({
  values: new Map<string, unknown>(),
  env: { DISCORD_BOT_TOKEN: 'disposable-test-token', DISCORD_GUILD_ID: '123456789012345678' },
  set: vi.fn(),
}));
vi.mock('../../../src/lib/assert-server', () => ({}));
vi.mock('../../../src/config/env', () => ({ getServerEnv: () => state.env }));
vi.mock('../../../src/lib/redis/client', () => ({
  getRedisClient: () => ({
    get: async (key: string) => state.values.get(key) ?? null,
    set: state.set,
    del: async (key: string) => state.values.delete(key),
    eval: async (_: unknown, keys: string[], args: string[]) => {
      if (state.values.get(keys[0]) === args[0]) state.values.delete(keys[0]);
      return 1;
    },
  }),
}));
import { syncDiscordAnnouncement, removeDiscordAnnouncement } from '../../../src/server/integrations/discord-bot';
const channel = '1539748867833200640';
const message = '1539748867833200641';
const key = 'arrakis:{test}:announcement';
const payload = discordContainer('# Competition');
const fetcher = vi.fn();
beforeEach(() => {
  state.values.clear();
  vi.clearAllMocks();
  state.set.mockImplementation(async (key: string, value: unknown, options?: { nx?: boolean }) => {
    if (options?.nx && state.values.has(key)) return null;
    state.values.set(key, value);
    return 'OK';
  });
  fetcher.mockImplementation(async (url: string) =>
    url.endsWith(`/channels/${channel}`)
      ? Response.json({ id: channel, guild_id: state.env.DISCORD_GUILD_ID, type: 0 })
      : Response.json({ id: message }),
  );
  vi.stubGlobal('fetch', fetcher);
});
afterEach(() => vi.unstubAllGlobals());

describe('shared bot announcements', () => {
  it('retires only known owned message IDs and accepts an already deleted message', async () => {
    await syncDiscordAnnouncement(key, channel, payload);
    fetcher.mockImplementation(async (_url: string, options: { method: string }) =>
      options.method === 'DELETE'
        ? new Response(null, { status: 204 })
        : Response.json({ guild_id: state.env.DISCORD_GUILD_ID, type: 0 }),
    );
    expect(await removeDiscordAnnouncement(key, channel)).toEqual({ status: 'removed' });
    expect(state.values.has(key)).toBe(false);
    expect(await removeDiscordAnnouncement(key, channel)).toEqual({ status: 'unchanged' });
  });
  it('resolves current event visibility under its lease and skips private announcements', async () => {
    const source = vi.fn(async () => {
      expect(state.values.has(`${key}:lock`)).toBe(true);
      return null;
    });
    expect(await syncDiscordAnnouncement(key, channel, source)).toEqual({ status: 'unchanged' });
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('uses bot authorization, V2 containers, fixed Discord origin and persisted identity for edits', async () => {
    expect(await syncDiscordAnnouncement(key, channel, payload)).toEqual({ status: 'sent', edited: false });
    expect(fetcher).toHaveBeenCalledTimes(2);
    const [url, options] = fetcher.mock.calls[1];
    expect(url).toBe(`https://discord.com/api/v10/channels/${channel}/messages`);
    expect(options.headers.Authorization).toBe('Bot disposable-test-token');
    expect(options.redirect).toBe('error');
    expect(JSON.parse(options.body)).toMatchObject({
      flags: 32768,
      allowed_mentions: { parse: [] },
      enforce_nonce: true,
    });
    expect(state.values.get(key)).toMatchObject({ messageId: message, outcome: 'sent' });
    expect(await syncDiscordAnnouncement(key, channel, payload)).toEqual({ status: 'unchanged' });
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(await syncDiscordAnnouncement(key, channel, discordContainer('# Updated'))).toEqual({
      status: 'sent',
      edited: true,
    });
    expect(fetcher.mock.calls.at(-1)?.[0]).toBe(`https://discord.com/api/v10/channels/${channel}/messages/${message}`);
    expect(fetcher.mock.calls.at(-1)?.[1].method).toBe('PATCH');
  });

  it('does not resend an uncertain creation, even after later calls', async () => {
    fetcher.mockImplementation(async (url: string) => {
      if (url.endsWith('/messages')) throw new Error('credential-bearing raw provider failure');
      return Response.json({ guild_id: state.env.DISCORD_GUILD_ID, type: 0 });
    });
    expect(await syncDiscordAnnouncement(key, channel, payload)).toEqual({ status: 'unknown' });
    expect(await syncDiscordAnnouncement(key, channel, payload)).toEqual({ status: 'unknown' });
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(state.values.get(key)).toMatchObject({ outcome: 'unknown' });
  });

  it('persists the send intent before any external POST, and refuses concurrent workers', async () => {
    fetcher.mockImplementation(async (url: string) => {
      if (url.endsWith('/messages')) {
        expect(state.values.get(key)).toMatchObject({ outcome: 'unknown' });
        expect(await syncDiscordAnnouncement(key, channel, payload)).toEqual({ status: 'busy' });
        return Response.json({ id: message });
      }
      return Response.json({ guild_id: state.env.DISCORD_GUILD_ID, type: 0 });
    });
    expect((await syncDiscordAnnouncement(key, channel, payload)).status).toBe('sent');
  });

  it('sanitizes channel access failures and never posts to another guild', async () => {
    fetcher.mockResolvedValue(Response.json({ guild_id: 'wrong', type: 0, secret: 'never-echo' }));
    await expect(syncDiscordAnnouncement(key, channel, payload)).rejects.toThrow('configured Discord server');
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(state.values.has(key)).toBe(false);
  });

  it('backs off rate limits across channels, preserving a definitive rejection', async () => {
    fetcher.mockImplementation(async (url: string) =>
      url.endsWith('/messages')
        ? Response.json({ secret: 'not returned' }, { status: 429, headers: { 'retry-after': '120' } })
        : Response.json({ guild_id: state.env.DISCORD_GUILD_ID, type: 0 }),
    );
    expect((await syncDiscordAnnouncement(key, channel, payload)).status).toBe('failed');
    expect(state.set).toHaveBeenCalledWith('arrakis:{discord-bot}:cooldown', '1', { ex: 120 });
    expect((await syncDiscordAnnouncement('another', channel, payload)).status).toBe('busy');
    expect(state.values.get(key)).toMatchObject({ outcome: 'rejected' });
  });

  it('treats server errors and malformed successful responses as uncertain, never as success', async () => {
    for (const response of [new Response('oops', { status: 502 }), new Response('bad json'), new Response('null')]) {
      state.values.clear();
      fetcher.mockImplementation(async (url: string) =>
        url.endsWith('/messages') ? response : Response.json({ guild_id: state.env.DISCORD_GUILD_ID, type: 0 }),
      );
      expect((await syncDiscordAnnouncement(key, channel, payload)).status).toBe('unknown');
      expect((await syncDiscordAnnouncement(key, channel, payload)).status).toBe('unknown');
    }
  });
});
