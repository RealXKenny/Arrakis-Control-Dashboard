import './assert-server';
import { z } from 'zod';

/**
 * Canonical server environment contract for the dashboard.
 *
 * This module is the single source of truth for environment validation;
 * `src/config/env.ts` re-exports it so legacy Pages Router modules keep
 * working against the shared runtime configuration. It may only be imported from
 * server-side code — `assert-server` throws at module load otherwise — so
 * secrets (CONSOLE_URL, CONSOLE_API_KEY, ADAPTER_TOKEN, Redis credentials)
 * can never reach a client bundle.
 *
 * Posture: parsing is strict about *shape* (malformed values fail loudly
 * without echoing their values) but permissive about *presence*, because
 * builds and tests must run without deployment secrets. `validateProductionEnv()`
 * closes the gap at runtime: in NODE_ENV=production it requires the full
 * secret set before the server accepts traffic (invoked from
 * src/instrumentation.ts during startup).
 */

const redisUrlSchema = z
  .string()
  .url()
  .refine((value) => {
    if (!URL.canParse(value)) return false;
    const url = new URL(value);
    return (
      ['redis:', 'rediss:'].includes(url.protocol) &&
      Boolean(url.hostname) &&
      !url.hash &&
      !url.search &&
      /^\/(\d+)?$|^$/.test(url.pathname)
    );
  });

const serverEnvSchema = z.object({
  LOG_LEVEL: z.enum(['DEBUG', 'INFO', 'WARN', 'ERROR', 'FATAL']).default('INFO'),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  SERVER_HOSTNAME: z
    .string()
    .trim()
    .min(1)
    .refine((value) => !/[\s\u0000-\u001f\u007f]/u.test(value))
    .default('127.0.0.1'),
  SERVER_PORT: z.coerce.number().int().min(1).max(65_535).default(2008),
  API_MAX_CONCURRENCY: z.coerce.number().int().min(1).max(10_000).default(100),
  API_GLOBAL_READ_LIMIT: z.coerce.number().int().min(1).max(100_000_000).default(2400),
  BOT_API_TOKEN: z.string().min(32).max(256).optional(),
  CONSOLE_URL: z.string().url().optional(),
  CONSOLE_API_KEY: z.string().min(1).optional(),
  ADMIN_CONSOLE_API_KEY: z.string().min(1).optional(),
  ADAPTER_TOKEN: z.string().min(1).optional(),
  DISCORD_CLIENT_ID: z.string().min(1).optional(),
  DISCORD_CLIENT_SECRET: z.string().min(1).optional(),
  APP_URL: z.string().url().optional(),
  DISCORD_GUILD_ID: z.string().min(1).optional(),
  VERIFIED_MEMBER_ROLE_ID: z.string().min(1).optional(),
  REDIS_URL: redisUrlSchema.optional(),
  /**
   * Optional comma-separated `host:port` list. When set, the dashboard data
   * provider connects through `ioredis` Cluster (with automatic failover and
   * slot refresh) instead of a single-node connection.
   */
  REDIS_CLUSTER_NODES: z
    .string()
    .min(1)
    .refine((value) => value.split(',').every((node) => /^\[[0-9a-fA-F:]+\]|^[^,\s]+(:\d{1,5})?$/.test(node.trim())))
    .optional(),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

let cachedEnv: ServerEnv | undefined;

export function getServerEnv(): ServerEnv {
  // Dev note: environment variables avoid arguments by preferring parameters.
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

export function getDiscordRedirectUri(): string | undefined {
  const appUrl = getServerEnv().APP_URL;
  return appUrl ? new URL('/auth/callback', appUrl).toString() : undefined;
}

/** Secrets and origins that must exist before production traffic is served. */
const PRODUCTION_REQUIREMENTS: ReadonlyArray<keyof ServerEnv> = [
  'CONSOLE_URL',
  'CONSOLE_API_KEY',
  'ADAPTER_TOKEN',
  'DISCORD_CLIENT_ID',
  'DISCORD_CLIENT_SECRET',
  'DISCORD_GUILD_ID',
  'VERIFIED_MEMBER_ROLE_ID',
  'APP_URL',
  'REDIS_URL',
];

export function validateProductionEnv(): ServerEnv {
  const env = getServerEnv();
  if (env.NODE_ENV !== 'production') return env;
  requireServerEnv(...PRODUCTION_REQUIREMENTS);
  const names = ['CONSOLE_URL', 'APP_URL'] as const;
  for (const name of names) {
    const value = env[name];
    if (!value) continue;
    const url = new URL(value);
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.hash)
      throw new Error(`Invalid production URL configuration: ${name}`);
    if (name === 'APP_URL' && (url.search || !['', '/'].includes(url.pathname)))
      throw new Error(`Invalid production URL configuration: ${name}`);
    if (
      name !== 'CONSOLE_URL' &&
      url.protocol !== 'https:' &&
      !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
    )
      throw new Error(`Production HTTPS is required: ${name}`);
  }
  return env;
}
