import { EventEmitter } from 'node:events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChatConfig } from '../../../src/features/chat/server/config';
import { RabbitChatTransport } from '../../../src/features/chat/server/rabbitmq';
import { encodeMapChat } from '../../../src/features/chat/server/protocol';
import { createTlsCertificates } from '../../helpers/tls-certificates';
import { loadChatTls } from '../../../src/features/chat/server/tls';

const { connect } = vi.hoisted(() => ({ connect: vi.fn() }));
vi.mock('amqplib', () => ({ connect }));

const config = {
  url: 'amqps://5E121CE000000001:secret@remote.example.com/%2F?heartbeat=30',
  username: '5E121CE000000001',
  funcomId: 'ArrakisControl#0001',
  displayName: undefined,
  caFile: undefined,
  tlsServername: undefined,
  tls: { rejectUnauthorized: true },
  servers: [{ id: 'hagga-basin', label: 'Hagga Basin', map: 'HaggaBasin.0' }],
  prefetch: 20,
  healthHost: '127.0.0.1',
  healthPort: 2010,
  historyMaxMessages: 10_000,
  historyRetentionDays: 7,
  messageMaxChars: 1_000,
  sendRateLimit: 10,
  serverSendRateLimit: 60,
  sendRateWindowMs: 10_000,
} satisfies ChatConfig;

let broker: ReturnType<typeof mockBroker>;
function mockBroker() {
  const channel = Object.assign(new EventEmitter(), {
    checkExchange: vi.fn().mockResolvedValue({}),
    assertExchange: vi.fn().mockResolvedValue({}),
    assertQueue: vi.fn().mockResolvedValue({ queue: 'amq.gen-dashboard-test' }),
    bindQueue: vi.fn().mockResolvedValue({}),
    prefetch: vi.fn().mockResolvedValue({}),
    consume: vi.fn().mockResolvedValue({}),
    publish: vi.fn().mockImplementation((_exchange, _key, _body, _options, callback) => {
      callback(null);
      return true;
    }),
    ack: vi.fn(),
    nack: vi.fn(),
  });
  const connection = Object.assign(new EventEmitter(), {
    createConfirmChannel: vi.fn().mockResolvedValue(channel),
    close: vi.fn().mockImplementation(() => {
      connection.emit('close');
      return Promise.resolve();
    }),
  });
  connect.mockResolvedValue(connection);
  return { channel, connection };
}

beforeEach(() => {
  broker = mockBroker();
});
afterEach(() => {
  vi.clearAllMocks();
  vi.useRealTimers();
});

describe('persistent RabbitMQ chat transport', () => {
  it('identifies the denied topology operation without exposing the raw broker error', async () => {
    const state = vi.fn();
    broker.channel.assertQueue.mockRejectedValueOnce(new Error('ACCESS_REFUSED secret-password'));
    const transport = new RabbitChatTransport(config, vi.fn(), state);
    try {
      transport.start();
      await vi.waitFor(() =>
        expect(state).toHaveBeenCalledWith('warn', expect.stringContaining('declaring broker-generated receive queue')),
      );
      expect(JSON.stringify(state.mock.calls)).not.toContain('secret-password');
      expect(broker.channel.assertExchange).not.toHaveBeenCalled();
      expect(broker.channel.bindQueue).not.toHaveBeenCalled();
    } finally {
      await transport.stop();
    }
  });
  it('reuses validated inline TLS options when restoring exactly one consumer after reconnect', async () => {
    const certificates = createTlsCertificates();
    const tls = loadChatTls(
      { RABBITMQ_TLS_REJECT_UNAUTHORIZED: true, RABBITMQ_TLS_CA: certificates.cert },
      new URL(config.url),
    );
    const receive = vi.fn().mockResolvedValue(undefined);
    const transport = new RabbitChatTransport({ ...config, tls }, receive);
    try {
      transport.start();
      await vi.waitFor(() => expect(transport.ready).toBe(true));
      transport.start();
      expect(broker.channel.consume).toHaveBeenCalledOnce();
      const firstOptions = connect.mock.calls[0][1];
      broker.connection.emit('close');
      broker = mockBroker();
      broker.channel.assertQueue.mockResolvedValue({ queue: 'amq.gen-dashboard-reconnected' });
      await vi.waitFor(() => expect(transport.ready).toBe(true), { timeout: 3_000 });
      expect(broker.channel.consume).toHaveBeenCalledOnce();
      expect(broker.channel.consume).toHaveBeenCalledWith('amq.gen-dashboard-reconnected', expect.any(Function));
      expect(broker.channel.assertExchange).not.toHaveBeenCalled();
      expect(connect.mock.calls[1][1]).toEqual(firstOptions);
      expect(firstOptions.ca).toEqual([certificates.cert.trim()]);
      expect(firstOptions.rejectUnauthorized).toBe(true);
    } finally {
      await transport.stop();
      certificates.close();
    }
  });
  it('uses only bot-compatible generated resources and acknowledges after persistence', async () => {
    let persisted!: () => void;
    const receive = vi.fn().mockReturnValue(
      new Promise<void>((resolve) => {
        persisted = resolve;
      }),
    );
    const transport = new RabbitChatTransport(config, receive);
    transport.start();
    await vi.waitFor(() => expect(broker.channel.consume).toHaveBeenCalled());
    expect(broker.channel.bindQueue).toHaveBeenCalledWith('amq.gen-dashboard-test', 'chat.map', 'HaggaBasin.0');
    expect(broker.channel.assertQueue).toHaveBeenCalledWith('', {
      exclusive: true,
      autoDelete: true,
      durable: false,
      arguments: { 'x-max-length': 500, 'x-message-ttl': 60_000 },
    });
    expect(broker.channel.assertQueue).toHaveBeenCalledOnce();
    expect(broker.channel.assertExchange).not.toHaveBeenCalled();
    expect(broker.channel.consume).toHaveBeenCalledWith('amq.gen-dashboard-test', expect.any(Function));
    expect(broker.channel.prefetch).toHaveBeenCalledWith(20);
    const incoming = {
      fields: { routingKey: 'HaggaBasin.0' },
      properties: { messageId: 'event-1' },
      content: Buffer.from('event'),
    };
    await broker.channel.consume.mock.calls[0][1](incoming);
    expect(broker.channel.ack).not.toHaveBeenCalled();
    persisted();
    await vi.waitFor(() => expect(broker.channel.ack).toHaveBeenCalledWith(incoming));
    expect(receive).toHaveBeenCalledWith('HaggaBasin.0', incoming);
    await transport.stop();
    expect(broker.connection.close).toHaveBeenCalled();
  });

  it('discards poison messages after bounded, delayed transient redelivery retries', async () => {
    const receive = vi.fn().mockRejectedValue(new Error('Redis unavailable'));
    const transport = new RabbitChatTransport(config, receive);
    transport.start();
    await vi.waitFor(() => expect(broker.channel.consume).toHaveBeenCalled());
    const incoming = {
      fields: { routingKey: 'HaggaBasin.0', deliveryTag: 1 },
      properties: {},
      content: Buffer.from('same-event'),
    };
    const consume = broker.channel.consume.mock.calls[0][1];
    for (let attempt = 1; attempt <= 3; attempt++) {
      incoming.fields.deliveryTag = attempt;
      await consume(incoming);
      // Transient failures are requeued after a growing delay (1s, 2s) rather than immediately.
      await vi.waitFor(() => expect(broker.channel.nack).toHaveBeenCalledTimes(attempt), { timeout: 4_000 });
      expect(broker.channel.nack).toHaveBeenLastCalledWith(incoming, false, attempt < 3);
    }
    await transport.stop();
  });

  it('publishes the bot-compatible AMQP properties and treats confirmation as broker acceptance only', async () => {
    const transport = new RabbitChatTransport(config);
    transport.start();
    await vi.waitFor(() => expect(transport.ready).toBe(true));
    const encoded = encodeMapChat(config.funcomId, '[Dashboard] Kenny: hello');
    await transport.publish('HaggaBasin.0', encoded.id, encoded.body);
    expect(broker.channel.publish).toHaveBeenCalledWith(
      'chat.map',
      'HaggaBasin.0',
      encoded.body,
      // Exactly the property set the bot's GameChatConnection publishes, with nothing added.
      {
        contentType: 'Content',
        type: 'text_chat',
        appId: 'fls_backend',
        userId: config.username,
        messageId: encoded.id,
        mandatory: true,
        expiration: '60000',
        headers: { redirect_exchange: Buffer.from('chat.map') },
      },
      expect.any(Function),
    );
    await transport.stop();
  });

  it('marks an interrupted publish unknown and reconnects without consuming in publisher mode', async () => {
    const transport = new RabbitChatTransport(config);
    transport.start();
    await vi.waitFor(() => expect(transport.ready).toBe(true));
    expect(broker.channel.consume).not.toHaveBeenCalled();
    broker.channel.publish.mockImplementation(() => true);
    const pending = transport.publish('HaggaBasin.0', 'message-id', Buffer.from('{}'));
    const rejection = expect(pending).rejects.toMatchObject({ outcome: 'unknown' });
    broker.channel.emit('close');
    await rejection;
    mockBroker();
    await vi.waitFor(() => expect(connect).toHaveBeenCalledTimes(2), { timeout: 3_000 });
    await transport.stop();
  });

  it.each([
    ['channel closed', 'unknown'],
    ['message nacked', 'failed'],
  ])('classifies the amqplib confirm callback %s as %s', async (reason, outcome) => {
    const transport = new RabbitChatTransport(config);
    transport.start();
    await vi.waitFor(() => expect(transport.ready).toBe(true));
    broker.channel.publish.mockImplementation((_exchange, _key, _body, _options, callback) => {
      callback(new Error(reason));
      return true;
    });
    await expect(transport.publish('HaggaBasin.0', 'message-id', Buffer.from('{}'))).rejects.toMatchObject({ outcome });
    await transport.stop();
  });
});
