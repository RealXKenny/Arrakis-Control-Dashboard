import { EventEmitter } from 'node:events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChatMessage } from '../../../src/features/chat/contracts';

const fixture = vi.hoisted(() => ({
  receive: undefined as ((route: string, message: { content: Buffer }) => Promise<void>) | undefined,
  notify: undefined as ((channel: string, payload: string) => void) | undefined,
  redis: { command: vi.fn(), eval: vi.fn(), close: vi.fn() },
  transportStop: vi.fn(),
}));
vi.mock('../../../src/lib/redis/client', () => ({ getRedisClient: () => fixture.redis }));
vi.mock('../../../src/lib/redis/subscriber', () => ({
  createRedisPatternSubscriber: vi.fn(async (_pattern, notify) => {
    fixture.notify = notify;
    return { close: vi.fn() };
  }),
}));
vi.mock('../../../src/features/chat/server/config', () => {
  const config = {
    funcomId: 'Dashboard#0001',
    discordBotFuncomId: 'DiscordBot#0001',
    servers: [
      { id: 'hagga-basin', map: 'HaggaBasin.0', label: 'Hagga Basin' },
      { id: 'deep-desert', map: 'DeepDesert_1.0', label: 'Deep Desert' },
    ],
    healthHost: '127.0.0.1',
    healthPort: 2010,
    historyRetentionDays: 7,
    historyMaxMessages: 10000,
  };
  return {
    getChatConfig: () => config,
    getChatServer: (id: string) => config.servers.find((entry) => entry.id === id),
  };
});
vi.mock('../../../src/features/chat/server/player-names', () => ({
  ChatPlayerNames: class {
    resolve = async (id: string) => (id === 'Player#1234' ? 'Actual Player' : id);
  },
}));
vi.mock('../../../src/features/chat/server/rabbitmq', () => ({
  PermanentChatMessageError: class extends Error {},
  RabbitChatTransport: class {
    constructor(_config: unknown, receive: typeof fixture.receive) {
      fixture.receive = receive;
    }
    start = vi.fn();
    stop = fixture.transportStop;
    ready = true;
    metrics = {};
  },
}));
vi.mock('node:http', () => ({
  createServer: () =>
    Object.assign(new EventEmitter(), {
      listen: (_port: number, _host: string, done: () => void) => done(),
      close: (done: () => void) => done(),
    }),
}));
vi.mock('../../../src/features/auth/server/session', () => ({ getSession: async () => ({ user: { id: 'member' } }) }));

import { runChatBridge } from '../../../src/features/chat/server/worker';
import { createChatGateway } from '../../../src/features/chat/server/gateway';
import { readChatHistory } from '../../../src/features/chat/server/history';
import { encodeMapChat } from '../../../src/features/chat/server/protocol';

const readers: ReadableStreamDefaultReader<Uint8Array>[] = [];
let stop: (() => Promise<void>) | undefined;
beforeEach(() => {
  vi.clearAllMocks();
  const entries = new Map<string, Array<[string, string[]]>>();
  const events = new Map<string, string>();
  let sequence = 0;
  fixture.redis.eval.mockImplementation(async (_script, keys: string[], args: unknown[]) => {
    if (events.has(keys[1])) return [events.get(keys[1]), 0];
    const id = `${Date.now()}-${++sequence}`;
    const stream = entries.get(keys[0]) ?? [];
    stream.push([id, ['payload', String(args[0])]]);
    entries.set(keys[0], stream);
    events.set(keys[1], id);
    return [id, 1];
  });
  fixture.redis.command.mockImplementation(async ([operation, key, start, end]: string[]) => {
    if (operation === 'PUBLISH') {
      fixture.notify?.(key, start);
      return 1;
    }
    if (operation === 'XREVRANGE') return [...(entries.get(key) ?? [])].reverse();
    if (operation === 'XRANGE') return (entries.get(key) ?? []).filter(([id]) => (start === end ? id === start : true));
    return 'PONG';
  });
});
afterEach(async () => {
  for (const reader of readers.splice(0)) await reader.cancel();
  await stop?.();
  stop = undefined;
});
async function readThrough(reader: ReadableStreamDefaultReader<Uint8Array>, marker: string) {
  let text = '';
  while (!text.includes(marker)) {
    const next = await reader.read();
    if (next.done) break;
    text += new TextDecoder().decode(next.value);
  }
  return text;
}
async function subscribe() {
  const response = await createChatGateway(
    new Request('https://fixture.test/api/v2/chat/stream?server=hagga-basin'),
    'session',
  );
  const reader = response.body!.getReader();
  readers.push(reader);
  await readThrough(reader, ': connected');
  return reader;
}
describe('incoming game → persistence → Pub/Sub → SSE pipeline (Redis/AMQP fixtures)', () => {
  it('persists and forwards Discord identity/name metadata while keeping prefix imitations as Game', async () => {
    stop = await runChatBridge();
    const reader = await subscribe();
    const text = '[Discord] [Owner] Kenny: Test <img src=x>\nSecond line';
    await fixture.receive!('HaggaBasin.0', {
      content: encodeMapChat('DiscordBot#0001', text, undefined, 'DISCORD-1').body,
    });
    const live = await readThrough(reader, 'event: message');
    const message = JSON.parse(live.split('data: ')[1].split('\n')[0]);
    expect(message).toMatchObject({
      source: 'discord',
      senderId: 'DiscordBot#0001',
      senderName: 'Kenny',
      content: text,
      relayContent: 'Test <img src=x>\nSecond line',
    });
    await fixture.receive!('HaggaBasin.0', {
      content: encodeMapChat('Player#1234', text, undefined, 'GAME-IMITATION').body,
    });
    const history = (await readChatHistory('hagga-basin')).messages;
    expect(history.find((entry) => entry.id === 'DISCORD-1')).toMatchObject({ source: 'discord', senderName: 'Kenny' });
    expect(history.find((entry) => entry.id === 'GAME-IMITATION')).toMatchObject({
      source: 'game',
      senderName: 'Actual Player',
      content: text,
    });
  });
  it('forwards the actual player, original text and timestamp to multiple subscribers once and restores history', async () => {
    stop = await runChatBridge();
    expect(fixture.receive).toBeTypeOf('function'); // Consumer starts without a page or send request.
    const first = await subscribe();
    const second = await subscribe();
    const original = new Date('2026-01-01T12:34:56Z');
    const event = encodeMapChat('Player#1234', 'Original <text>\nSecond line', undefined, 'GAME-ID-1', original);
    await fixture.receive!('HaggaBasin.0', { content: event.body });
    for (const reader of [first, second]) {
      const output = await readThrough(reader, 'event: message');
      const message: ChatMessage = JSON.parse(output.split('data: ')[1].split('\n')[0]);
      expect(message).toMatchObject({
        id: event.id,
        externalEventId: event.id,
        senderId: 'Player#1234',
        senderName: 'Actual Player',
        content: 'Original <text>\nSecond line',
        timestamp: original.toISOString(),
        source: 'game',
        serverId: 'hagga-basin',
      });
    }
    expect(fixture.redis.eval.mock.invocationCallOrder[0]).toBeLessThan(
      fixture.redis.command.mock.invocationCallOrder[
        fixture.redis.command.mock.calls.findIndex(([args]) => args[0] === 'PUBLISH')
      ],
    );
    await fixture.receive!('HaggaBasin.0', { content: event.body });
    expect(fixture.redis.command.mock.calls.filter(([args]) => args[0] === 'PUBLISH')).toHaveLength(1);
    expect((await readChatHistory('hagga-basin')).messages).toHaveLength(1);
    expect((await readChatHistory('deep-desert')).messages).toEqual([]);
    const refreshed = await createChatGateway(
      new Request('https://fixture.test/api/v2/chat/stream?server=hagga-basin'),
      'session',
    );
    const reader = refreshed.body!.getReader();
    readers.push(reader);
    expect(await readThrough(reader, ': connected')).toContain('Actual Player');
  });
  it('rejects wrong-case routes and malformed messages, suppresses only the configured persona, and propagates persistence failure', async () => {
    stop = await runChatBridge();
    const game = encodeMapChat('Player#1234', 'hello');
    await expect(fixture.receive!('haggabasin.0', { content: game.body })).rejects.toThrow();
    await expect(fixture.receive!('HaggaBasin.0', { content: Buffer.from('bad') })).rejects.toThrow();
    await fixture.receive!('HaggaBasin.0', { content: encodeMapChat('Dashboard#0001', 'echo').body });
    expect(fixture.redis.eval).not.toHaveBeenCalled();
    fixture.redis.eval.mockRejectedValueOnce(new Error('Persistence unavailable'));
    await expect(fixture.receive!('HaggaBasin.0', { content: game.body })).rejects.toThrow('Persistence unavailable');
    expect(fixture.redis.command.mock.calls.filter(([args]) => args[0] === 'PUBLISH')).toHaveLength(0);
  });
});
