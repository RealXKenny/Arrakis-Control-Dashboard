import '../../../lib/assert-server';
import { createHash } from 'node:crypto';
import { connect, type ChannelModel, type ConfirmChannel, type ConsumeMessage, type Options } from 'amqplib';
import type { ChatConfig } from './config';
import { describeChatConnectionError } from './errors';

export class PermanentChatMessageError extends Error {}
export class ChatPublishError extends Error {
  constructor(
    message: string,
    readonly outcome: 'failed' | 'unknown',
  ) {
    super(message);
  }
}

type PendingPublish = { finish: (error?: ChatPublishError) => void; timer: NodeJS.Timeout };
type Receive = (routingKey: string, message: ConsumeMessage) => Promise<void>;

export class RabbitChatTransport {
  private connection?: ChannelModel;
  private channel?: ConfirmChannel;
  private connecting?: Promise<void>;
  private retryTimer?: NodeJS.Timeout;
  private stopped = true;
  private blocked = false;
  private backpressure = false;
  private delay = 1_000;
  private readonly pending = new Map<string, PendingPublish>();
  private readonly attempts = new Map<string, number>();
  private reconnects = 0;

  constructor(
    private readonly config: ChatConfig,
    private readonly receive?: Receive,
    private readonly onState: (level: 'info' | 'warn', message: string) => void = () => undefined,
  ) {}

  start(): void {
    if (!this.stopped) return;
    this.stopped = false;
    this.launch();
  }

  private launch(): void {
    if (this.stopped || this.connecting) return;
    this.connecting = this.open().finally(() => {
      this.connecting = undefined;
      if (!this.channel) this.retry();
    });
  }

  private retry(): void {
    if (this.stopped || this.retryTimer || this.connecting) return;
    const wait = this.delay + Math.floor(Math.random() * 500);
    this.retryTimer = setTimeout(() => {
      this.retryTimer = undefined;
      this.launch();
    }, wait);
    this.retryTimer.unref();
    this.delay = Math.min(this.delay * 2, 30_000);
  }

  private async open(): Promise<void> {
    let connection: ChannelModel | undefined;
    let stage = 'connecting';
    try {
      connection = await connect(this.config.url, {
        timeout: 10_000,
        ...this.config.tls,
      });
      const current = connection;
      this.connection = current;
      this.blocked = false;
      this.backpressure = false;
      current.on('error', (error: unknown) =>
        this.onState('warn', `RabbitMQ connection error: ${describeChatConnectionError(error)}`),
      );
      current.on('blocked', () => {
        this.blocked = true;
      });
      current.on('unblocked', () => {
        this.blocked = false;
      });
      current.on('close', () => {
        if (this.connection !== current) return;
        this.connection = undefined;
        this.channel = undefined;
        this.reconnects += 1;
        for (const pending of this.pending.values()) {
          clearTimeout(pending.timer);
          pending.finish(new ChatPublishError('RabbitMQ disconnected; delivery is unknown.', 'unknown'));
        }
        this.retry();
      });
      if (this.stopped) {
        await current.close();
        return;
      }
      stage = 'opening channel';
      const channel = await current.createConfirmChannel();
      channel.on('error', (error: unknown) =>
        this.onState('warn', `RabbitMQ channel error while ${stage}: ${describeChatConnectionError(error)}`),
      );
      channel.on('close', () => {
        void current.close().catch(() => undefined);
      });
      channel.on('return', (message: ConsumeMessage) => {
        const pending = this.pending.get(message.properties.messageId);
        pending?.finish(new ChatPublishError('RabbitMQ returned an unroutable message.', 'failed'));
      });
      stage = 'checking chat.map';
      await channel.checkExchange('chat.map');
      if (this.receive) {
        stage = 'declaring broker-generated receive queue';
        // Match the working bot's permissions: each connection owns its own amq.gen-* queue.
        // Redis remains durable history; no named queues or custom exchanges are required.
        const queue = await channel.assertQueue('', {
          exclusive: true,
          autoDelete: true,
          durable: false,
          arguments: { 'x-max-length': 500, 'x-message-ttl': 60_000 },
        });
        for (const server of this.config.servers) {
          stage = `binding broker-generated receive queue to chat.map (${server.map})`;
          await channel.bindQueue(queue.queue, 'chat.map', server.map);
        }
        stage = 'setting consumer prefetch';
        await channel.prefetch(this.config.prefetch);
        stage = 'starting broker-generated receive consumer';
        await channel.consume(queue.queue, (message) => {
          if (!message) {
            void current.close().catch(() => undefined);
            return;
          }
          void this.receive!(message.fields.routingKey, message)
            .then(() => {
              this.attempts.delete(this.attemptKey(message));
              channel.ack(message);
            })
            .catch((error: unknown) => {
              const key = this.attemptKey(message);
              const attempts = (this.attempts.get(key) ?? 0) + 1;
              this.attempts.delete(key);
              this.attempts.set(key, attempts);
              if (this.attempts.size > 1_000) this.attempts.delete(this.attempts.keys().next().value!);
              const permanent = error instanceof PermanentChatMessageError || attempts >= 3;
              if (permanent) this.attempts.delete(key);
              this.onState(
                'warn',
                permanent
                  ? 'Chat message discarded after validation failure or bounded processing retries.'
                  : `Chat processing failed; bounded retry ${attempts}/3.`,
              );
              const reject = (): void => {
                try {
                  channel.nack(message, false, !permanent);
                } catch {
                  // The connection closing already owns recovery.
                }
              };
              // Space out requeues (e.g. during a Redis outage) instead of redelivering in a hot loop.
              if (permanent) reject();
              else setTimeout(reject, 1_000 * attempts).unref();
            });
        });
      }
      if (this.stopped || this.connection !== current) {
        await current.close().catch(() => undefined);
        return;
      }
      this.channel = channel;
      this.delay = 1_000;
      this.onState('info', this.receive ? 'Chat Bridge consumer ready.' : 'RabbitMQ chat publisher ready.');
    } catch (error: unknown) {
      this.onState('warn', `RabbitMQ unavailable while ${stage}: ${describeChatConnectionError(error)}`);
      if (connection) await connection.close().catch(() => undefined);
      this.channel = undefined;
    }
  }

  private attemptKey(message: ConsumeMessage): string {
    return message.properties.messageId || createHash('sha256').update(message.content).digest('hex');
  }

  get ready(): boolean {
    return Boolean(this.channel && !this.stopped && !this.blocked);
  }

  get metrics() {
    return { reconnects: this.reconnects, pendingPublishes: this.pending.size, blocked: this.blocked };
  }

  publish(map: string, id: string, body: Buffer): Promise<void> {
    const properties: Options.Publish = {
      contentType: 'Content',
      type: 'text_chat',
      appId: 'fls_backend',
      headers: { redirect_exchange: Buffer.from('chat.map') },
      userId: this.config.username,
      messageId: id,
      mandatory: true,
      // Identical to the bot's GameChatConnection properties; no delivery mode is set.
      expiration: '60000',
    };
    const channel = this.channel;
    if (
      !channel ||
      this.stopped ||
      this.blocked ||
      this.backpressure ||
      this.pending.size >= 50 ||
      this.pending.has(id)
    )
      return Promise.reject(new ChatPublishError('Chat publisher is offline or busy.', 'failed'));
    return new Promise((resolve, reject) => {
      let pending: PendingPublish;
      const finish = (error?: ChatPublishError): void => {
        if (!this.pending.delete(id)) return;
        clearTimeout(pending.timer);
        if (error) reject(error);
        else resolve();
      };
      pending = {
        finish,
        timer: setTimeout(
          () => finish(new ChatPublishError('Broker confirmation timed out; delivery is unknown.', 'unknown')),
          10_000,
        ),
      };
      this.pending.set(id, pending);
      try {
        const writable = channel.publish('chat.map', map, body, properties, (error: unknown) => {
          // amqplib also invokes confirm callbacks on channel close, before our close listener.
          // Only its explicit broker nack proves rejection; a lost confirm remains unknown.
          const nacked = error instanceof Error && error.message === 'message nacked';
          finish(
            error
              ? new ChatPublishError(
                  nacked ? 'RabbitMQ rejected the publish.' : 'Broker confirmation lost; delivery is unknown.',
                  nacked ? 'failed' : 'unknown',
                )
              : undefined,
          );
        });
        if (!writable) {
          this.backpressure = true;
          channel.once('drain', () => {
            if (this.channel === channel) this.backpressure = false;
          });
        }
      } catch {
        finish(new ChatPublishError('RabbitMQ publish failed.', 'unknown'));
      }
    });
  }

  async stop(): Promise<void> {
    this.stopped = true;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = undefined;
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.finish(new ChatPublishError('Chat publisher stopped; delivery is unknown.', 'unknown'));
    }
    if (this.connection) await this.connection.close().catch(() => undefined);
    await this.connecting;
    this.channel = undefined;
  }
}
