import '../lib/assert-server';
import { z } from 'zod';

/**
 * Canonical server environment contract for the dashboard.
 *
 * This module is the single source of truth for environment validation
 * for both App Router and legacy Pages Router modules. It may only be imported from
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
  /** Comma-separated Discord user IDs allowed to use the administrator workspace. Required in production; development defaults to the project owner. */
  ADMIN_DISCORD_IDS: z
    .string()
    .regex(/^\d{1,25}(\s*,\s*\d{1,25})*$/, 'Must be a comma-separated list of Discord user IDs')
    .optional(),
  /** Destructive administrator operations (deletes, confirmed actions, archive downloads) need a sign-in this recent. */
  ADMIN_HIGH_RISK_REAUTH_MINUTES: z.coerce.number().int().min(5).max(1440).default(60),
  /** Administrator changes need an interactive sign-in within this many hours; reads are unaffected. */
  ADMIN_REAUTH_HOURS: z.coerce.number().int().min(1).max(168).default(12),
  /** Server-only HMAC secret for marketplace owner keys. Optional: derived from AUTH_SECRET when absent. */
  OWNER_KEY_SECRET: z.string().min(32).max(256).optional(),
  /** Security audit trail: readable entries on stdout and structured records in a bounded Redis sorted set. */
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
  /** Reviewed season game rewards. Independent from casino; never enables automatic execution. */
  SEASON_GAME_DELIVERY_ENABLED: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
  ADAPTER_TOKEN: z.string().min(1).optional(),
  /**
   * Solaris Exchange: real Solaris deposits, withdrawals and play. Off unless explicitly set to `true`; the server
   * refuses every wager and transfer while it is off. See docs/features/solaris-exchange.md before enabling.
   */
  CASINO_SOLARIS_ENABLED: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
  /** Largest single wager (whole Solaris) and largest payout of one round. Conservative defaults; raise deliberately. */
  CASINO_MAX_WAGER: z.coerce.number().int().min(1).max(1_000_000_000_000).default(10_000),
  CASINO_MAX_PAYOUT: z.coerce.number().int().min(1).max(1_000_000_000_000).default(1_000_000),
  /** Optional live game chat. The bridge and web publisher share the bot-compatible game broker protocol. */
  CHAT_ENABLED: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
  RABBITMQ_URL: z
    .string()
    .url()
    .refine((value) => ['amqp:', 'amqps:'].includes(new URL(value).protocol))
    .optional(),
  CHAT_BRIDGE_FUNCOM_ID: z.string().min(1).max(200).optional(),
  CHAT_DISCORD_BOT_FUNCOM_ID: z
    .string()
    .trim()
    .min(1)
    .max(200)
    .refine((value) => !/[\u0000-\u001f\u007f]/u.test(value))
    .optional(),
  CHAT_BRIDGE_DISPLAY_NAME: z.string().min(1).max(80).optional(),
  CHAT_SERVERS: z.string().min(2).max(32_768).optional(),
  RABBITMQ_CA_FILE: z.string().min(1).max(4096).optional(),
  RABBITMQ_TLS_ENABLED: z
    .enum(['true', 'false'])
    .optional()
    .transform((value) => (value === undefined ? undefined : value === 'true')),
  RABBITMQ_TLS_CA: z.string().min(1).max(262_144).optional(),
  RABBITMQ_TLS_CERT: z.string().min(1).max(262_144).optional(),
  RABBITMQ_TLS_KEY: z.string().min(1).max(65_536).optional(),
  RABBITMQ_TLS_CA_PATH: z.string().min(1).max(4096).optional(),
  RABBITMQ_TLS_CERT_PATH: z.string().min(1).max(4096).optional(),
  RABBITMQ_TLS_KEY_PATH: z.string().min(1).max(4096).optional(),
  RABBITMQ_TLS_REJECT_UNAUTHORIZED: z
    .literal('true')
    .default('true')
    .transform(() => true as const),
  RABBITMQ_TLS_SERVERNAME: z.string().min(1).max(253).optional(),
  /** Legacy setting accepted for compatibility; receive queues are always broker-generated. */
  CHAT_BRIDGE_QUEUE: z
    .string()
    .regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/)
    .default('arrakis.dashboard.chat.v1'),
  CHAT_BRIDGE_PREFETCH: z.coerce.number().int().min(1).max(100).default(20),
  CHAT_BRIDGE_HEALTH_HOST: z.string().min(1).max(253).default('127.0.0.1'),
  CHAT_BRIDGE_HEALTH_PORT: z.coerce.number().int().min(1).max(65_535).default(2010),
  CHAT_HISTORY_MAX_MESSAGES: z.coerce.number().int().min(50).max(100_000).default(10_000),
  CHAT_HISTORY_RETENTION_DAYS: z.coerce.number().int().min(1).max(90).default(7),
  CHAT_MESSAGE_MAX_CHARS: z.coerce.number().int().min(100).max(1_800).default(1_000),
  CHAT_SEND_RATE_LIMIT: z.coerce.number().int().min(1).max(1_000).default(10),
  CHAT_SERVER_SEND_RATE_LIMIT: z.coerce.number().int().min(1).max(10_000).default(60),
  CHAT_SEND_RATE_WINDOW_SECONDS: z.coerce.number().int().min(1).max(300).default(10),
  DISCORD_CLIENT_ID: z.string().min(1).optional(),
  DISCORD_CLIENT_SECRET: z.string().min(1).optional(),
  APP_URL: z.string().url().optional(),
  /** Signs and encrypts Auth.js state and the stored Discord refresh token. At least 32 random characters. */
  AUTH_SECRET: z.string().min(32).max(256).optional(),
  DISCORD_GUILD_ID: z.string().min(1).optional(),
  VERIFIED_MEMBER_ROLE_ID: z.string().min(1).optional(),
  REDIS_URL: redisUrlSchema.optional(),
  /** Escape hatch for the one combination production refuses: plain-text Redis on a public-looking host with no password. */
  REDIS_ALLOW_INSECURE: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
  /** When "true", production refuses to start unless Redis is reached over TLS (rediss://). Opt-in so existing deployments keep booting. */
  REDIS_REQUIRE_TLS: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
  /** Shared server-only bot identity for Discord announcements; never exposed to the browser. */
  DISCORD_BOT_TOKEN: z
    .string()
    .min(20)
    .max(256)
    .regex(/^[A-Za-z0-9._-]+$/)
    .optional(),
  CHANGELOG_CHANNEL_ID: z
    .string()
    .regex(/^\d{15,25}$/)
    .optional(),
  COMMUNITY_EVENTS_CHANNEL_ID: z
    .string()
    .regex(/^\d{15,25}$/)
    .optional(),
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
  // ADMIN_DISCORD_IDS has no production default: no administrator is implied by the code.
  requireServerEnv(...PRODUCTION_REQUIREMENTS, 'DISCORD_CLIENT_ID', 'DISCORD_CLIENT_SECRET', 'ADMIN_DISCORD_IDS');
  if (env.CHAT_ENABLED) requireServerEnv('RABBITMQ_URL', 'CHAT_BRIDGE_FUNCOM_ID', 'CHAT_SERVERS');
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
  if (!url.password)
    warnings.push('REDIS_URL carries no password; make sure Redis is not reachable from untrusted networks.');
  return warnings;
}
