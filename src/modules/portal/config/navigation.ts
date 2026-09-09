import type { NavigationItem } from '../../../components/DashboardShell';
import type { PublicSiteConfig } from '../../../config/public-site';
import type { MapDestination } from '../../map/utils/destinations';

type ConfigNavigationItem = NavigationItem & { feature?: keyof PublicSiteConfig['features'] };

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
export function portalNavigation(
  view: PortalView,
  site?: PublicSiteConfig,
  destinations: MapDestination[] = [],
  selectedDestination = '',
): NavigationItem[] {
  const firstSietch = destinations.find((entry) => entry.kind === 'sietch')?.key;
  const firstDeepDesert = destinations.find((entry) => entry.kind === 'deep-desert')?.key;
  const mapItems: ConfigNavigationItem[] = destinations.length
    ? destinations.map((destination) => ({
        label: destination.label,
        destinationType: destination.type,
        destinationStatus: destination.active,
        group: destination.kind === 'sietch' ? 'Sietches' : 'Deep Deserts',
        href: `/portal?view=${destination.kind === 'sietch' ? 'hagga' : 'deep-desert'}&destination=${encodeURIComponent(destination.key)}`,
        active: selectedDestination
          ? selectedDestination === destination.key
          : destination.key === (destination.kind === 'sietch' ? firstSietch : firstDeepDesert) &&
            view === (destination.kind === 'sietch' ? 'hagga' : 'deep-desert'),
        feature: 'maps',
      }))
    : [
        {
          label: site?.mapLabels.HaggaBasin ?? 'Hagga Basin',
          group: 'Sietches',
          href: '/portal?view=hagga',
          active: view === 'hagga',
          feature: 'maps',
        },
        {
          label: site?.mapLabels.DeepDesert ?? 'Deep Desert',
          group: 'Deep Deserts',
          href: '/portal?view=deep-desert',
          active: view === 'deep-desert',
          feature: 'maps',
        },
      ];
  const items: ConfigNavigationItem[] = [
    { label: 'Dashboard', group: 'Home', href: '/portal?view=overview', active: view === 'overview' },
    ...mapItems,
    { label: 'Exchange', group: 'Economy', href: '/portal?view=market', active: view === 'market', feature: 'market' },
    { label: 'Character', group: 'Holdings', href: '/portal?view=character', active: view === 'character' },
    { label: 'Storage', group: 'Holdings', href: '/portal?view=storage', active: view === 'storage' },
    { label: 'My bases', group: 'Holdings', href: '/portal?view=bases', active: view === 'bases', feature: 'bases' },
    {
      label: 'Vehicles',
      group: 'Holdings',
      href: '/portal?view=vehicles',
      active: view === 'vehicles',
      feature: 'vehicles',
    },
    { label: 'Guild', group: 'Sietch', href: '/portal?view=guild', active: view === 'guild', feature: 'guilds' },
  ];
  return items
    .filter((item) => !item.feature || site?.features[item.feature] !== false)
    .map(({ feature: _feature, ...item }) => item);
}
