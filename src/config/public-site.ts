export type SiteFeatures = {
  market: boolean;
  maps: boolean;
  guilds: boolean;
  bases: boolean;
  vehicles: boolean;
  population: boolean;
  baseImports: boolean;
};

export type PublicSiteConfig = {
  name: string;
  title: string;
  subtitle: string;
  description: string;
  hero: { eyebrow: string; title: string; accent: string; description: string };
  community: { title: string; description: string };
  footer: string;
  discordInviteUrl: string;
  discordWidgetGuildId: string | null;
  discordWidgetEnabled: boolean;
  defaultMap: 'HaggaBasin' | 'DeepDesert';
  defaultDestinationKey: string | null;
  mapLabels: { HaggaBasin: string; DeepDesert: string };
  pollIntervalMs: number;
  requestTimeoutMs: number;
  guildLogoMaxBytes: number;
  theme: { text: string; muted: string; accent: string; border: string; background: string; surface: string };
  features: SiteFeatures;
};

export const defaultPublicSiteConfig: PublicSiteConfig = {
  name: 'Crimson Skies',
  title: 'Arrakis Control Dashboard',
  subtitle: 'Arrakis field companion',
  description: 'Your Dune: Awakening character, holdings, live map and CHOAM market.',
  hero: {
    eyebrow: 'Your field companion for Arrakis',
    title: 'Know the sand.',
    accent: 'Own your signal.',
    description:
      'A clear view of your character, territory, fleet, and the world around you—so every step into the desert starts with better intelligence.',
  },
  community: {
    title: 'Find your crew before you find the spice.',
    description:
      'Join the conversation, share your next run, and stay close to the people shaping life across Arrakis.',
  },
  footer: 'Explore. Prepare. Endure.',
  discordInviteUrl: 'https://discord.gg/crimsonskies',
  discordWidgetGuildId: '1532230917249302588',
  discordWidgetEnabled: true,
  defaultMap: 'HaggaBasin',
  defaultDestinationKey: null,
  mapLabels: { HaggaBasin: 'Hagga Basin', DeepDesert: 'Deep Desert' },
  pollIntervalMs: 30000,
  requestTimeoutMs: 30000,
  guildLogoMaxBytes: 524288,
  theme: {
    text: '#ffe2a9',
    muted: '#b9a185',
    accent: '#d2a85a',
    border: '#503521',
    background: '#100905',
    surface: '#54321b',
  },
  features: {
    market: true,
    maps: true,
    guilds: true,
    bases: true,
    vehicles: true,
    population: true,
    baseImports: true,
  },
};
