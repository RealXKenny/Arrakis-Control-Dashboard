export type NavigationPermission = 'admin';
export type NavigationIcon =
  | 'assets'
  | 'bases'
  | 'character'
  | 'changelog'
  | 'guilds'
  | 'holdings'
  | 'map'
  | 'market'
  | 'more'
  | 'portal'
  | 'preview'
  | 'storage'
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
  readonly requiredPermissions?: readonly NavigationPermission[];
  readonly featureFlag?: string;
  readonly badge?: string;
  readonly order: number;
  readonly align?: 'left' | 'right';
  readonly tabletOverflow?: boolean;
}

export type NavigationVisibility = {
  readonly isAdmin?: boolean;
  readonly featureFlags?: Readonly<Record<string, boolean>>;
  readonly badges?: Readonly<Record<string, string>>;
};

export const SIGN_IN_HREF = '/login';

export const NAVIGATION_ITEMS: readonly NavigationItem[] = [
  { id: 'portal', label: 'Portal', href: '/portal', icon: 'portal', order: 10 },
  {
    id: 'character',
    label: 'Character',
    href: '/character',
    icon: 'character',
    order: 20,
    tabletOverflow: true,
  },
  {
    id: 'assets',
    label: 'Assets',
    icon: 'assets',
    order: 30,
    tabletOverflow: true,
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
    id: 'vehicles',
    label: 'Vehicles',
    href: '/vehicles',
    icon: 'vehicles',
    order: 40,
    tabletOverflow: true,
  },
  {
    id: 'bases',
    label: 'Bases',
    icon: 'bases',
    description: 'Community blueprints, base storage, and immersive previews.',
    order: 50,
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
  {
    id: 'market',
    label: 'Market',
    href: '/market',
    icon: 'market',
    order: 60,
    tabletOverflow: true,
  },
  {
    id: 'guilds',
    label: 'Guilds',
    icon: 'guilds',
    order: 70,
    tabletOverflow: true,
    children: [
      {
        id: 'guild-directory',
        label: 'Guild Directory',
        href: '/guilds',
        icon: 'guilds',
        description: 'Browse recruitment listings and application status.',
        order: 10,
      },
      {
        id: 'my-guild',
        label: 'My Guild',
        href: '/guild',
        icon: 'character',
        description: 'View your roster, applications, settings, and support.',
        order: 20,
      },
    ],
  },
  { id: 'map', label: 'Map', href: '/map', icon: 'map', order: 80, tabletOverflow: true },
  {
    id: 'more',
    label: 'More',
    icon: 'more',
    order: 90,
    align: 'right',
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
        id: 'administration',
        label: 'Administration',
        href: '/admin',
        icon: 'guilds',
        description: 'Authorized server operations and oversight.',
        requiredPermissions: ['admin'],
        order: 20,
      },
    ],
  },
] as const;

export const NOTIFICATION_ITEMS: readonly NavigationItem[] = [
  {
    id: 'notification-applications',
    label: 'Guild applications',
    href: '/guilds',
    icon: 'guilds',
    description: 'Check recruitment listings and your application status.',
    order: 10,
  },
  {
    id: 'notification-support',
    label: 'Guild support',
    href: '/guild',
    icon: 'character',
    description: 'Open your guild roster and leader support conversation.',
    order: 20,
  },
] as const;

function permitted(item: NavigationItem, visibility: NavigationVisibility): boolean {
  if (item.requiredPermissions?.includes('admin') && !visibility.isAdmin) return false;
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

export function isNavigationActive(pathname: string, item: NavigationItem): boolean {
  if (item.href && (pathname === item.href || (!item.exact && pathname.startsWith(`${item.href}/`)))) return true;
  return Boolean(item.children?.some((child) => isNavigationActive(pathname, child)));
}
