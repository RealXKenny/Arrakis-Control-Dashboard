import { beforeEach, expect, it, vi } from 'vitest';
import { connect } from 'amqplib';
import { openRabbitObserver } from '../src/infrastructure/rabbitmq';
vi.mock('amqplib', () => ({ connect: vi.fn() }));
vi.mock('../src/config/env', () => ({
  requireServerEnv: () => ({
    RABBITMQ_URL: 'amqps://observer:password@broker:5672/%2F',
    RABBITMQ_MANAGEMENT_URL: 'http://127.0.0.1:15672',
  }),
}));
beforeEach(() => vi.clearAllMocks());
it('binds only an isolated bounded queue to allowed sources and acknowledges after storage', async () => {
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce({
      ok: true,
      json: async () => [
        { name: 'status.test', type: 'fanout' },
        { name: 'chat.intercept', type: 'topic' },
        { name: 'login_request', type: 'direct' },
        { name: 'heartbeats', type: 'direct' },
      ],
    })
    .mockResolvedValueOnce({
      ok: true,
      json: async () => [
        { source: 'heartbeats', routing_key: 'server' },
        { source: 'login_request', routing_key: 'secret' },
      ],
    });
  vi.stubGlobal('fetch', fetchMock);
  const channel = {
    on: vi.fn(),
    assertQueue: vi.fn().mockResolvedValue({ queue: 'amq.gen-test' }),
    bindQueue: vi.fn(),
    prefetch: vi.fn(),
    consume: vi.fn(),
    ack: vi.fn(),
  };
  const close = vi.fn().mockResolvedValue(undefined);
  vi.mocked(connect).mockResolvedValue({ on: vi.fn(), createChannel: async () => channel, close } as unknown as Awaited<
    ReturnType<typeof connect>
  >);
  const stored = vi.fn().mockResolvedValue(undefined);
  const observer = await openRabbitObserver(stored);
  expect(channel.assertQueue).toHaveBeenCalledWith(
    '',
    expect.objectContaining({ exclusive: true, durable: false, autoDelete: true }),
  );
  expect(channel.bindQueue.mock.calls).toEqual([
    ['amq.gen-test', 'status.test', ''],
    ['amq.gen-test', 'chat.intercept', '#'],
    ['amq.gen-test', 'heartbeats', 'server'],
  ]);
  const message = { fields: { exchange: 'chat.intercept' }, content: Buffer.from('{}') };
  channel.consume.mock.calls[0][1](message);
  expect(channel.ack).not.toHaveBeenCalled();
  await vi.waitFor(() => expect(channel.ack).toHaveBeenCalledWith(message));
  expect(stored).toHaveBeenCalledWith('chat.intercept', message.content);
  await observer.close();
  expect(close).toHaveBeenCalled();
  vi.unstubAllGlobals();
});
it('does not connect when topology discovery fails', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }));
  await expect(openRabbitObserver(vi.fn())).rejects.toThrow('discovery unavailable');
  expect(connect).not.toHaveBeenCalled();
  vi.unstubAllGlobals();
});
