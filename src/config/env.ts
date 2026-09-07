import '../lib/assert-server';
import { z } from 'zod';

const serverEnvSchema = z.object({
  LOG_LEVEL: z.enum(['DEBUG', 'INFO', 'WARN', 'ERROR', 'FATAL']).default('INFO'),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  POPULATION_HISTORY_ENABLED: z.enum(['true', 'false']).default('true'),
  LIVE_EVENTS_ENABLED: z.enum(['true', 'false']).default('false'),
  RABBITMQ_URL: z.string().url().startsWith('amqps://').optional(),
  RABBITMQ_MANAGEMENT_URL: z.string().url().optional(),
  RABBITMQ_CA_PEM: z.string().optional(),
  RABBITMQ_TLS_SERVERNAME: z.string().optional(),
  LIVE_EVENTS_ADMIN_ROLE_IDS: z
    .string()
    .regex(/^(\d+(,\d+)*)?$/)
    .default(''),
  CONSOLE_URL: z.string().url().optional(),
  CONSOLE_PASSWORD: z.string().min(1).optional(),
  ADAPTER_TOKEN: z.string().min(1).optional(),
  DISCORD_CLIENT_ID: z.string().min(1).optional(),
  DISCORD_CLIENT_SECRET: z.string().min(1).optional(),
  DISCORD_REDIRECT_URI: z.string().url().optional(),
  DISCORD_APP_URL: z.string().url().optional(),
  APP_URL: z.string().url().optional(),
  DISCORD_GUILD_ID: z.string().min(1).optional(),
  VERIFIED_MEMBER_ROLE_ID: z.string().min(1).optional(),
  SENTRY_DSN: z.string().url().optional(),
  NEXT_PUBLIC_SENTRY_DSN: z.string().url().optional(),
  SENTRY_AUTH_TOKEN: z.string().min(1).optional(),
  SENTRY_ORG: z.string().min(1).optional(),
  SENTRY_PROJECT: z.string().min(1).optional(),
  SENTRY_ENABLED: z.enum(['true', 'false']).default('false'),
  UPSTASH_REDIS_REST_URL: z.string().url().optional(),
  UPSTASH_REDIS_REST_TOKEN: z.string().min(1).optional(),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

let cachedEnv: ServerEnv | undefined;

export function getServerEnv(): ServerEnv {
  if (cachedEnv) {
    return cachedEnv;
  }

  const parsed = serverEnvSchema.safeParse(
    Object.fromEntries(Object.entries(process.env).map(([key, value]) => [key, value === '' ? undefined : value])),
  );
  if (!parsed.success) {
    const fields = parsed.error.issues.map((issue) => issue.path.join('.')).join(', ');
    throw new Error(`Invalid server environment configuration: ${fields}`);
  }

  cachedEnv = parsed.data;
  return cachedEnv;
}

export function requireServerEnv(...keys: Array<keyof ServerEnv>): ServerEnv {
  const env = getServerEnv();
  const missing = keys.filter((key) => !env[key]);
  if (missing.length > 0) {
    throw new Error(`Missing server environment configuration: ${missing.join(', ')}`);
  }
  return env;
}
