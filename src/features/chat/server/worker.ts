import '../../../lib/assert-server';
import 'dotenv/config';
import { createServer, type Server } from 'node:http';
import { pathToFileURL } from 'node:url';
import { getRedisClient } from '../../../lib/redis/client';
import { createLogger } from '../../../lib/logger';
import { appendChatMessage } from './history';
import { getChatConfig } from './config';
import { ChatPlayerNames } from './player-names';
import { decodeMapChat } from './protocol';
import { parseDiscordRelay } from '../discord-relay';
import { PermanentChatMessageError, RabbitChatTransport } from './rabbitmq';
import { createBridgeMetricsReporter } from './metrics-log';

const log = createLogger('CHAT BRIDGE');

export async function runChatBridge(): Promise<() => Promise<void>> {
  const config = getChatConfig();
  if (!config) {
    log.info('Live chat is disabled; Chat Bridge is not starting.');
    return async () => undefined;
  }
  const redis = getRedisClient();
  if (!redis) throw new Error('Chat Bridge requires REDIS_URL.');
  await redis.command(['PING']);
  const names = new ChatPlayerNames();
  const counters = { received: 0, persisted: 0, duplicates: 0, echoes: 0, rejected: 0, lastMessageAt: 0 };
  const transport = new RabbitChatTransport(
    config,
    async (routingKey, amqpMessage) => {
      counters.received += 1;
      const server = config.servers.find((entry) => entry.map === routingKey);
      const chat = decodeMapChat(amqpMessage.content);
      if (!server || !chat) {
        counters.rejected += 1;
        throw new PermanentChatMessageError('Invalid or unconfigured map chat event.');
      }
      const relay = parseDiscordRelay(chat.sender, chat.text, config.discordBotFuncomId);
      if (chat.sender === config.funcomId && !relay) {
        counters.echoes += 1;
        return;
      }
      const resolvedName = relay?.senderName ?? (await names.resolve(chat.sender));
      const timestamp = chat.timestamp ?? new Date().toISOString();
      const result = await appendChatMessage({
        id: chat.id,
        serverId: server.id,
        senderId: chat.sender,
        senderName:
          relay?.senderName ?? (resolvedName === chat.sender ? (chat.displayName ?? chat.sender) : resolvedName),
        source: relay ? 'discord' : 'game',
        content: chat.text,
        relayContent: relay?.content,
        timestamp,
        correlationId: chat.id,
        externalEventId: chat.id,
      });
      if (result.inserted) counters.persisted += 1;
      else counters.duplicates += 1;
      counters.lastMessageAt = Date.now();
    },
    (level, message) => log[level](message),
  );

  let closing = false;
  const healthServer: Server = createServer((request, response) => {
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('Content-Type', 'application/json');
    if (request.url === '/health') {
      response.writeHead(closing ? 503 : 200);
      response.end(JSON.stringify({ ok: !closing }));
      return;
    }
    if (request.url === '/ready') {
      void redis.command(['PING']).then(
        () => {
          const ready = transport.ready && !closing;
          response.writeHead(ready ? 200 : 503);
          response.end(JSON.stringify({ ready, rabbitmq: transport.ready, redis: true }));
        },
        () => {
          response.writeHead(503);
          response.end(JSON.stringify({ ready: false, rabbitmq: transport.ready, redis: false }));
        },
      );
      return;
    }
    if (request.url === '/metrics') {
      response.writeHead(200);
      response.end(JSON.stringify({ ...counters, ...transport.metrics, uptimeSeconds: process.uptime() }));
      return;
    }
    response.writeHead(404);
    response.end(JSON.stringify({ error: 'Not found' }));
  });
  await new Promise<void>((resolve, reject) => {
    healthServer.once('error', reject);
    healthServer.listen(config.healthPort, config.healthHost, () => resolve());
  });
  transport.start();
  const reportMetrics = createBridgeMetricsReporter(log);
  const metricsTimer = setInterval(() => {
    reportMetrics({
      ...counters,
      ...transport.metrics,
      ready: transport.ready,
    });
  }, 60_000);
  metricsTimer.unref();
  log.info('Chat Bridge started', {
    servers: config.servers.length,
    queue: 'broker-generated exclusive',
    healthPort: config.healthPort,
  });

  return async () => {
    if (closing) return;
    closing = true;
    clearInterval(metricsTimer);
    await transport.stop();
    await new Promise<void>((resolve) => healthServer.close(() => resolve()));
    redis.close();
    log.info('Chat Bridge stopped cleanly.');
  };
}

async function main() {
  const stop = await runChatBridge();
  const shutdown = () => {
    // Bounded shutdown: a wedged broker or Redis connection cannot hold the process open forever.
    setTimeout(() => {
      log.warn('Chat Bridge shutdown timed out; exiting.');
      process.exit(1);
    }, 15_000).unref();
    void stop().then(
      () => {
        process.exitCode = 0;
      },
      (error: unknown) => {
        log.error('Chat Bridge shutdown failed', error);
        process.exitCode = 1;
      },
    );
  };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  main().catch((error: unknown) => {
    log.fatal('Chat Bridge failed to start', error);
    process.exitCode = 1;
  });
