import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  COMPATIBLE_SDK_VERSION,
  DiscordActivityClient,
  readLaunchParams,
  type MessageChannel,
} from '../../../src/features/poker/components/discord-activity-client';

const CLIENT_ID = '100000000000000001';
const LAUNCH = readLaunchParams('?frame_id=f1&instance_id=i-live&platform=desktop')!;

function fakeChannel() {
  const sent: unknown[] = [];
  let handler: ((origin: string, data: unknown) => void) | null = null;
  const channel: MessageChannel = {
    ownOrigin: `https://${CLIENT_ID}.discordsays.com`,
    post: (message) => sent.push(message),
    listen: (next) => {
      handler = next;
      return () => {
        handler = null;
      };
    },
  };
  return {
    channel,
    sent,
    deliver: (origin: string, data: unknown) => handler?.(origin, data),
    listening: () => handler !== null,
  };
}

afterEach(() => {
  vi.useRealTimers();
});

describe('Discord Activity client', () => {
  it('reads only complete launch parameters', () => {
    expect(LAUNCH).toEqual({ frameId: 'f1', instanceId: 'i-live', platform: 'desktop', mobileAppVersion: null });
    expect(readLaunchParams('?frame_id=f1&instance_id=i')).toBeNull();
    expect(readLaunchParams('?frame_id=f1&instance_id=i&platform=tv')).toBeNull();
    expect(readLaunchParams('')).toBeNull();
  });

  it('handshakes, waits for READY and returns the authorization code', async () => {
    const fake = fakeChannel();
    const client = new DiscordActivityClient(CLIENT_ID, LAUNCH, fake.channel, () => 'nonce-1');
    expect(fake.sent[0]).toEqual([
      0,
      { v: 1, encoding: 'json', client_id: CLIENT_ID, frame_id: 'f1', sdk_version: COMPATIBLE_SDK_VERSION },
    ]);
    const ready = client.ready();
    fake.deliver('https://discord.com', [1, { cmd: 'DISPATCH', evt: 'READY', data: {} }]);
    await ready;
    const code = client.authorize(['identify', 'guilds.members.read']);
    expect(fake.sent[1]).toEqual([
      1,
      {
        cmd: 'AUTHORIZE',
        args: { client_id: CLIENT_ID, response_type: 'code', state: '', scope: ['identify', 'guilds.members.read'] },
        nonce: 'nonce-1',
      },
    ]);
    fake.deliver('https://discord.com', [1, { cmd: 'AUTHORIZE', nonce: 'nonce-1', data: { code: 'abc123' } }]);
    await expect(code).resolves.toBe('abc123');
  });

  it('ignores messages from other origins and other nonces', async () => {
    vi.useFakeTimers();
    const fake = fakeChannel();
    const client = new DiscordActivityClient(CLIENT_ID, LAUNCH, fake.channel, () => 'nonce-1');
    const code = client.authorize(['identify'], 1000);
    fake.deliver('https://evil.example', [1, { cmd: 'AUTHORIZE', nonce: 'nonce-1', data: { code: 'stolen' } }]);
    fake.deliver('https://discord.com', [1, { cmd: 'AUTHORIZE', nonce: 'other', data: { code: 'wrong' } }]);
    fake.deliver('https://discord.com', 'not a frame');
    const outcome = expect(code).rejects.toMatchObject({ code: 'COMMAND_TIMEOUT' });
    await vi.advanceTimersByTimeAsync(1001);
    await outcome;
  });

  it('rejects Discord errors and malformed codes without leaking details beyond a short message', async () => {
    const fake = fakeChannel();
    let n = 0;
    const client = new DiscordActivityClient(CLIENT_ID, LAUNCH, fake.channel, () => `nonce-${(n += 1)}`);
    const denied = client.authorize(['identify']);
    fake.deliver('https://discord.com', [
      1,
      { cmd: 'AUTHORIZE', evt: 'ERROR', nonce: 'nonce-1', data: { code: 5000, message: 'User cancelled' } },
    ]);
    await expect(denied).rejects.toMatchObject({ code: 'DISCORD_ERROR', message: 'User cancelled' });
    const malformed = client.authorize(['identify']);
    fake.deliver('https://discord.com', [1, { cmd: 'AUTHORIZE', nonce: 'nonce-2', data: { code: 42 } }]);
    await expect(malformed).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  });

  it('omits the SDK version for old mobile clients and stops listening when closed', async () => {
    const fake = fakeChannel();
    const mobile = readLaunchParams('?frame_id=f1&instance_id=i&platform=mobile&mobile_app_version=249.0')!;
    const client = new DiscordActivityClient(CLIENT_ID, mobile, fake.channel);
    expect((fake.sent[0] as [number, Record<string, unknown>])[1]).not.toHaveProperty('sdk_version');
    const pending = client.authorize(['identify']);
    client.close();
    expect(fake.listening()).toBe(false);
    await expect(pending).rejects.toMatchObject({ code: 'CLOSED' });
  });
});
