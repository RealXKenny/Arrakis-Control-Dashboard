import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChatMessage } from '../../../src/features/chat/contracts';

const mocks = vi.hoisted(() => ({
  subscribe: vi.fn(),
  read: vi.fn(),
  reconcile: vi.fn(),
  deliveries: vi.fn(),
  session: vi.fn(),
}));
vi.mock('../../../src/features/chat/server/live', () => ({ subscribeToChat: mocks.subscribe }));
vi.mock('../../../src/features/chat/server/history', () => ({
  readChatHistory: mocks.read,
  reconcileChatMessages: mocks.reconcile,
  withCurrentDelivery: mocks.deliveries,
}));
vi.mock('../../../src/features/auth/server/session', () => ({ getSession: mocks.session }));
vi.mock('../../../src/features/chat/server/config', () => {
  const server = { id: 'hagga-basin', label: 'Hagga Basin', map: 'HaggaBasin.0' };
  return {
    getChatConfig: () => ({ servers: [server] }),
    getChatServer: (id: string) => (id === server.id ? server : null),
  };
});

import { createChatGateway } from '../../../src/features/chat/server/gateway';

const message = (id: string, streamId: string): ChatMessage => ({
  id,
  streamId,
  serverId: 'hagga-basin',
  senderId: 'Player#1234',
  senderName: 'Test Player',
  source: 'game',
  content: `Message ${id}`,
  timestamp: '2026-11-08T20:00:00.000Z',
  correlationId: id,
  externalEventId: id,
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.reconcile.mockResolvedValue({ messages: [], cursor: '0-0' });
  mocks.deliveries.mockImplementation(async (_server, messages) => messages);
  mocks.session.mockResolvedValue({ user: { id: 'member' } });
});

async function readUntil(reader: ReadableStreamDefaultReader<Uint8Array>, marker: string): Promise<string> {
  let text = '';
  while (!text.includes(marker)) {
    const result = await reader.read();
    if (result.done) break;
    text += new TextDecoder().decode(result.value);
  }
  return text;
}

async function readAvailable(reader: ReadableStreamDefaultReader<Uint8Array>): Promise<string> {
  let text = '';
  while (true) {
    const result = await reader.read();
    if (result.done) break;
    text += new TextDecoder().decode(result.value);
    if (text.includes(': connected')) break;
  }
  return text;
}

describe('authenticated chat gateway behavior', () => {
  it('never sends unpublished dashboard content in initial history, live events, or reconnects', async () => {
    let receive!: (value: ChatMessage) => void;
    mocks.subscribe.mockImplementation(async (_server, listener) => {
      receive = listener;
      return vi.fn();
    });
    const privateMessages = (['pending', 'failed', 'unknown'] as const).map((delivery, index) => ({
      ...message(`private-${delivery}`, `${1000 + index}-0`),
      source: 'dashboard' as const,
      delivery,
    }));
    mocks.read.mockResolvedValue({ messages: privateMessages, nextCursor: '1002-0' });
    const response = await createChatGateway(
      new Request('https://portal.test/api/v2/chat/stream?server=hagga-basin'),
      'session',
    );
    const reader = response.body!.getReader();
    const initial = await readAvailable(reader);
    expect(initial).toContain('"messages":[]');
    expect(initial).not.toContain('private-');
    for (const privateMessage of privateMessages) receive(privateMessage);
    receive(message('public', '1003-0'));
    const live = await readUntil(reader, '"id":"public"');
    expect(live).not.toContain('private-');
    await reader.cancel();
    const resumed = await createChatGateway(
      new Request('https://portal.test/api/v2/chat/stream?server=hagga-basin', {
        headers: { 'Last-Event-ID': '999-0' },
      }),
      'session',
    );
    const resumedReader = resumed.body!.getReader();
    expect(await readAvailable(resumedReader)).not.toContain('private-');
    await resumedReader.cancel();
  });
  it('subscribes before history and flushes the bounded race buffer after history', async () => {
    let resolveHistory!: (value: unknown) => void;
    mocks.read.mockReturnValue(new Promise((resolve) => (resolveHistory = resolve)));
    let receive!: (value: ChatMessage) => void;
    const unsubscribe = vi.fn();
    mocks.subscribe.mockImplementation(async (_server, listener) => {
      receive = listener;
      return unsubscribe;
    });
    const response = await createChatGateway(
      new Request('https://portal.test/api/v2/chat/stream?server=hagga-basin'),
      'session-id',
    );
    const reader = response.body!.getReader();
    await vi.waitFor(() => expect(mocks.subscribe).toHaveBeenCalled());
    receive(message('live', '1001-0'));
    expect(mocks.read).toHaveBeenCalled();
    expect(mocks.subscribe.mock.invocationCallOrder[0]).toBeLessThan(mocks.read.mock.invocationCallOrder[0]);
    resolveHistory({ messages: [message('history', '1000-0')], nextCursor: '999-0' });
    const text = await readAvailable(reader);
    expect(text).toContain('event: history');
    expect(text).toContain('event: message');
    expect(text.match(/event: message/g)).toHaveLength(1);
    expect(text).toContain('999-0');
    await reader.cancel();
    expect(unsubscribe).toHaveBeenCalled();
  });

  it('resumes from Last-Event-ID and returns no-store SSE headers', async () => {
    mocks.subscribe.mockResolvedValue(vi.fn());
    mocks.read.mockResolvedValue({ messages: [message('missed', '1002-0')], nextCursor: '1002-0' });
    const response = await createChatGateway(
      new Request('https://portal.test/api/v2/chat/stream?server=hagga-basin', {
        headers: { 'Last-Event-ID': '1001-0' },
      }),
      'session-id',
    );
    expect(response.headers.get('Content-Type')).toContain('text/event-stream');
    expect(response.headers.get('Cache-Control')).toContain('no-store');
    expect(mocks.read).toHaveBeenCalledWith('hagga-basin', { after: '1001-0', limit: 200, includeUnpublished: true });
    const reader = response.body!.getReader();
    const text = await readAvailable(reader);
    expect(text).toContain('id: 1002-0');
    expect(text).toContain('event: resync-complete');
    await reader.cancel();
  });

  it('rejects unconfigured destinations and malformed resume cursors before streaming', async () => {
    await expect(
      createChatGateway(new Request('https://portal.test/api/v2/chat/stream?server=other'), 'session-id'),
    ).rejects.toMatchObject({ statusCode: 404 });
    await expect(
      createChatGateway(
        new Request('https://portal.test/api/v2/chat/stream?server=hagga-basin', {
          headers: { 'Last-Event-ID': 'invalid' },
        }),
        'session-id',
      ),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('refreshes an outgoing state older than the reconnect cursor', async () => {
    mocks.subscribe.mockResolvedValue(vi.fn());
    mocks.read.mockResolvedValueOnce({ messages: [], nextCursor: '1005-0' }).mockResolvedValueOnce({
      messages: [{ ...message('outgoing', '1001-0'), source: 'dashboard', delivery: 'published' }],
      nextCursor: null,
    });
    const response = await createChatGateway(
      new Request('https://portal.test/api/v2/chat/stream?server=hagga-basin', {
        headers: { 'Last-Event-ID': '1005-0' },
      }),
      'session-id',
    );
    const reader = response.body!.getReader();
    const text = await readAvailable(reader);
    expect(text).toContain('"delivery":"published"');
    expect(text).toContain('id: 1005-0');
    expect(text).not.toContain('id: 1001-0');
    await reader.cancel();
  });

  it('does not skip a missed Stream message when a newer live hint arrives first', async () => {
    vi.useFakeTimers({ toFake: ['setInterval'] });
    try {
      let receive!: (value: ChatMessage) => void;
      mocks.subscribe.mockImplementation(async (_server, listener) => {
        receive = listener;
        return vi.fn();
      });
      mocks.read.mockResolvedValue({ messages: [message('initial', '1000-0')], nextCursor: null });
      const response = await createChatGateway(
        new Request('https://portal.test/api/v2/chat/stream?server=hagga-basin'),
        'session-id',
      );
      const reader = response.body!.getReader();
      await readAvailable(reader);
      receive(message('newer-hint', '1002-0'));
      mocks.reconcile.mockResolvedValue({
        messages: [message('missed', '1001-0'), message('newer-hint', '1002-0')],
        cursor: '1002-0',
      });
      await vi.advanceTimersByTimeAsync(15_000);
      const text = await readUntil(reader, ': heartbeat');
      expect(mocks.reconcile).toHaveBeenCalledWith('hagga-basin', '1000-0');
      expect(text).toContain('"id":"missed"');
      expect(text.match(/"id":"newer-hint"/g)).toHaveLength(1);
      expect(text).toContain('id: 1002-0');
      await reader.cancel();
    } finally {
      vi.useRealTimers();
    }
  });

  it('drops cross-destination live events, repairs missed delivery updates and never regresses state', async () => {
    vi.useFakeTimers({ toFake: ['setInterval'] });
    try {
      let receive!: (value: ChatMessage) => void;
      mocks.subscribe.mockImplementation(async (_server, listener) => {
        receive = listener;
        return vi.fn();
      });
      const outgoing: ChatMessage = {
        ...message('outgoing', '1001-0'),
        source: 'dashboard',
        senderId: 'member',
        delivery: 'pending',
      };
      mocks.read.mockResolvedValue({ messages: [outgoing], nextCursor: null });
      const response = await createChatGateway(
        new Request('https://portal.test/api/v2/chat/stream?server=hagga-basin'),
        'session-id',
      );
      const reader = response.body!.getReader();
      await readAvailable(reader);

      receive({ ...message('foreign', '1002-0'), serverId: 'deep-desert' });
      // The Pub/Sub update for `outgoing` was missed; reconciliation re-reads its state.
      mocks.reconcile.mockResolvedValue({ messages: [], cursor: '1005-0' });
      mocks.deliveries.mockImplementationOnce(async (_server, messages: ChatMessage[]) =>
        messages.map((entry) => ({ ...entry, delivery: 'unknown' })),
      );
      await vi.advanceTimersByTimeAsync(15_000);
      const privateUpdate = await readUntil(reader, ': heartbeat');
      expect(privateUpdate).not.toContain('outgoing');
      expect(privateUpdate).not.toContain('"delivery":"unknown"');
      // A late authoritative result still repairs a pending send that aged into unknown.
      mocks.deliveries.mockImplementation(async (_server, messages: ChatMessage[]) =>
        messages.map((entry) => ({ ...entry, delivery: 'published' })),
      );
      await vi.advanceTimersByTimeAsync(15_000);
      const update = await readUntil(reader, ': heartbeat');
      expect(update).toContain('"delivery":"published"');
      expect(update).not.toContain('foreign');
      // A state update for an older entry must not rewind Last-Event-ID.
      expect(update).not.toContain('id: 1001-0');
      expect(mocks.deliveries).toHaveBeenCalledWith('hagga-basin', [expect.objectContaining({ id: 'outgoing' })]);

      // A late `pending` notification cannot move the message backwards.
      receive(outgoing);
      receive(message('next', '1006-0'));
      const next = await readUntil(reader, '"id":"next"');
      expect(next).toContain('"id":"next"');
      expect(next).not.toContain('"delivery":"pending"');

      // The next reconciliation resumes after the cursor, which also skipped rejected entries.
      await vi.advanceTimersByTimeAsync(15_000);
      expect(mocks.reconcile).toHaveBeenLastCalledWith('hagga-basin', '1005-0');
      await reader.cancel();
    } finally {
      vi.useRealTimers();
    }
  });
});
