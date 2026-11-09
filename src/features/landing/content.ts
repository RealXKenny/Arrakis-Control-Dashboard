import type { ComponentType, SVGProps } from 'react';
import {
  BaseIcon,
  BroadcastIcon,
  CasinoIcon,
  CharacterIcon,
  GuildIcon,
  MapIcon,
  MarketIcon,
  VehicleIcon,
} from '../../components/icons';

/**
 * The landing page's words, in one place.
 *
 * Rules for editing this file:
 *  - Say only what the running product does. Every entry below was checked against `docs/features/` and the code that
 *    serves its route. Do not describe planned or unfinished work (for example Community Events and Service Status are
 *    left out until they are released).
 *  - No statistics, counts, testimonials or sample figures. Illustrations show layout, never data.
 *  - Link only to routes that exist in `src/app/`. Feature links point at signed-in routes on purpose: a signed-out
 *    visitor is sent to sign in first, so link labels describe the feature and never promise to open it directly.
 *  - Keep terminology identical to the dashboard: "Portal", "Holdings", "Base Marketplace", "Live Chat", "Guild Directory".
 */

type IconType = ComponentType<SVGProps<SVGSVGElement>>;

export const HERO = {
  eyebrow: 'Dune: Awakening community dashboard',
  headline: ['Arrakis', 'Control'],
  lead: 'A modern command center for Dune: Awakening servers, players, guilds, and communities.',
  body: 'Sign in with Discord to see your character and holdings, explore the map, join a guild, share base designs and, where your server has it enabled, talk to the game in live chat. Server operators get an audited administration panel for the same Console.',
} as const;

export const PILLARS = [
  {
    title: 'For players',
    text: 'Your character, holdings, storage and vehicles, read from the game server through your linked character.',
  },
  {
    title: 'For communities',
    text: 'Guild recruitment and rosters, a shared base marketplace, and chat between the game and the dashboard.',
  },
  {
    title: 'For operators',
    text: 'An administration panel over the Dune Console with its own credentials, recent sign-in checks for risky changes, and an audit trail.',
  },
] as const;

export type Featured = {
  id: 'map' | 'guilds';
  eyebrow: string;
  title: string;
  summary: string;
  points: readonly string[];
  href: string;
  linkLabel: string;
  icon: IconType;
};

export const FEATURED: readonly Featured[] = [
  {
    id: 'map',
    eyebrow: 'Maps',
    title: 'Interactive 2D and 3D maps',
    summary:
      'Hagga Basin and the Deep Desert, with markers, your bases, vehicles and online players. Switch between a flat map and 3D terrain; if a browser cannot run WebGL2, the 2D map still works.',
    points: [
      'Find a base, vehicle or location by name',
      'Turn marker layers on and off, with contours and a top-down view',
      'An optional realtime layer, when the server provides realtime data',
    ],
    href: '/map',
    linkLabel: 'Open the map',
    icon: MapIcon,
  },
  {
    id: 'guilds',
    eyebrow: 'Guilds',
    title: 'Recruit, apply and run a guild',
    summary:
      'A directory of published recruitment listings. Players apply with the questions a guild chooses; leaders review applications, manage the roster and can reach the administrators from the same place.',
    points: [
      'Application questions: short text, paragraphs, dropdowns, time zones, checkboxes and numbers',
      'Leader-only settings, roster management and application inbox',
      'A support conversation between a guild leader and the administrators',
    ],
    href: '/guilds',
    linkLabel: 'Browse the Guild Directory',
    icon: GuildIcon,
  },
];

export type Capability = {
  id: string;
  title: string;
  summary: string;
  href: string;
  icon: IconType;
  /** A short, honest qualifier shown on the card when the feature depends on the server operator. */
  note?: string;
};

export const CAPABILITIES: readonly Capability[] = [
  {
    id: 'character',
    title: 'Character and holdings',
    summary:
      'Progression, factions and inventory for your character, plus owned and shared bases, base storage and a 3D preview of the bases you own.',
    href: '/character',
    icon: CharacterIcon,
  },
  {
    id: 'vehicles',
    title: 'Vehicles',
    summary: 'The vehicles you can access, with your access level, status and the location data the Console provides.',
    href: '/vehicles',
    icon: VehicleIcon,
  },
  {
    id: 'market',
    title: 'CHOAM market',
    summary:
      'Exchange items grouped by item with full-precision prices, the listings behind them, and your own listings.',
    href: '/market',
    icon: MarketIcon,
  },
  {
    id: 'bases',
    title: 'Base Marketplace',
    summary:
      'Share a base blueprint with a front picture. Others browse the newest layouts, inspect them in an interactive preview and import them.',
    href: '/bases',
    icon: BaseIcon,
  },
  {
    id: 'chat',
    title: 'Live Chat',
    summary:
      'Map chat from the game appears in the dashboard as it happens, and members can write back. Recent history is kept.',
    href: '/chat',
    icon: BroadcastIcon,
    note: 'Optional: a server operator turns it on',
  },
  {
    id: 'casino',
    title: 'The Solaris Exchange',
    summary:
      'Six table games, blackjack, roulette, dice, mines, crash and coin flip, played with real in-game Solaris from a casino wallet. Each finished round can be checked against seeds committed in advance.',
    href: '/casino',
    icon: CasinoIcon,
    note: 'Closed by default: a server administrator must switch it on',
  },
];

export const OPERATOR = {
  eyebrow: 'For server operators',
  title: 'Built to be run, not just looked at',
  summary:
    'Arrakis Control is a Node.js application with Redis as its only database. It runs directly or on Pterodactyl, and talks to your Dune Console with the keys you give it.',
  points: [
    'Discord sign-in, checked against your server role and re-checked while members stay signed in',
    'An administration panel over the Console, using credentials separate from member features',
    'Risky changes need a recent sign-in, and administrator actions go to an audit trail',
    'Member pages read only the signed-in member’s own linked character',
  ],
} as const;

export const FINAL = {
  signedOut: {
    eyebrow: 'Get started',
    title: 'Open your command center',
    text: 'Sign in with Discord. Access is verified against your server role.',
  },
  signedIn: {
    eyebrow: 'Welcome back',
    title: 'Your command center is ready',
    text: 'Your holdings, community and map are waiting in the dashboard.',
  },
} as const;
