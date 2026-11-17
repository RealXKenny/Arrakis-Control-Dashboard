import { describe, expect, it } from 'vitest';
import type { ChatMessage } from '../../../src/features/chat/contracts';
import {
  classifyChatSendFailure,
  CHAT_TIMELINE_MAX_MESSAGES,
  classifyChatSendResponse,
  mergeChatMessages,
  optimisticChatId,
} from '../../../src/features/chat/delivery';

const clientKey = '0f8fad5b-d9cb-469f-a165-70867728950e';

function dashboard(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: 'A1B2C3D4E5F60718293A4B5C6D7E8F90',
    streamId: '1000-0',
    serverId: 'hagga-basin',
    senderId: 'member-a',
    senderName: 'Desert Walker',
    source: 'dashboard',
    content: 'hello',
    timestamp: '2026-11-08T20:00:00.000Z',
    correlationId: clientKey,
    delivery: 'pending',
    ...overrides,
  };
}

const placeholder = () => dashboard({ id: optimisticChatId(clientKey), streamId: '999-0' });

describe('browser send outcome classification', () => {
  it.each([['network timeout (aborted request)'], ['connection interruption'], ['lost response']])(
    'treats %s as unknown, never failed',
    () => {
      expect(classifyChatSendFailure()).toMatchObject({ saved: null, delivery: 'unknown' });
    },
  );

  it.each([
    [502, '<html>Bad gateway</html>'],
    [504, null],
    [500, { ok: false, error: 'Internal server error', code: 'INTERNAL_ERROR' }],
    [408, { ok: false, error: 'Timeout', code: 'TIMEOUT' }],
    [200, null],
  ])('treats a %s response without a recorded message as unknown', (status, body) => {
    expect(classifyChatSendResponse(status, body).delivery).toBe('unknown');
  });

  it.each([
    [429, 'CHAT_RATE_LIMITED'],
    [400, 'INVALID_CHAT_MESSAGE'],
    [401, 'UNAUTHORIZED'],
    [409, 'CHAT_IDEMPOTENCY_CONFLICT'],
    [503, 'CHAT_HISTORY_UNAVAILABLE'],
  ])('treats an API rejection before publishing (%s %s) as failed', (status, code) => {
    expect(classifyChatSendResponse(status, { ok: false, error: 'Rejected', code })).toMatchObject({
      delivery: 'failed',
      error: 'Rejected',
    });
  });

  it('uses the server-recorded state for confirmed publication, rejection and unknown outcomes', () => {
    for (const [status, delivery] of [
      [201, 'published'],
      [503, 'failed'],
      [202, 'unknown'],
      [202, 'pending'],
    ] as const) {
      const outcome = classifyChatSendResponse(status, { ok: status < 400, message: dashboard({ delivery }) });
      expect(outcome.delivery).toBe(delivery);
      expect(outcome.saved?.id).toBe(dashboard().id);
    }
  });

  it('accepts a valid Unicode message at the configured character limit', () => {
    const saved = dashboard({ content: '🪱'.repeat(1_800), delivery: 'published' });
    expect(classifyChatSendResponse(201, { ok: true, message: saved })).toMatchObject({
      saved,
      delivery: 'published',
    });
    expect(classifyChatSendResponse(201, { message: dashboard({ content: '🪱'.repeat(2_001) }) }).saved).toBeNull();
  });
});

describe('chat timeline merging', () => {
  it('reconciles an unknown placeholder when the server copy arrives with the same correlation ID', () => {
    const unknown = { ...placeholder(), delivery: 'unknown' as const };
    const merged = mergeChatMessages([unknown], [dashboard({ delivery: 'published' })]);
    expect(merged).toHaveLength(1);
    expect(merged[0]).toMatchObject({ id: dashboard().id, delivery: 'published' });
  });

  it('does not let another member’s message with a colliding correlation ID replace a placeholder', () => {
    const merged = mergeChatMessages([placeholder()], [dashboard({ senderId: 'member-b' })]);
    expect(merged.map((message) => message.id).sort()).toEqual([dashboard().id, optimisticChatId(clientKey)].sort());
  });

  it('prevents duplicates and never moves delivery state backwards', () => {
    const published = dashboard({ delivery: 'published' });
    let merged = mergeChatMessages([published], [dashboard({ delivery: 'pending' }), published]);
    expect(merged).toEqual([published]);
    merged = mergeChatMessages([dashboard({ delivery: 'unknown' })], [published]);
    expect(merged[0].delivery).toBe('published');
    expect(mergeChatMessages(merged, [dashboard({ delivery: 'unknown' })])[0].delivery).toBe('published');
  });

  it('drops messages for another destination', () => {
    expect(mergeChatMessages([], [dashboard({ serverId: 'deep-desert' })], 'hagga-basin')).toEqual([]);
  });

  it('bounds a long-lived tab while retaining the newest messages', () => {
    const entries = Array.from({ length: CHAT_TIMELINE_MAX_MESSAGES + 1 }, (_, index) =>
      dashboard({ id: String(index), timestamp: new Date(index * 1_000).toISOString() }),
    );
    const merged = mergeChatMessages(entries.slice(0, -1), entries.slice(-1));
    expect(merged).toHaveLength(CHAT_TIMELINE_MAX_MESSAGES);
    expect(merged[0].id).toBe('1');
    expect(merged.at(-1)?.id).toBe(String(CHAT_TIMELINE_MAX_MESSAGES));
  });
});
