import '../lib/assert-server';
import { z } from 'zod';

const serverEnvSchema = z.object({
  API_DEBUG_ENABLED: z.enum(['true', 'false']).default('false'),
  LOG_LEVEL: z.enum(['DEBUG', 'INFO', 'WARN', 'ERROR', 'FATAL']).default('INFO'),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  POPULATION_HISTORY_ENABLED: z.enum(['true', 'false']).default('true'),
  STORAGE_BACKEND: z.enum(['redis', 'postgres']).default('redis'),
  DATABASE_URL: z
    .string()
    .url()
    .refine((value) => ['postgres:', 'postgresql:'].includes(new URL(value).protocol))
    .optional(),
  DATABASE_SSL_MODE: z.enum(['disable', 'require', 'verify-full']).default('require'),
  CONSOLE_API_KEY: z.string().min(1).optional(),
  SITE_NAME: z.string().min(1).max(80).default('Crimson Skies'),
  SITE_TITLE: z.string().min(1).max(120).default('Arrakis Control Dashboard'),
  SITE_SUBTITLE: z.string().min(1).max(120).default('Arrakis field companion'),
  SITE_DESCRIPTION: z
    .string()
    .min(1)
    .max(300)
    .default('Your Dune: Awakening character, holdings, live map and CHOAM market.'),
  SITE_HERO_EYEBROW: z.string().min(1).max(120).default('Your field companion for Arrakis'),
  SITE_HERO_TITLE: z.string().min(1).max(120).default('Know the sand.'),
  SITE_HERO_ACCENT: z.string().min(1).max(120).default('Own your signal.'),
  SITE_HERO_DESCRIPTION: z
    .string()
    .min(1)
    .max(500)
    .default(
      'A clear view of your character, territory, fleet, and the world around you—so every step into the desert starts with better intelligence.',
    ),
  SITE_COMMUNITY_TITLE: z.string().min(1).max(160).default('Find your crew before you find the spice.'),
  SITE_COMMUNITY_DESCRIPTION: z
    .string()
    .min(1)
    .max(500)
    .default('Join the conversation, share your next run, and stay close to the people shaping life across Arrakis.'),
  SITE_FOOTER: z.string().min(1).max(120).default('Explore. Prepare. Endure.'),
  SITE_DISCORD_INVITE_URL: z.string().url().default('https://discord.gg/crimsonskies'),
  SITE_DISCORD_WIDGET_GUILD_ID: z.string().regex(/^\d+$/).optional(),
  SITE_DISCORD_WIDGET_ENABLED: z.enum(['true', 'false']).default('true'),
  SITE_DEFAULT_MAP: z.enum(['HaggaBasin', 'DeepDesert']).default('HaggaBasin'),
  SITE_DEFAULT_DESTINATION: z.string().min(1).max(300).optional(),
  SITE_HAGGA_LABEL: z.string().min(1).max(80).default('Hagga Basin'),
  SITE_DEEP_DESERT_LABEL: z.string().min(1).max(80).default('Deep Desert'),
  SITE_THEME_TEXT: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .default('#ffe2a9'),
  SITE_THEME_MUTED: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .default('#b9a185'),
  SITE_THEME_ACCENT: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .default('#d2a85a'),
  SITE_THEME_BORDER: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .default('#503521'),
  SITE_THEME_BACKGROUND: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .default('#100905'),
  SITE_THEME_SURFACE: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .default('#54321b'),
  SITE_FEATURE_MARKET: z.enum(['true', 'false']).default('true'),
  SITE_FEATURE_MAPS: z.enum(['true', 'false']).default('true'),
  SITE_FEATURE_GUILDS: z.enum(['true', 'false']).default('true'),
  SITE_FEATURE_BASES: z.enum(['true', 'false']).default('true'),
  SITE_FEATURE_VEHICLES: z.enum(['true', 'false']).default('true'),
  SITE_FEATURE_POPULATION: z.enum(['true', 'false']).default('true'),
  SITE_FEATURE_BASE_IMPORTS: z.enum(['true', 'false']).default('true'),
  SITE_POLL_INTERVAL_MS: z.coerce.number().int().min(5000).max(300000).default(30000),
  SITE_REQUEST_TIMEOUT_MS: z.coerce.number().int().min(1000).max(120000).default(30000),
  SESSION_TTL_SECONDS: z.coerce.number().int().min(300).max(2592000).default(43200),
  POPULATION_RETENTION_SECONDS: z.coerce.number().int().min(3600).max(2592000).default(172800),
  BASE_IMPORT_DAILY_LIMIT: z.coerce.number().int().min(1).max(1000).default(10),
  GUILD_LOGO_MAX_BYTES: z.coerce.number().int().min(1024).max(5242880).default(524288),
  CONSOLE_URL: z.string().url().optional(),
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
  REDIS_URL: z
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
    })
    .optional(),
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
    'CONSOLE_API_KEY',
    'ADAPTER_TOKEN',
    'DISCORD_CLIENT_ID',
    'DISCORD_CLIENT_SECRET',
    'DISCORD_GUILD_ID',
    'DISCORD_REDIRECT_URI',
  );
  if (env.STORAGE_BACKEND === 'redis') requireServerEnv('REDIS_URL');
  else requireServerEnv('DATABASE_URL');
  if (!env.APP_URL && !env.DISCORD_APP_URL) throw new Error('Missing server environment configuration: APP_URL');
  const names = ['CONSOLE_URL', 'APP_URL', 'DISCORD_APP_URL', 'DISCORD_REDIRECT_URI'] as const;
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
