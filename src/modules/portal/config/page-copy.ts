import type { PortalView } from './navigation';

export const portalPageCopy: Record<PortalView, { section: string; title: string; description: string }> = {
  live: {
    section: 'Server observations',
    title: 'Live Intel',
    description: 'Instance readings and observed activity from the Dune message broker.',
  },
  overview: {
    section: 'Arrakis | Field report',
    title: 'Dashboard',
    description: 'Your character, holdings and the latest readings from the desert.',
  },
  character: {
    section: 'Character dossier',
    title: 'Character',
    description:
      'Your vitals, faction standing, specializations, journey and equipped gear. A complete reading of your character.',
  },
  storage: {
    section: 'CHOAM vault',
    title: 'Storage',
    description:
      'Your personal reserves, backpack and equipped inventory. Browse containers, search for an item, or switch between the grid and list.',
  },
  market: {
    section: 'CHOAM exchange',
    title: 'Exchange',
    description:
      'Every open listing on the server market, with available stock, grades and asking prices. Select an item to inspect its price ladder.',
  },
  bases: {
    section: 'Solido blueprints',
    title: 'Bases',
    description:
      'Your bases and shared holdings, their remaining power, water and storage. Export an owned base as a blueprint.',
  },
  vehicles: {
    section: 'Vehicle network',
    title: 'Vehicles',
    description:
      'Your owned and shared fleet. Inspect fuel, condition and remaining reserves before your next journey.',
  },
  guild: {
    section: 'Sietch registry',
    title: 'Guilds',
    description: 'Your guild membership and rank within the sietch.',
  },
};
