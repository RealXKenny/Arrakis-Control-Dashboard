import '../lib/assert-server';
import { z } from 'zod';

const serverEnvSchema = z.object({
  API_DEBUG_ENABLED: z.enum(['true', 'false']).default('false'),
  LOG_LEVEL: z.enum(['DEBUG', 'INFO', 'WARN', 'ERROR', 'FATAL']).default('INFO'),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  POPULATION_HISTORY_ENABLED: z.enum(['true', 'false']).default('true'),
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

/** Runtime gate: builds remain possible without deployment secrets. */
export function validateProductionEnv(): ServerEnv {
  const env = getServerEnv();
  if (env.NODE_ENV !== 'production') return env;
  requireServerEnv(
    'CONSOLE_URL',
    'CONSOLE_PASSWORD',
    'ADAPTER_TOKEN',
    'DISCORD_CLIENT_ID',
    'DISCORD_CLIENT_SECRET',
    'DISCORD_GUILD_ID',
    'DISCORD_REDIRECT_URI',
    'UPSTASH_REDIS_REST_URL',
    'UPSTASH_REDIS_REST_TOKEN',
  );
  if (!env.APP_URL && !env.DISCORD_APP_URL) throw new Error('Missing server environment configuration: APP_URL');
  const names: Array<keyof ServerEnv> = [
    'CONSOLE_URL',
    'UPSTASH_REDIS_REST_URL',
    'APP_URL',
    'DISCORD_APP_URL',
    'DISCORD_REDIRECT_URI',
  ];
  for (const name of names) {
    const value = env[name];
    if (!value) continue;
    const url = new URL(value);
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.hash)
      throw new Error(`Invalid production URL configuration: ${name}`);
    if (
      name !== 'CONSOLE_URL' &&
      url.protocol !== 'https:' &&
      !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
    )
      throw new Error(`Production HTTPS is required: ${name}`);
  }
  if (new URL(env.DISCORD_REDIRECT_URI!).origin !== new URL(env.APP_URL || env.DISCORD_APP_URL!).origin)
    throw new Error('Discord callback and application origins must match');
  return env;
}
