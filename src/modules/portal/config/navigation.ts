import type { NavigationItem } from '../../../components/DashboardShell';

export const portalViews = [
  'overview',
  'hagga',
  'deep-desert',
  'character',
  'storage',
  'market',
  'bases',
  'vehicles',
  'guild',
] as const;
export type PortalView = (typeof portalViews)[number];
export function getPortalView(value: string | string[] | undefined): PortalView {
  return portalViews.find((view) => view === value) ?? 'overview';
}
export function portalNavigation(view: PortalView): NavigationItem[] {
  return [
    { label: 'Dashboard', group: 'Home', href: '/portal?view=overview', active: view === 'overview' },
    { label: 'Hagga Basin', group: 'Desert', href: '/portal?view=hagga', active: view === 'hagga' },
    { label: 'Deep Desert', group: 'Desert', href: '/portal?view=deep-desert', active: view === 'deep-desert' },
    { label: 'Exchange', group: 'Economy', href: '/portal?view=market', active: view === 'market' },
    { label: 'Character', group: 'Holdings', href: '/portal?view=character', active: view === 'character' },
    { label: 'Storage', group: 'Holdings', href: '/portal?view=storage', active: view === 'storage' },
    { label: 'My bases', group: 'Holdings', href: '/portal?view=bases', active: view === 'bases' },
    { label: 'Vehicles', group: 'Holdings', href: '/portal?view=vehicles', active: view === 'vehicles' },
    { label: 'Guild', group: 'Sietch', href: '/portal?view=guild', active: view === 'guild' },
  ];
}
