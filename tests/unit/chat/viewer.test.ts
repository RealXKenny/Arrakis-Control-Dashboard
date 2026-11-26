import { describe, expect, it } from 'vitest';
import { isViewerChatMessage } from '../../../src/features/chat/viewer';
import type { ChatMessage } from '../../../src/features/chat/contracts';

const viewer = { userId: '123', names: ['RealXKenny', 'Kenny', 'Guild Nick', 'Paul Atreides', 'Café'] };
const base: ChatMessage = {
  id: 'message',
  streamId: '1000-0',
  serverId: 'hagga-basin',
  senderId: '123',
  senderName: 'RealXKenny',
  source: 'dashboard',
  content: 'Test',
  timestamp: '2026-11-08T20:00:00.000Z',
  correlationId: 'message',
  delivery: 'published',
};

describe('chat viewer presentation matching', () => {
  it('matches a dashboard account by ID even after a name change', () => {
    expect(isViewerChatMessage({ ...base, senderName: 'Old name' }, viewer)).toBe(true);
  });
  it('never overrides another known dashboard account ID with a matching name', () => {
    expect(isViewerChatMessage({ ...base, senderId: 'different-user' }, viewer)).toBe(false);
  });
  it.each(['game', 'discord'] as const)('matches %s names across linked character and Discord aliases', (source) => {
    for (const name of viewer.names)
      expect(
        isViewerChatMessage(
          { ...base, source, senderId: 'Funcom#1234', senderName: ` ${name.toUpperCase()} ` },
          viewer,
        ),
      ).toBe(true);
  });
  it('compares complete Unicode-normalized names without substring or prefix guessing', () => {
    expect(isViewerChatMessage({ ...base, source: 'discord', senderName: 'Cafe\u0301' }, viewer)).toBe(true);
    for (const senderName of ['Kenny impostor', 'Kenn', 'Kenny#1234', 'Another player', ''])
      expect(isViewerChatMessage({ ...base, source: 'game', senderName }, viewer)).toBe(false);
  });
  it('can classify a legacy dashboard record without an ID using its display name', () => {
    expect(isViewerChatMessage({ ...base, senderId: undefined }, viewer)).toBe(true);
    expect(isViewerChatMessage({ ...base, senderId: undefined, senderName: 'Unknown' }, viewer)).toBe(false);
  });
  it('does not guess from content, relay bot identity or message source alone', () => {
    expect(
      isViewerChatMessage(
        { ...base, source: 'discord', senderName: 'Other member', content: '[Discord] Kenny: hello' },
        viewer,
      ),
    ).toBe(false);
    expect(isViewerChatMessage({ ...base, source: 'game', senderName: 'Unknown', senderId: '123' }, viewer)).toBe(
      false,
    );
  });
});
