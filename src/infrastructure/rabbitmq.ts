import '../lib/assert-server';
import { connect } from 'amqplib';
import { requireServerEnv } from '../config/env';

export async function openRabbitObserver(onMessage: (source: string, payload: Buffer) => Promise<void>) {
  const env = requireServerEnv('RABBITMQ_URL', 'RABBITMQ_MANAGEMENT_URL');
  const url = new URL(env.RABBITMQ_URL);
  const vhost = decodeURIComponent(url.pathname.slice(1) || '%2F');
  const management = new URL(env.RABBITMQ_MANAGEMENT_URL);
  if (management.protocol !== 'https:' && !['127.0.0.1', 'localhost', '[::1]'].includes(management.hostname)) {
    throw new Error('RabbitMQ management requires HTTPS or loopback');
  }
  const response = await fetch(new URL(`/api/exchanges/${encodeURIComponent(vhost)}`, management), {
    headers: {
      Authorization: `Basic ${Buffer.from(`${decodeURIComponent(url.username)}:${decodeURIComponent(url.password)}`).toString('base64')}`,
    },
    signal: AbortSignal.timeout(10000),
    redirect: 'error',
  });
  if (!response.ok) throw new Error('RabbitMQ discovery unavailable');
  const exchanges: { name: string; type: string }[] = await response.json();
  const allowed = exchanges.filter(
    (e) =>
      (e.name.startsWith('status.') && e.type === 'fanout') ||
      (['chat.intercept', 'notifications'].includes(e.name) && e.type === 'topic') ||
      (e.name === 'director_respawned' && e.type === 'fanout'),
  );
  const bindingsResponse = await fetch(new URL(`/api/bindings/${encodeURIComponent(vhost)}`, management), {
    headers: {
      Authorization: `Basic ${Buffer.from(`${decodeURIComponent(url.username)}:${decodeURIComponent(url.password)}`).toString('base64')}`,
    },
    signal: AbortSignal.timeout(10000),
    redirect: 'error',
  });
  if (!bindingsResponse.ok) throw new Error('RabbitMQ binding discovery unavailable');
  const bindings: { source: string; routing_key: string }[] = await bindingsResponse.json();
  const direct = bindings.filter(
    (binding) =>
      ['heartbeats', 'travel_queue_status'].includes(binding.source) &&
      exchanges.some((e) => e.name === binding.source && e.type === 'direct'),
  );
  const targets = [
    ...allowed.map((e) => ({ source: e.name, key: e.type === 'topic' ? '#' : '' })),
    ...direct.map((b) => ({ source: b.source, key: b.routing_key })),
  ];
  const unique = targets.filter(
    (target, index) =>
      targets.findIndex((other) => other.source === target.source && other.key === target.key) === index,
  );
  if (unique.length > 256) throw new Error('RabbitMQ discovery exceeds binding limit');
  url.searchParams.set('heartbeat', '30');
  const connection = await connect(url.toString(), {
    timeout: 10000,
    rejectUnauthorized: true,
    ...(env.RABBITMQ_CA_PEM ? { ca: [env.RABBITMQ_CA_PEM.replaceAll('\\n', '\n')] } : {}),
    ...(env.RABBITMQ_TLS_SERVERNAME ? { servername: env.RABBITMQ_TLS_SERVERNAME } : {}),
  });
  let closed = false;
  connection.on('error', () => {
    closed = true;
  });
  connection.on('close', () => {
    closed = true;
  });
  try {
    const channel = await connection.createChannel();
    channel.on('error', () => {
      closed = true;
    });
    channel.on('close', () => {
      closed = true;
    });
    const queue = await channel.assertQueue('', {
      exclusive: true,
      durable: false,
      autoDelete: true,
      arguments: {
        'x-message-ttl': 60000,
        'x-max-length': 1000,
        'x-max-length-bytes': 4194304,
        'x-overflow': 'drop-head',
      },
    });
    for (const target of unique) await channel.bindQueue(queue.queue, target.source, target.key);
    await channel.prefetch(1);
    await channel.consume(queue.queue, (message) => {
      if (!message) {
        closed = true;
        return;
      }
      if (message.content.length > 65536) {
        channel.ack(message);
        return;
      }
      void onMessage(message.fields.exchange, message.content)
        .then(() => {
          if (!closed) channel.ack(message);
        })
        .catch(() => {
          closed = true;
          void connection.close().catch(() => {});
        });
    });
    return {
      isClosed: () => closed,
      close: async () => {
        closed = true;
        await connection.close().catch(() => {});
      },
    };
  } catch {
    await connection.close().catch(() => {});
    throw new Error('RabbitMQ observer setup failed');
  }
}
