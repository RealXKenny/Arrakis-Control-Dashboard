import '../lib/assert-server';
import { z } from 'zod';
import { isDiscordWebhookUrl } from '../lib/discord-webhook-url';

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
  /** Reverse proxies in front of the app. Rate limits trust only the X-Forwarded-For entry the last of them appended. */
  TRUSTED_PROXY_COUNT: z.coerce.number().int().min(0).max(5).default(1),
  API_GLOBAL_READ_LIMIT: z.coerce.number().int().min(1).max(100_000_000).default(2400),
  /** Comma-separated Discord user IDs allowed to use the administrator workspace. Defaults to the project owner. */
  ADMIN_DISCORD_IDS: z
    .string()
    .regex(/^\d{1,25}(\s*,\s*\d{1,25})*$/, 'Must be a comma-separated list of Discord user IDs')
    .optional(),
  /** Administrator changes need an interactive sign-in within this many hours; reads are unaffected. */
  /** Destructive administrator operations (deletes, confirmed actions, archive downloads) need a sign-in this recent. */
  ADMIN_HIGH_RISK_REAUTH_MINUTES: z.coerce.number().int().min(5).max(1440).default(60),
  ADMIN_REAUTH_HOURS: z.coerce.number().int().min(1).max(168).default(12),
  /** Server-only HMAC secret for marketplace owner keys. Optional: derived from AUTH_SECRET when absent. */
  OWNER_KEY_SECRET: z.string().min(32).max(256).optional(),
  /** Security audit trail: JSON lines on stdout (for log shipping) and a bounded Redis sorted set. */
  AUDIT_LOG_STDOUT: z
    .enum(['true', 'false'])
    .default('true')
    .transform((value) => value === 'true'),
  AUDIT_LOG_REDIS: z
    .enum(['true', 'false'])
    .default('true')
    .transform((value) => value === 'true'),
  AUDIT_LOG_RETENTION_DAYS: z.coerce.number().int().min(1).max(3650).default(90),
  AUDIT_LOG_MAX_ENTRIES: z.coerce.number().int().min(100).max(1_000_000).default(10_000),
  BOT_API_TOKEN: z.string().min(32).max(256).optional(),
  CONSOLE_URL: z.string().url().optional(),
  CONSOLE_API_KEY: z.string().min(1).optional(),
  ADMIN_CONSOLE_API_KEY: z.string().min(1).optional(),
  ADAPTER_TOKEN: z.string().min(1).optional(),
  DISCORD_CLIENT_ID: z.string().min(1).optional(),
  DISCORD_CLIENT_SECRET: z.string().min(1).optional(),
  APP_URL: z.string().url().optional(),
  /** Signs and encrypts Auth.js state and the stored Discord refresh token. At least 32 random characters. */
  AUTH_SECRET: z.string().min(32).max(256).optional(),
  DISCORD_GUILD_ID: z.string().min(1).optional(),
  VERIFIED_MEMBER_ROLE_ID: z.string().min(1).optional(),
  REDIS_URL: redisUrlSchema.optional(),
  /** When "true", production refuses to start unless Redis is reached over TLS (rediss://). Opt-in so existing deployments keep booting. */
  /** Escape hatch for the one combination production refuses: plain-text Redis on a public-looking host with no password. */
  REDIS_ALLOW_INSECURE: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
  REDIS_REQUIRE_TLS: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
  /** Discord webhook that receives changelog and progress announcements. A secret: never log or expose it. */
  CHANGELOG_WEBHOOK_URL: z.string().refine(isDiscordWebhookUrl, 'Must be a Discord webhook URL').optional(),
  /** When "true", a newly deployed release in CHANGELOG.md is announced once, automatically. */
  CHANGELOG_AUTO_ANNOUNCE: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
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
  return appUrl ? new URL('/api/auth/callback/discord', appUrl).toString() : undefined;
}

/** Secrets and origins that must exist before production traffic is served. */
const PRODUCTION_REQUIREMENTS: ReadonlyArray<keyof ServerEnv> = [
  'CONSOLE_URL',
  'CONSOLE_API_KEY',
  'ADAPTER_TOKEN',
  'DISCORD_GUILD_ID',
  'VERIFIED_MEMBER_ROLE_ID',
  'APP_URL',
  'REDIS_URL',
  'AUTH_SECRET',
];

export function validateProductionEnv(): ServerEnv {
  const env = getServerEnv();
  if (env.NODE_ENV !== 'production') return env;
  requireServerEnv(...PRODUCTION_REQUIREMENTS, 'DISCORD_CLIENT_ID', 'DISCORD_CLIENT_SECRET');
  const redisUrl = new URL(env.REDIS_URL!);
  // Sessions and sealed refresh tokens live in Redis: never serve traffic against an open, unauthenticated, unencrypted one.
  if (
    redisUrl.protocol === 'redis:' &&
    !redisUrl.password &&
    !PRIVATE_HOST.test(redisUrl.hostname) &&
    !env.REDIS_ALLOW_INSECURE
  )
    throw new Error(
      'REDIS_URL is plain-text and unauthenticated on a public-looking host. Add a password or TLS (rediss://), or set REDIS_ALLOW_INSECURE=true to accept the risk.',
    );
  if (env.REDIS_REQUIRE_TLS && redisUrl.protocol !== 'rediss:')
    throw new Error('REDIS_REQUIRE_TLS is enabled: REDIS_URL must use rediss://');
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

const PRIVATE_HOST = /^(localhost$|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|\[?::1\]?$|[^.]+$)/i;

/**
 * Plain-text Redis is acceptable on loopback or a private network, but sessions and sealed refresh tokens live
 * there. Returns human-readable warnings (never credentials) for production deployments that look exposed.
 */
export function redisTransportWarnings(
  env: Pick<ServerEnv, 'NODE_ENV' | 'REDIS_URL' | 'REDIS_CLUSTER_NODES'>,
): string[] {
  if (env.NODE_ENV !== 'production' || !env.REDIS_URL) return [];
  const url = new URL(env.REDIS_URL);
  const warnings: string[] = [];
  if (url.protocol === 'redis:' && !PRIVATE_HOST.test(url.hostname))
    warnings.push('REDIS_URL uses unencrypted redis:// to a public-looking host; use rediss:// or a private network.');
  if (env.REDIS_CLUSTER_NODES && url.protocol !== 'rediss:')
    warnings.push(
      'REDIS_CLUSTER_NODES takes its TLS setting from REDIS_URL; use rediss:// if the cluster requires TLS.',
    );
  if (!url.password)
    warnings.push('REDIS_URL carries no password; make sure Redis is not reachable from untrusted networks.');
  return warnings;
}
