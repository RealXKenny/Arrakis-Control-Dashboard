import type { Redis } from 'ioredis';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { configureApplication, connectDirect, integrationTarget } from './helpers/redis-target';

const target = integrationTarget();
configureApplication(target);
vi.mock('../../src/lib/assert-server', () => ({}));

let direct: Redis;
let history: typeof import('../../src/features/chat/server/history');

function input(id: string, serverId = 'hagga-basin') {
  return {
    id,
    serverId,
    senderId: 'Player#1234',
    senderName: 'Test Player',
    source: 'game' as const,
    content: `Message ${id}`,
    timestamp: new Date().toISOString(),
    correlationId: id,
    externalEventId: id,
  };
}

beforeAll(async () => {
  direct = connectDirect(target);
  history = await import('../../src/features/chat/server/history');
});
afterAll(async () => {
  await direct.quit();
  (globalThis as { arrakisRedisClient?: { close(): void } }).arrakisRedisClient?.close();
});
beforeEach(async () => {
  await direct.flushdb();
});

describe('Redis chat history', () => {
  it('persists once for a stable external event ID and survives a fresh application client', async () => {
    const first = await history.appendChatMessage(input('event-1'));
    const duplicate = await history.appendChatMessage(input('event-1'));
    expect(first.inserted).toBe(true);
    expect(duplicate.inserted).toBe(false);
    expect(duplicate.message.streamId).toBe(first.message.streamId);
    expect(await direct.xlen('arrakis:{chat:hagga-basin}:messages')).toBe(1);

    (globalThis as { arrakisRedisClient?: { close(): void } }).arrakisRedisClient?.close();
    delete (globalThis as { arrakisRedisClient?: unknown }).arrakisRedisClient;
    const recovered = await history.readChatHistory('hagga-basin');
    expect(recovered.messages.map((message) => message.id)).toEqual(['event-1']);
  });

  it('pages chronologically in batches of 50 without duplicate entries', async () => {
    for (let index = 0; index < 55; index++) await history.appendChatMessage(input(`event-${index}`));
    const latest = await history.readChatHistory('hagga-basin');
    expect(latest.messages).toHaveLength(50);
    expect(latest.messages[0].id).toBe('event-5');
    expect(latest.messages.at(-1)?.id).toBe('event-54');
    const older = await history.readChatHistory('hagga-basin', { before: latest.nextCursor! });
    expect(older.messages.map((message) => message.id)).toEqual([
      'event-0',
      'event-1',
      'event-2',
      'event-3',
      'event-4',
    ]);
    expect(older.nextCursor).toBeNull();
  });

  it('enforces count and age bounds and expires deduplication markers', async () => {
    for (let index = 0; index < 15; index++)
      await history.appendChatMessage(input(`event-${index}`), { maxMessages: 10, retentionMs: 60_000 });
    expect(await direct.xlen('arrakis:{chat:hagga-basin}:messages')).toBe(10);
    const dedupKeys = await direct.keys('arrakis:{chat:hagga-basin}:event:*');
    expect(dedupKeys).toHaveLength(15);
    for (const key of dedupKeys) expect(await direct.ttl(key)).toBeGreaterThan(0);

    // Age trimming happens on append: entries older than the window are removed by MINID.
    await history.appendChatMessage(input('old'), { retentionMs: 60_000 });
    await new Promise((resolve) => setTimeout(resolve, 50));
    await history.appendChatMessage(input('new'), { retentionMs: 20 });
    const remaining = await history.readChatHistory('hagga-basin', { retentionMs: 60_000 });
    expect(remaining.messages.map((message) => message.id)).toEqual(['new']);
  });

  it('hides untrimmed expired entries from history, pagination and reconciliation', async () => {
    await history.appendChatMessage(input('aged'), { retentionMs: 60_000 });
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(await direct.xlen('arrakis:{chat:hagga-basin}:messages')).toBe(1);
    expect(await history.readChatHistory('hagga-basin', { retentionMs: 20 })).toEqual({
      messages: [],
      nextCursor: null,
    });
    expect((await history.readChatHistory('hagga-basin', { after: '0-0', retentionMs: 20 })).messages).toEqual([]);
  });

  it('records dashboard delivery state outside the immutable Stream entry and deduplicates resends', async () => {
    const outgoing = {
      ...input('A1B2C3D4E5F60718293A4B5C6D7E8F90'),
      source: 'dashboard' as const,
      delivery: 'pending' as const,
    };
    const first = await history.appendChatMessage(outgoing);
    const deliveryKey = `arrakis:{chat:hagga-basin}:delivery:${outgoing.id}`;
    const originalTtl = await direct.pttl(deliveryKey);
    expect(originalTtl).toBeGreaterThan(0);
    const published = await history.setChatDelivery(first.message, 'published');
    expect(published?.delivery).toBe('published');
    expect(await direct.pttl(deliveryKey)).toBeLessThanOrEqual(originalTtl);
    expect(await direct.pttl(deliveryKey)).toBeGreaterThan(0);
    // An illegal regression is refused and the stored state is reported back.
    expect((await history.setChatDelivery(first.message, 'failed'))?.delivery).toBe('published');
    const resend = await history.appendChatMessage({ ...outgoing, timestamp: new Date().toISOString() });
    expect(resend).toMatchObject({
      inserted: false,
      message: { streamId: first.message.streamId, delivery: 'published' },
    });
    expect(await direct.xlen('arrakis:{chat:hagga-basin}:messages')).toBe(1);
    expect((await history.findChatMessageByEvent('hagga-basin', outgoing.id))?.delivery).toBe('published');
    expect((await history.readChatHistory('hagga-basin')).messages[0].delivery).toBe('published');
  });

  it('rejects a Stream entry whose payload names another destination', async () => {
    await direct.xadd(
      'arrakis:{chat:hagga-basin}:messages',
      '*',
      'payload',
      JSON.stringify({ ...input('foreign', 'deep-desert') }),
    );
    expect((await history.readChatHistory('hagga-basin')).messages).toEqual([]);
  });

  it('keeps a failed send out of shared history while retaining its private idempotency outcome', async () => {
    const outgoing = { ...input('FAILED-PRIVATE-1'), source: 'dashboard' as const, delivery: 'pending' as const };
    const saved = await history.appendChatMessage(outgoing);
    expect((await history.readChatHistory('hagga-basin')).messages).toEqual([]);
    await history.setChatDelivery(saved.message, 'failed');
    expect((await history.readChatHistory('hagga-basin')).messages).toEqual([]);
    expect((await history.findChatMessageByEvent('hagga-basin', outgoing.id))?.delivery).toBe('failed');
    const duplicate = await history.appendChatMessage(outgoing);
    expect(duplicate).toMatchObject({ inserted: false, message: { delivery: 'failed' } });
  });

  it('isolates destinations and reconciles only entries after the reconnect cursor', async () => {
    const first = await history.appendChatMessage(input('event-1'));
    await history.appendChatMessage(input('event-2'));
    await history.appendChatMessage(input('other-event', 'deep-desert'));
    const reconciled = await history.reconcileChatMessages('hagga-basin', first.message.streamId);
    expect(reconciled.messages.map((message) => message.id)).toEqual(['event-2']);
    expect((await history.readChatHistory('deep-desert')).messages.map((message) => message.id)).toEqual([
      'other-event',
    ]);
    expect((await history.readChatHistory('hagga-basin')).messages.map((message) => message.id)).toEqual([
      'event-1',
      'event-2',
    ]);
  });
});
