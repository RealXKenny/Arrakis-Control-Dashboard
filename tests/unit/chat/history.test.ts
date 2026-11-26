import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChatMessage } from '../../../src/features/chat/contracts';

const redis = vi.hoisted(() => ({ command: vi.fn(), eval: vi.fn() }));
vi.mock('../../../src/lib/redis/client', () => ({ getRedisClient: () => redis }));
vi.mock('../../../src/features/chat/server/config', () => ({
  getChatConfig: () => ({ discordBotFuncomId: 'Relay#1234' }),
}));

import {
  parseChatStreamEntries,
  appendChatMessage,
  readChatHistory,
  reconcileChatMessages,
  setChatDelivery,
  withCurrentDelivery,
} from '../../../src/features/chat/server/history';

function stored(id: string, serverId = 'hagga-basin', overrides: Partial<ChatMessage> = {}) {
  return {
    id,
    serverId,
    senderId: 'Player#1234',
    senderName: 'Test Player',
    source: 'game',
    content: `Message ${id}`,
    timestamp: new Date().toISOString(),
    correlationId: id,
    ...overrides,
  };
}

const entry = (streamId: string, payload: unknown) => [
  streamId,
  ['payload', typeof payload === 'string' ? payload : JSON.stringify(payload)],
];

beforeEach(() => {
  vi.clearAllMocks();
  redis.command.mockResolvedValue([]);
});

describe('Redis Stream destination validation', () => {
  it('recognizes older stored relays only by the trusted bot ID and preserves original text', () => {
    const text = '[Discord] [Owner] Kenny: Test';
    const parsed = parseChatStreamEntries(
      [
        entry('1-0', stored('discord', 'hagga-basin', { senderId: 'Relay#1234', content: text })),
        entry('2-0', stored('player', 'hagga-basin', { senderId: 'Player#9876', content: text })),
      ],
      'hagga-basin',
    );
    expect(parsed.messages[0]).toMatchObject({
      source: 'discord',
      senderName: 'Kenny',
      content: text,
      relayContent: 'Test',
    });
    expect(parsed.messages[1]).toMatchObject({ source: 'game', senderName: 'Test Player', content: text });
    expect(redis.eval).not.toHaveBeenCalled();
  });
  it('rejects mismatched, malformed and invalid entries while keeping their IDs for cursors', () => {
    const parsed = parseChatStreamEntries(
      [
        entry('1-0', stored('ok')),
        entry('2-0', stored('foreign', 'deep-desert')),
        entry('3-0', stored('bad-destination', 'Deep Desert}')),
        entry('4-0', '{not json'),
        entry('5-0', { ...stored('no-content'), content: '' }),
        entry('6-0', [stored('array')]),
        ['7-0', ['other', 'field']],
        'garbage',
      ],
      'hagga-basin',
    );
    expect(parsed.messages.map((message) => message.id)).toEqual(['ok']);
    expect(parsed.ids).toEqual(['1-0', '2-0', '3-0', '4-0', '5-0', '6-0', '7-0']);
  });

  it('filters foreign entries from initial history and cursor pagination', async () => {
    redis.command.mockResolvedValueOnce([
      entry('3-0', stored('newest')),
      entry('2-0', stored('leaked', 'deep-desert')),
      entry('1-0', stored('oldest')),
    ]);
    const page = await readChatHistory('hagga-basin', { limit: 2 });
    expect(page.messages.map((message) => message.id)).toEqual(['newest']);
    // The page still covered two Stream entries, so the next page starts below the rejected one.
    expect(page.nextCursor).toBe('2-0');
    const [command, key, start, floor] = redis.command.mock.calls[0][0];
    expect([command, key, start]).toEqual(['XREVRANGE', 'arrakis:{chat:hagga-basin}:messages', '+']);
    expect(floor).toMatch(/^\d+-0$/);

    redis.command.mockResolvedValueOnce([entry('1-0', stored('leaked-older', 'deep-desert'))]);
    const older = await readChatHistory('hagga-basin', { before: '2-0' });
    expect(older).toEqual({ messages: [], nextCursor: null });
  });

  it('filters foreign entries from reconciliation and replay and advances past them', async () => {
    const now = Date.now();
    redis.command.mockResolvedValueOnce([
      entry(`${now}-0`, stored('mine')),
      entry(`${now}-1`, stored('foreign', 'deep-desert')),
    ]);
    const result = await reconcileChatMessages('hagga-basin', `${now - 1_000}-0`);
    expect(result.messages.map((message) => message.id)).toEqual(['mine']);
    expect(result.cursor).toBe(`${now}-1`);
  });

  it('never reads below the retention floor, so expired history cannot loop', async () => {
    await readChatHistory('hagga-basin', { after: '1-0', retentionMs: 60_000 });
    const [, , start] = redis.command.mock.calls[0][0];
    expect(Number(start.split('-')[0])).toBeGreaterThan(Date.now() - 61_000);
    expect(start.startsWith('(')).toBe(false);
  });

  it('rejects unsafe destination IDs and malformed cursors before touching Redis', async () => {
    await expect(readChatHistory('bad}{slot')).rejects.toThrow('Invalid chat destination.');
    await expect(readChatHistory('hagga-basin', { before: '1-0; FLUSHALL' })).rejects.toThrow('cursor');
    expect(redis.command).not.toHaveBeenCalled();
  });
});

describe('dashboard delivery state', () => {
  const outgoing = (timestamp = new Date().toISOString()) =>
    ({ ...stored('AB12', 'hagga-basin', { source: 'dashboard', timestamp }), streamId: '5-0' }) as ChatMessage;

  it('does not broadcast pending or failed dashboard messages', async () => {
    redis.eval.mockResolvedValueOnce(['5-0', 1]);
    await appendChatMessage({ ...outgoing(), delivery: 'pending' });
    redis.eval.mockResolvedValueOnce('failed');
    await setChatDelivery({ ...outgoing(), delivery: 'pending' }, 'failed');
    expect(redis.command.mock.calls.filter(([args]) => args[0] === 'PUBLISH')).toHaveLength(0);
  });

  it('hides unpublished records from shared history while pagination advances past them', async () => {
    redis.command
      .mockResolvedValueOnce([
        entry('3-0', stored('failed-private', 'hagga-basin', { source: 'dashboard', delivery: 'pending' })),
        entry('2-0', stored('pending-private', 'hagga-basin', { source: 'dashboard', delivery: 'pending' })),
        entry('1-0', stored('sent-public', 'hagga-basin', { source: 'dashboard', delivery: 'pending' })),
      ])
      .mockResolvedValueOnce(['failed', 'pending']);
    expect(await readChatHistory('hagga-basin', { limit: 2 })).toEqual({ messages: [], nextCursor: '2-0' });
    redis.command
      .mockResolvedValueOnce([
        entry('1-0', stored('sent-public', 'hagga-basin', { source: 'dashboard', delivery: 'pending' })),
      ])
      .mockResolvedValueOnce(['published']);
    expect((await readChatHistory('hagga-basin', { before: '2-0' })).messages.map((message) => message.id)).toEqual([
      'sent-public',
    ]);
  });

  it('overlays the current state and reports a stale pending send as unknown', async () => {
    redis.command.mockResolvedValueOnce(['published']);
    expect((await withCurrentDelivery('hagga-basin', [outgoing()]))[0].delivery).toBe('published');
    expect(redis.command).toHaveBeenLastCalledWith(['MGET', 'arrakis:{chat:hagga-basin}:delivery:AB12']);

    redis.command.mockResolvedValueOnce(['pending']);
    const stale = outgoing(new Date(Date.now() - 10 * 60_000).toISOString());
    expect((await withCurrentDelivery('hagga-basin', [stale]))[0].delivery).toBe('unknown');
  });

  it('updates state atomically in the destination slot without rewriting the Stream entry', async () => {
    redis.eval.mockResolvedValueOnce('published');
    const updated = await setChatDelivery({ ...outgoing(), delivery: 'pending' }, 'published');
    expect(updated?.delivery).toBe('published');
    const [, keys, args] = redis.eval.mock.calls[0];
    expect(keys).toEqual(['arrakis:{chat:hagga-basin}:delivery:AB12']);
    expect(args[0]).toBe('published');
    expect(args.slice(1)).toEqual(['pending', 'unknown']);
    expect(redis.command).toHaveBeenCalledWith(['PUBLISH', 'arrakis:chat:live:hagga-basin', expect.any(String)]);
    expect(redis.command.mock.calls.some(([args]) => args[0] === 'XADD')).toBe(false);
  });

  it('reports an expired message instead of recreating its state', async () => {
    redis.eval.mockResolvedValueOnce(null);
    expect(await setChatDelivery({ ...outgoing(), delivery: 'pending' }, 'failed')).toBeNull();
  });
});
