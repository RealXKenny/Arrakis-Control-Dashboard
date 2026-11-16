export type NavigationIcon =
  | 'assets'
  | 'bases'
  | 'casino'
  | 'character'
  | 'chat'
  | 'changelog'
  | 'guilds'
  | 'holdings'
  | 'home'
  | 'map'
  | 'market'
  | 'more'
  | 'portal'
  | 'preview'
  | 'storage'
  | 'status'
  | 'upload'
  | 'vehicles';

export interface NavigationItem {
  readonly id: string;
  readonly label: string;
  readonly href?: string;
  readonly exact?: boolean;
  readonly icon?: NavigationIcon;
  readonly description?: string;
  readonly children?: readonly NavigationItem[];
  readonly featureFlag?: string;
  readonly badge?: string;
  readonly order: number;
  readonly align?: 'left' | 'right';
  readonly tabletOverflow?: boolean;
  /** Use a document load when crossing routes with a distinct document security policy. */
  readonly documentNavigation?: boolean;
}

export type NavigationVisibility = {
  readonly featureFlags?: Readonly<Record<string, boolean>>;
  readonly badges?: Readonly<Record<string, string>>;
};

export const SIGN_IN_HREF = '/login';

export const NAVIGATION_ITEMS: readonly NavigationItem[] = [
  // Every dropdown uses the same layout: an intro panel plus titled groups of destinations.
  // Home is the public landing page (`src/app/page.tsx`). `exact` keeps it from lighting up on every route.
  {
    id: 'home',
    label: 'Home',
    href: '/',
    exact: true,
    icon: 'home',
    description: 'The Arrakis Control landing page.',
    order: 5,
  },
  { id: 'portal', label: 'Portal', href: '/portal', icon: 'portal', order: 10 },
  { id: 'character', label: 'Character', href: '/character', icon: 'character', order: 20 },
  {
    id: 'assets',
    label: 'Assets',
    icon: 'assets',
    description: 'Your holdings, shared bases, and vehicles.',
    order: 30,
    children: [
      {
        id: 'assets-holdings',
        label: 'Holdings',
        icon: 'holdings',
        order: 10,
        children: [
          {
            id: 'holdings',
            label: 'Holdings',
            href: '/holdings',
            exact: true,
            icon: 'holdings',
            description: 'Owned and shared bases, access, and details.',
            order: 10,
          },
        ],
      },
      {
        id: 'assets-fleet',
        label: 'Fleet',
        icon: 'vehicles',
        order: 20,
        children: [
          {
            id: 'vehicles',
            label: 'Vehicles',
            href: '/vehicles',
            icon: 'vehicles',
            description: 'Owned and shared vehicles, fuel, and cargo.',
            order: 10,
          },
        ],
      },
    ],
  },
  {
    id: 'bases',
    label: 'Bases',
    icon: 'bases',
    description: 'Community blueprints, base storage, and immersive previews.',
    order: 40,
    children: [
      {
        id: 'base-community',
        label: 'Community',
        icon: 'bases',
        order: 10,
        children: [
          {
            id: 'base-marketplace',
            label: 'Base Marketplace',
            href: '/bases',
            icon: 'bases',
            description: 'Browse, inspect, and import community layouts.',
            order: 10,
          },
          {
            id: 'base-upload',
            label: 'Share a base',
            href: '/bases/upload',
            icon: 'upload',
            description: 'Upload a blueprint and choose its front view.',
            order: 20,
          },
        ],
      },
      {
        id: 'base-operations',
        label: 'Operations',
        icon: 'storage',
        order: 20,
        children: [
          {
            id: 'holdings-preview',
            label: '3D preview',
            href: '/holdings/preview',
            icon: 'preview',
            description: 'Inspect your owned bases in the interactive renderer.',
            order: 10,
          },
          {
            id: 'storage',
            label: 'Base Storage',
            href: '/storage',
            icon: 'storage',
            description: 'Browse containers and their contents.',
            order: 20,
          },
        ],
      },
    ],
  },
  { id: 'market', label: 'Market', href: '/market', icon: 'market', order: 50 },
  {
    id: 'guilds',
    label: 'Guilds',
    icon: 'guilds',
    description: 'Find your community, manage your roster, and stay connected.',
    order: 60,
    children: [
      {
        id: 'guilds-discover',
        label: 'Discover',
        icon: 'guilds',
        order: 10,
        children: [
          {
            id: 'guild-directory',
            label: 'Guild Directory',
            href: '/guilds',
            icon: 'guilds',
            description: 'Browse recruitment listings and application status.',
            order: 10,
          },
        ],
      },
      {
        id: 'guilds-yours',
        label: 'Your guild',
        icon: 'character',
        order: 20,
        children: [
          {
            id: 'my-guild',
            label: 'My Guild',
            href: '/guild',
            icon: 'character',
            description: 'View your roster, applications, settings, and support.',
            order: 10,
          },
        ],
      },
    ],
  },
  {
    id: 'maps',
    label: 'Maps',
    icon: 'map',
    description: 'Live player, base and resource maps for each world.',
    order: 70,
    children: [
      {
        id: 'maps-worlds',
        label: 'Worlds',
        icon: 'map',
        order: 10,
        children: [
          {
            id: 'map-hagga-basin',
            label: 'Hagga Basin',
            href: '/map/hagga-basin',
            icon: 'map',
            description: 'The home basin: players, bases, vehicles and points of interest.',
            order: 10,
          },
          {
            id: 'map-deep-desert',
            label: 'Deep Desert',
            href: '/map/deep-desert',
            icon: 'map',
            description: 'The shifting expanse beyond the Shield Wall, with its sector grid.',
            order: 20,
          },
        ],
      },
    ],
  },
  {
    id: 'casino',
    label: 'Casino',
    icon: 'casino',
    description: 'The Solaris Exchange: six games played with real Solaris.',
    order: 80,
    children: [
      {
        id: 'casino-games',
        label: 'Games',
        icon: 'casino',
        order: 10,
        children: [
          {
            id: 'casino-game-emperors-hand',
            label: "The Emperor's Hand",
            href: '/casino/games/emperors-hand',
            icon: 'casino',
            description: 'Blackjack with real Solaris.',
            order: 10,
          },
          {
            id: 'casino-game-spice-wheel',
            label: 'The Spice Wheel',
            href: '/casino/games/spice-wheel',
            icon: 'casino',
            description: 'Roulette with real Solaris.',
            order: 20,
          },
          {
            id: 'casino-game-fate-of-arrakis',
            label: 'Fate of Arrakis',
            href: '/casino/games/fate-of-arrakis',
            icon: 'casino',
            description: 'Dice with real Solaris.',
            order: 30,
          },
          {
            id: 'casino-game-spice-harvest',
            label: 'Spice Harvest',
            href: '/casino/games/spice-harvest',
            icon: 'casino',
            description: 'Mines with real Solaris.',
            order: 40,
          },
          {
            id: 'casino-game-ornithopter-run',
            label: 'Ornithopter Run',
            href: '/casino/games/ornithopter-run',
            icon: 'casino',
            description: 'Crash with real Solaris.',
            order: 50,
          },
          {
            id: 'casino-game-great-houses',
            label: 'The Great Houses',
            href: '/casino/games/great-houses',
            icon: 'casino',
            description: 'Coin flip with real Solaris.',
            order: 60,
          },
        ],
      },
      {
        id: 'casino-account',
        label: 'Your account',
        icon: 'holdings',
        order: 20,
        children: [
          {
            id: 'casino-overview',
            label: 'Overview',
            href: '/casino',
            exact: true,
            icon: 'casino',
            description: 'Lobby, wallet summary, and recent play.',
            order: 10,
          },
          {
            id: 'casino-wallet',
            label: 'Wallet',
            href: '/casino/wallet',
            icon: 'holdings',
            description: 'Deposits, withdrawals, ledger history, and breaks.',
            order: 20,
          },
          {
            id: 'casino-history',
            label: 'Game history',
            href: '/casino/history',
            icon: 'changelog',
            description: 'Your recent rounds and results.',
            order: 30,
          },
          {
            id: 'casino-fairness',
            label: 'Fairness',
            href: '/casino/fairness',
            icon: 'preview',
            description: 'Seeds, commitments, and round verification.',
            order: 40,
          },
          {
            id: 'casino-rules',
            label: 'Rules & help',
            href: '/casino/rules',
            icon: 'portal',
            description: 'How each game works and what the odds are.',
            order: 50,
          },
        ],
      },
    ],
  },
  {
    id: 'community',
    label: 'Community',
    icon: 'guilds',
    description: 'Events, seasons, live chat, release notes, and service status.',
    order: 90,
    align: 'right',
    children: [
      {
        id: 'community-play',
        label: 'Events & seasons',
        icon: 'preview',
        order: 10,
        children: [
          {
            id: 'community-events',
            label: 'Community events',
            href: '/events',
            icon: 'bases',
            description: 'Community competitions, event details, and prizes.',
            order: 10,
          },
          {
            id: 'community-seasons',
            label: 'Community season',
            href: '/seasons',
            icon: 'preview',
            description: 'Free challenges, seasonal recognition and your reward track.',
            order: 20,
          },
          {
            id: 'chat',
            label: 'Live Chat',
            href: '/chat',
            icon: 'chat',
            description: 'Talk with players in the game server chat.',
            order: 30,
          },
        ],
      },
      {
        id: 'community-updates',
        label: 'News & status',
        icon: 'changelog',
        order: 20,
        children: [
          {
            id: 'changelog',
            label: 'Changelog',
            href: '/changelog',
            icon: 'changelog',
            description: 'Release notes and dashboard improvements.',
            order: 10,
          },
          {
            id: 'service-status',
            label: 'Service status',
            href: '/status',
            icon: 'status',
            documentNavigation: true,
            description: 'Hosting uptime, incidents, and service availability.',
            order: 20,
          },
        ],
      },
    ],
  },
  {
    id: 'personal',
    label: 'Personal',
    icon: 'character',
    description: 'Your private plans, saved views, and privacy controls.',
    order: 95,
    align: 'right',
    children: [
      {
        id: 'personal-planning',
        label: 'Planning',
        icon: 'portal',
        order: 10,
        children: [
          {
            id: 'personal-tasks',
            label: 'Personal tasks',
            href: '/tasks',
            icon: 'portal',
            description: 'Your private task list, projects and goals.',
            order: 10,
          },
          {
            id: 'activity-views',
            label: 'Activity views',
            href: '/activity-views',
            icon: 'portal',
            description: 'Saved widgets, filters and planning context for your activities.',
            order: 20,
          },
        ],
      },
      {
        id: 'personal-privacy',
        label: 'Privacy',
        icon: 'storage',
        order: 20,
        children: [
          {
            id: 'privacy-center',
            label: 'Privacy center',
            href: '/privacy',
            icon: 'portal',
            description: 'Control voluntary member sharing and revoke your links.',
            order: 10,
          },
          {
            id: 'personal-data',
            label: 'Personal data',
            href: '/personal-data',
            icon: 'storage',
            description: 'Export or erase your dashboard notes, plans and sharing snapshots.',
            order: 20,
          },
        ],
      },
    ],
  },
] as const;

export const NOTIFICATION_ITEMS: readonly NavigationItem[] = [
  {
    id: 'notification-inbox',
    label: 'Actionable inbox',
    href: '/inbox',
    icon: 'portal',
    description: 'Asset needs, supply follow-ups and operation briefings.',
    order: 0,
  },
  {
    id: 'notification-applications',
    label: 'Guild applications',
    href: '/guilds',
    icon: 'guilds',
    description: 'Check recruitment listings and your application status.',
    order: 10,
  },
] as const;

function permitted(item: NavigationItem, visibility: NavigationVisibility): boolean {
  if (item.featureFlag && !visibility.featureFlags?.[item.featureFlag]) return false;
  return true;
}

/** Resolve visibility, dynamic badges, nested groups, and stable ordering without changing the source configuration. */
export function resolveNavigationItems(
  items: readonly NavigationItem[],
  visibility: NavigationVisibility = {},
): readonly NavigationItem[] {
  return items
    .filter((item) => permitted(item, visibility))
    .map((item) => ({
      ...item,
      badge: visibility.badges?.[item.id] ?? item.badge,
      children: item.children ? resolveNavigationItems(item.children, visibility) : undefined,
    }))
    .filter((item) => item.href || item.children?.length)
    .sort((a, b) => a.order - b.order);
}

export function navigationFor(visibility: NavigationVisibility = {}): readonly NavigationItem[] {
  return resolveNavigationItems(NAVIGATION_ITEMS, visibility);
}

/** Feature shortcuts resolve the same permission-filtered inventory as the topbar. */
export function navigationItemFor(id: string, visibility: NavigationVisibility = {}): NavigationItem | undefined {
  const find = (items: readonly NavigationItem[]): NavigationItem | undefined => {
    for (const item of items) {
      if (item.id === id) return item;
      const child = item.children && find(item.children);
      if (child) return child;
    }
  };
  return find(navigationFor(visibility));
}

export function isNavigationActive(pathname: string, item: NavigationItem): boolean {
  if (item.href && (pathname === item.href || (!item.exact && pathname.startsWith(`${item.href}/`)))) return true;
  return Boolean(item.children?.some((child) => isNavigationActive(pathname, child)));
}

/** A client transition cannot replace the document CSP. Keep those boundaries in the route inventory. */
export function needsDocumentNavigation(pathname: string, href: string): boolean {
  const visit = (items: readonly NavigationItem[]): boolean =>
    items.some(
      (item) =>
        (item.documentNavigation && (isNavigationActive(pathname, item) || isNavigationActive(href, item))) ||
        (item.children && visit(item.children)),
    );
  return visit(NAVIGATION_ITEMS);
}
