import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DashboardSession } from '../../../src/features/auth/server/session-store';

const mocks = vi.hoisted(() => ({
  publish: vi.fn(),
  append: vi.fn(),
  setDelivery: vi.fn(),
  find: vi.fn(),
  limit: vi.fn(),
  pause: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('node:timers/promises', () => ({ setTimeout: mocks.pause }));
vi.mock('../../../src/features/chat/server/publisher', () => ({
  getChatPublisher: () => ({ publish: mocks.publish }),
}));
vi.mock('../../../src/features/chat/server/history', () => ({
  appendChatMessage: mocks.append,
  setChatDelivery: mocks.setDelivery,
  findChatMessageByEvent: mocks.find,
}));
vi.mock('../../../src/lib/security/rate-limit', () => ({ checkRateLimit: mocks.limit }));
vi.mock('../../../src/features/chat/server/config', async () => {
  const servers = [{ id: 'hagga-basin', label: 'Hagga Basin', map: 'HaggaBasin.0' }];
  const config = {
    funcomId: 'ArrakisControl#0001',
    displayName: 'Arrakis Control',
    servers,
    messageMaxChars: 100,
    sendRateLimit: 10,
    serverSendRateLimit: 60,
    sendRateWindowMs: 10_000,
  };
  return { getChatConfig: () => config, getChatServer: (id: string) => servers.find((server) => server.id === id) };
});

import { chatMessageIdFor, sendChatMessage } from '../../../src/features/chat/server/send';
import { ChatPublishError } from '../../../src/features/chat/server/rabbitmq';
import { decodeMapChat } from '../../../src/features/chat/server/protocol';

const session: DashboardSession = {
  user: { id: 'discord-user', username: 'Discord name', global_name: 'Linked user' },
  guildId: 'guild',
  roleIds: ['verified'],
  linkedPlayerName: 'Desert Walker',
  expiresAt: Date.now() + 60_000,
};
const clientKey = '0f8fad5b-d9cb-469f-a165-70867728950e';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.limit.mockResolvedValue({ allowed: true, remaining: 9, retryAfter: 10 });
  mocks.append.mockImplementation(async (input) => ({ message: { ...input, streamId: '1000-0' }, inserted: true }));
  mocks.setDelivery.mockImplementation(async (message, delivery) => ({ ...message, delivery }));
  mocks.find.mockResolvedValue(null);
  mocks.publish.mockResolvedValue(undefined);
});

describe('dashboard chat sending', () => {
  it('records only the authenticated sender avatar without changing the game envelope', async () => {
    const member = {
      ...session,
      user: { ...session.user, id: '123456789000000000', avatar: '0123456789abcdef0123456789abcdef' },
    };
    const result = await sendChatMessage(member, 'hagga-basin', 'hello', clientKey);
    expect(result.message.senderAvatar).toBe(member.user.avatar);
    expect(mocks.append.mock.calls[0][0].senderAvatar).toBe(member.user.avatar);
    expect(mocks.publish.mock.calls[0][2]).not.toContain(member.user.avatar);
  });

  it('records pending before publishing and reconciles confirmed publication', async () => {
    const result = await sendChatMessage(session, 'hagga-basin', 'hello', clientKey);
    expect(result.status).toBe(201);
    expect(result.message.delivery).toBe('published');
    expect(mocks.append.mock.calls[0][0]).toMatchObject({
      id: chatMessageIdFor('discord-user', clientKey),
      senderId: 'discord-user',
      senderName: 'Desert Walker',
      source: 'dashboard',
      correlationId: clientKey,
      delivery: 'pending',
    });
    const [map, id, body] = mocks.publish.mock.calls[0];
    expect(map).toBe('HaggaBasin.0');
    expect(id).toMatch(/^[0-9A-F]{32}$/);
    expect(decodeMapChat(body)).toMatchObject({
      id,
      sender: 'ArrakisControl#0001',
      text: '[Dashboard] Desert Walker: hello',
    });
    expect(mocks.append.mock.invocationCallOrder[0]).toBeLessThan(mocks.publish.mock.invocationCallOrder[0]);
    expect(mocks.setDelivery).toHaveBeenCalledWith(expect.objectContaining({ id }), 'published');
  });

  it.each([
    ['confirmed rejection', 'failed', new ChatPublishError('nack', 'failed'), 503],
    ['broker confirm timeout', 'unknown', new ChatPublishError('timeout', 'unknown'), 202],
    ['connection interruption', 'unknown', new ChatPublishError('disconnected', 'unknown'), 202],
    ['unexpected publisher error', 'unknown', new Error('boom'), 202],
  ])('retries only confirmed failures and records %s as %s', async (_name, delivery, error, status) => {
    mocks.publish.mockRejectedValue(error);
    const result = await sendChatMessage(session, 'hagga-basin', 'hello', clientKey);
    expect(result.message.delivery).toBe(delivery);
    expect(result.status).toBe(status);
    expect(mocks.publish).toHaveBeenCalledTimes(delivery === 'failed' ? 3 : 1);
    expect(mocks.pause.mock.calls).toEqual(delivery === 'failed' ? [[1_000], [2_000]] : []);
    expect(mocks.setDelivery).toHaveBeenCalledWith(expect.anything(), delivery);
  });

  it('succeeds on the third attempt with one stored message and one stable game ID', async () => {
    mocks.publish
      .mockRejectedValueOnce(new ChatPublishError('offline', 'failed'))
      .mockRejectedValueOnce(new ChatPublishError('nack', 'failed'))
      .mockResolvedValueOnce(undefined);
    const result = await sendChatMessage(session, 'hagga-basin', 'hello', clientKey);
    expect(result).toMatchObject({ status: 201, message: { delivery: 'published' } });
    expect(mocks.append).toHaveBeenCalledOnce();
    expect(mocks.publish).toHaveBeenCalledTimes(3);
    expect(new Set(mocks.publish.mock.calls.map((call) => call[1])).size).toBe(1);
    expect(mocks.publish.mock.calls.every((call) => call[2] === mocks.publish.mock.calls[0][2])).toBe(true);
    expect(mocks.setDelivery).toHaveBeenCalledTimes(1);
  });

  it('stops retries immediately if a later attempt becomes uncertain', async () => {
    mocks.publish
      .mockRejectedValueOnce(new ChatPublishError('offline', 'failed'))
      .mockRejectedValueOnce(new ChatPublishError('confirm lost', 'unknown'));
    expect((await sendChatMessage(session, 'hagga-basin', 'hello', clientKey)).message.delivery).toBe('unknown');
    expect(mocks.publish).toHaveBeenCalledTimes(2);
    expect(mocks.pause).toHaveBeenCalledOnce();
  });

  it('reports a definite failure, without publishing, when the pending record cannot be written', async () => {
    mocks.append.mockRejectedValue(new Error('Redis unavailable'));
    await expect(sendChatMessage(session, 'hagga-basin', 'hello', clientKey)).rejects.toMatchObject({
      statusCode: 503,
      code: 'CHAT_HISTORY_UNAVAILABLE',
    });
    expect(mocks.publish).not.toHaveBeenCalled();
  });

  it('still reports broker acceptance when the delivery-state update fails afterwards', async () => {
    mocks.setDelivery.mockRejectedValue(new Error('Redis unavailable'));
    const result = await sendChatMessage(session, 'hagga-basin', 'hello', clientKey);
    expect(result).toMatchObject({ status: 201, message: { delivery: 'published' } });
    expect(mocks.publish).toHaveBeenCalledOnce();
  });

  it('answers a resend of the same key with the recorded outcome instead of publishing twice', async () => {
    const id = chatMessageIdFor('discord-user', clientKey);
    const stored = {
      id,
      streamId: '1000-0',
      serverId: 'hagga-basin',
      senderId: 'discord-user',
      senderName: 'Desert Walker',
      source: 'dashboard' as const,
      content: 'hello',
      timestamp: new Date().toISOString(),
      correlationId: clientKey,
      externalEventId: id,
    };
    for (const delivery of ['published', 'unknown', 'failed', 'pending'] as const) {
      mocks.find.mockResolvedValueOnce({ ...stored, delivery });
      const result = await sendChatMessage(session, 'hagga-basin', 'hello', clientKey.toUpperCase());
      expect(result.message.delivery).toBe(delivery);
      expect(result.status).toBe({ published: 201, unknown: 202, failed: 503, pending: 202 }[delivery]);
    }
    expect(mocks.find).toHaveBeenCalledWith('hagga-basin', id);
    expect(mocks.publish).not.toHaveBeenCalled();
    expect(mocks.append).not.toHaveBeenCalled();
    expect(mocks.limit).not.toHaveBeenCalled();
  });

  it('lets only the atomic insert winner publish when the same key races', async () => {
    mocks.append.mockImplementation(async (input) => ({
      message: { ...input, streamId: '999-0', delivery: 'pending' },
      inserted: false,
    }));
    const result = await sendChatMessage(session, 'hagga-basin', 'hello', clientKey);
    expect(result).toMatchObject({ status: 202, message: { delivery: 'pending', streamId: '999-0' } });
    expect(mocks.publish).not.toHaveBeenCalled();
  });

  it('rejects reuse of a key for different content and malformed keys', async () => {
    mocks.find.mockResolvedValueOnce({
      id: chatMessageIdFor('discord-user', clientKey),
      streamId: '1000-0',
      serverId: 'hagga-basin',
      senderName: 'Desert Walker',
      source: 'dashboard',
      content: 'original',
      timestamp: new Date().toISOString(),
      correlationId: clientKey,
      delivery: 'published',
    });
    await expect(sendChatMessage(session, 'hagga-basin', 'changed', clientKey)).rejects.toMatchObject({
      statusCode: 409,
    });
    await expect(sendChatMessage(session, 'hagga-basin', 'hello', 'not-a-uuid')).rejects.toMatchObject({
      statusCode: 400,
    });
    expect(mocks.publish).not.toHaveBeenCalled();
  });

  it('namespaces message IDs per member so one member cannot address another member’s send', () => {
    expect(chatMessageIdFor('member-a', clientKey)).not.toBe(chatMessageIdFor('member-b', clientKey));
    expect(chatMessageIdFor('member-a', clientKey)).toBe(chatMessageIdFor('member-a', clientKey.toUpperCase()));
  });

  it('enforces limits and rejects unknown destinations before publishing', async () => {
    mocks.limit.mockResolvedValue({ allowed: false, remaining: 0, retryAfter: 4 });
    await expect(sendChatMessage(session, 'hagga-basin', 'hello')).rejects.toMatchObject({ statusCode: 429 });
    await expect(sendChatMessage(session, 'another-server', 'hello')).rejects.toMatchObject({ statusCode: 404 });
    expect(mocks.publish).not.toHaveBeenCalled();
  });
});
