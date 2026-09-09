import '../lib/assert-server';
import { getServerEnv } from './env';
import type { PublicSiteConfig } from './public-site';

export function loadPublicSiteConfig(): PublicSiteConfig {
  const env = getServerEnv();
  return {
    name: env.SITE_NAME,
    title: env.SITE_TITLE,
    subtitle: env.SITE_SUBTITLE,
    description: env.SITE_DESCRIPTION,
    hero: {
      eyebrow: env.SITE_HERO_EYEBROW,
      title: env.SITE_HERO_TITLE,
      accent: env.SITE_HERO_ACCENT,
      description: env.SITE_HERO_DESCRIPTION,
    },
    community: { title: env.SITE_COMMUNITY_TITLE, description: env.SITE_COMMUNITY_DESCRIPTION },
    footer: env.SITE_FOOTER,
    discordInviteUrl: env.SITE_DISCORD_INVITE_URL,
    discordWidgetGuildId: env.SITE_DISCORD_WIDGET_GUILD_ID ?? null,
    discordWidgetEnabled: env.SITE_DISCORD_WIDGET_ENABLED === 'true',
    defaultMap: env.SITE_DEFAULT_MAP,
    defaultDestinationKey: env.SITE_DEFAULT_DESTINATION ?? null,
    mapLabels: { HaggaBasin: env.SITE_HAGGA_LABEL, DeepDesert: env.SITE_DEEP_DESERT_LABEL },
    pollIntervalMs: env.SITE_POLL_INTERVAL_MS,
    requestTimeoutMs: env.SITE_REQUEST_TIMEOUT_MS,
    guildLogoMaxBytes: env.GUILD_LOGO_MAX_BYTES,
    theme: {
      text: env.SITE_THEME_TEXT,
      muted: env.SITE_THEME_MUTED,
      accent: env.SITE_THEME_ACCENT,
      border: env.SITE_THEME_BORDER,
      background: env.SITE_THEME_BACKGROUND,
      surface: env.SITE_THEME_SURFACE,
    },
    features: {
      market: env.SITE_FEATURE_MARKET === 'true',
      maps: env.SITE_FEATURE_MAPS === 'true',
      guilds: env.SITE_FEATURE_GUILDS === 'true',
      bases: env.SITE_FEATURE_BASES === 'true',
      vehicles: env.SITE_FEATURE_VEHICLES === 'true',
      population: env.SITE_FEATURE_POPULATION === 'true',
      baseImports: env.SITE_FEATURE_BASE_IMPORTS === 'true',
    },
  };
}
