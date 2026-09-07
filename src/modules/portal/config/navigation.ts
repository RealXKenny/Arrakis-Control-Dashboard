import type { NavigationItem } from '../../../components/DashboardShell';

export const portalViews = [
  'overview',
  'character',
  'storage',
  'market',
  'bases',
  'vehicles',
  'guild',
  'live',
] as const;
export type PortalView = (typeof portalViews)[number];
export function getPortalView(value: string | string[] | undefined): PortalView {
  return portalViews.find((view) => view === value) ?? 'overview';
}
export function portalNavigation(view: PortalView): NavigationItem[] {
  return [
    { label: 'Dashboard', group: 'Home', href: '/portal', active: view === 'overview' },
    { label: 'Live map', group: 'Desert', href: '/map' },
    { label: 'Live intel', group: 'Desert', href: '/portal?view=live', active: view === 'live' },
    { label: 'Exchange', group: 'Economy', href: '/portal?view=market', active: view === 'market' },
    { label: 'Character', group: 'Holdings', href: '/portal?view=character', active: view === 'character' },
    { label: 'Storage', group: 'Holdings', href: '/portal?view=storage', active: view === 'storage' },
    { label: 'Bases', group: 'Holdings', href: '/portal?view=bases', active: view === 'bases' },
    { label: 'Vehicles', group: 'Holdings', href: '/portal?view=vehicles', active: view === 'vehicles' },
    { label: 'Guild', group: 'Sietch', href: '/portal?view=guild', active: view === 'guild' },
  ];
}
