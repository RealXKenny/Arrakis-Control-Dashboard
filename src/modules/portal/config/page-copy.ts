import type { PortalView } from './navigation';

export const portalPageCopy: Record<PortalView, { section: string; title: string; description: string }> = {
  hagga: {
    section: 'Desert atlas',
    title: 'Hagga Basin',
    description: 'Explore resources, holdings and the latest readings from your starting region.',
  },
  'deep-desert': {
    section: 'Desert atlas',
    title: 'Deep Desert',
    description: 'Explore spice fields, resources and the latest desert readings.',
  },
  overview: {
    section: 'Workspace overview',
    title: 'Dashboard',
    description: 'Your character, holdings and the latest readings from the desert.',
  },
  character: {
    section: 'Your profile',
    title: 'Character',
    description:
      'Your vitals, faction standing, specializations, journey and equipped gear. A complete reading of your character.',
  },
  storage: {
    section: 'Personal inventory',
    title: 'Storage',
    description:
      'Your personal reserves, backpack and equipped inventory. Browse containers, search for an item, or switch between the grid and list.',
  },
  market: {
    section: 'Community market',
    title: 'Exchange',
    description:
      'Every open listing on the server market, with available stock, grades, asking prices, and suggested sell values in one full-width workspace.',
  },
  bases: {
    section: 'Your holdings',
    title: 'Bases',
    description:
      'Your bases and shared holdings, their remaining power, water and storage. Export an owned base as a blueprint.',
  },
  'base-preview': {
    section: 'Your holdings',
    title: 'Base preview',
    description: 'Walk around your structures in a full-screen desert setting.',
  },
  'base-market': {
    section: 'Community blueprints',
    title: 'Base Marketplace',
    description: 'Browse community-shared bases, inspect their layouts in 3D, and download sanitized blueprints.',
  },
  vehicles: {
    section: 'Vehicle network',
    title: 'Vehicles',
    description:
      'Your owned and shared fleet. Inspect condition, fuel where applicable, and cargo capacity before your next journey.',
  },
  guild: {
    section: 'Your community',
    title: 'Guilds',
    description: 'Your guild, its members, and your role in the community.',
  },
};
