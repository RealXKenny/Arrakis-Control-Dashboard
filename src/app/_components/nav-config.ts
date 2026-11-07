export interface NavItem {
  readonly href: string;
  readonly label: string;
}

/**
 * Primary navigation. Server-safe constant so both RSC and client code can import it.
 * `Bases` is the Base Marketplace tab (community-shared base configurations).
 */
export const NAV_ITEMS: readonly NavItem[] = [
  { href: '/portal', label: 'Portal' },
  { href: '/market', label: 'Market' },
  { href: '/vehicles', label: 'Vehicles' },
  { href: '/bases', label: 'Bases' },
  { href: '/map', label: 'Map' },
  { href: '/changelog', label: 'Changelog' },
] as const;

export const SIGN_IN_HREF = '/login';
