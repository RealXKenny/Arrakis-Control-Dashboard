import '../../../lib/assert-server';
import { z } from 'zod';
import { getServerEnv, requireServerEnv } from '../../../config/env';
import type { ChatServer } from '../contracts';
import { loadChatTls } from './tls';

let cachedConfig: { env: ReturnType<typeof getServerEnv>; config: ChatConfig } | undefined;

const serverSchema = z.object({
  id: z.string().regex(/^[a-z0-9][a-z0-9-]{0,63}$/),
  label: z
    .string()
    .trim()
    .min(1)
    .max(80)
    .refine((value) => !/[\u0000-\u001f\u007f]/u.test(value)),
  map: z.string().regex(/^[A-Za-z0-9_]+\.[A-Za-z0-9_]+$/),
});
const serversSchema = z
  .array(serverSchema)
  .min(1)
  .max(100)
  .superRefine((servers, context) => {
    const ids = new Set<string>();
    const maps = new Set<string>();
    for (const server of servers) {
      if (ids.has(server.id) || maps.has(server.map)) {
        context.addIssue({ code: 'custom', message: 'Chat server IDs and map routes must be unique.' });
        return;
      }
      ids.add(server.id);
      maps.add(server.map);
    }
  });

export function parseChatServers(value: string): ChatServer[] {
  try {
    return serversSchema.parse(JSON.parse(value));
  } catch {
    throw new Error(
      'CHAT_SERVERS must be a JSON array of unique {id,label,map} entries; IDs use lowercase slugs and maps use exact game routing keys.',
    );
  }
}

export function getChatConfig() {
  const env = getServerEnv();
  if (!env.CHAT_ENABLED) return null;
  if (cachedConfig?.env === env) return cachedConfig.config;
  requireServerEnv('RABBITMQ_URL', 'CHAT_BRIDGE_FUNCOM_ID', 'CHAT_SERVERS');
  const url = new URL(env.RABBITMQ_URL!);
  if (!url.hostname || !url.username || !url.password || url.hash)
    throw new Error('RABBITMQ_URL must include a host, username and password.');
  let username: string;
  try {
    username = decodeURIComponent(url.username);
    decodeURIComponent(url.password);
  } catch {
    throw new Error('RABBITMQ_URL credentials must be URL-encoded correctly.');
  }
  if (!/^[a-fA-F0-9]{16}$/.test(username))
    throw new Error('RABBITMQ_URL username must be the persona’s 16-character hexadecimal account ID.');
  if (url.protocol === 'amqp:' && env.RABBITMQ_TLS_SERVERNAME)
    throw new Error('RABBITMQ_TLS_SERVERNAME requires an amqps:// URL.');
  if (
    env.RABBITMQ_TLS_SERVERNAME &&
    !env.RABBITMQ_TLS_SERVERNAME.split('.').every((label) =>
      /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?$/.test(label),
    )
  )
    throw new Error('RABBITMQ_TLS_SERVERNAME must be a valid certificate DNS name.');
  if (/[\u0000-\u001f\u007f]/u.test(env.CHAT_BRIDGE_FUNCOM_ID!))
    throw new Error('CHAT_BRIDGE_FUNCOM_ID cannot contain control characters.');
  if (env.CHAT_BRIDGE_DISPLAY_NAME && /[\u0000-\u001f\u007f]/u.test(env.CHAT_BRIDGE_DISPLAY_NAME))
    throw new Error('CHAT_BRIDGE_DISPLAY_NAME cannot contain control characters.');
  if (!url.pathname || url.pathname === '/') url.pathname = '/%2F';
  url.searchParams.set('heartbeat', '30');

  const config = {
    url: url.toString(),
    username,
    funcomId: env.CHAT_BRIDGE_FUNCOM_ID!,
    discordBotFuncomId: env.CHAT_DISCORD_BOT_FUNCOM_ID,
    displayName: env.CHAT_BRIDGE_DISPLAY_NAME,
    servers: parseChatServers(env.CHAT_SERVERS!),
    caFile: env.RABBITMQ_CA_FILE,
    tlsServername: env.RABBITMQ_TLS_SERVERNAME,
    tls: loadChatTls(env, url),
    prefetch: env.CHAT_BRIDGE_PREFETCH,
    healthHost: env.CHAT_BRIDGE_HEALTH_HOST,
    healthPort: env.CHAT_BRIDGE_HEALTH_PORT,
    historyMaxMessages: env.CHAT_HISTORY_MAX_MESSAGES,
    historyRetentionDays: env.CHAT_HISTORY_RETENTION_DAYS,
    messageMaxChars: env.CHAT_MESSAGE_MAX_CHARS,
    sendRateLimit: env.CHAT_SEND_RATE_LIMIT,
    serverSendRateLimit: env.CHAT_SERVER_SEND_RATE_LIMIT,
    sendRateWindowMs: env.CHAT_SEND_RATE_WINDOW_SECONDS * 1_000,
  };
  cachedConfig = { env, config };
  return config;
}

export interface ChatConfig {
  url: string;
  username: string;
  funcomId: string;
  discordBotFuncomId?: string;
  displayName?: string;
  servers: ChatServer[];
  caFile?: string;
  tlsServername?: string;
  tls: import('node:tls').ConnectionOptions;
  prefetch: number;
  healthHost: string;
  healthPort: number;
  historyMaxMessages: number;
  historyRetentionDays: number;
  messageMaxChars: number;
  sendRateLimit: number;
  serverSendRateLimit: number;
  sendRateWindowMs: number;
}

export function getChatServer(serverId: string, config = getChatConfig()): ChatServer | null {
  return config?.servers.find((server) => server.id === serverId) ?? null;
}
