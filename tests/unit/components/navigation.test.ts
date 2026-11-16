import { describe, expect, it } from 'vitest';
import {
  isNavigationActive,
  NAVIGATION_ITEMS,
  navigationFor,
  needsDocumentNavigation,
  resolveNavigationItems,
  type NavigationItem,
} from '../../../src/components/navigation/nav-config';

/** Every real destination in the tree, in order and without duplicates. */
function navigationLinks(items: readonly NavigationItem[]): readonly NavigationItem[] {
  const links = new Map<string, NavigationItem>();
  for (const item of items) {
    if (item.href) links.set(item.href, item);
    if (item.children) for (const child of navigationLinks(item.children)) links.set(child.href!, child);
  }
  return [...links.values()];
}

describe('unified navigation configuration', () => {
  it('reloads documents only when entering or leaving a route with a distinct document policy', () => {
    expect(needsDocumentNavigation('/portal', '/status')).toBe(true);
    expect(needsDocumentNavigation('/status', '/portal')).toBe(true);
    expect(needsDocumentNavigation('/status', '/')).toBe(true);
    expect(needsDocumentNavigation('/portal', '/character')).toBe(false);
  });
  it('puts Home first, for everyone, pointing at the landing page route', () => {
    for (const isAdmin of [false, true]) {
      const [first] = navigationFor({ isAdmin });
      expect(first).toMatchObject({ id: 'home', label: 'Home', href: '/', exact: true, icon: 'home' });
    }
    expect(navigationFor()[0]!.requiredPermissions).toBeUndefined();
  });
  it('lights Home up on the landing page only, never on dashboard routes', () => {
    const home = navigationFor()[0]!;
    expect(isNavigationActive('/', home)).toBe(true);
    for (const route of [
      '/portal',
      '/casino',
      '/casino/games/great-houses',
      '/chat',
      '/guilds',
      '/map',
      '/bases/upload',
      '/changelog',
    ])
      expect(isNavigationActive(route, home), route).toBe(false);
  });
  it('reaches Home by client navigation, except from a route with its own document policy', () => {
    for (const route of ['/portal', '/map', '/casino', '/chat', '/guilds'])
      expect(needsDocumentNavigation(route, '/'), route).toBe(false);
    expect(needsDocumentNavigation('/status', '/')).toBe(true);
  });
  it('keeps Service status inside More rather than promoting it to a top-level destination', () => {
    const items = navigationFor();
    expect(items.some((item) => item.href === '/status')).toBe(false);
    expect(items.find((item) => item.id === 'more')?.children?.find((item) => item.href === '/status')).toMatchObject({
      label: 'Service status',
    });
    expect(
      isNavigationActive(
        '/status',
        items.find((item) => item.id === 'more')!,
      ),
    ).toBe(true);
  });
  it('keeps every real destination in one ordered, deduplicated inventory', () => {
    const links = navigationLinks(navigationFor({ isAdmin: true }));
    expect(links.map((item) => item.href)).toEqual([
      '/',
      '/portal',
      '/character',
      '/holdings',
      '/vehicles',
      '/bases',
      '/bases/upload',
      '/holdings/preview',
      '/storage',
      '/market',
      '/guilds',
      '/guild',
      '/map',
      '/chat',
      '/casino',
      '/casino/games/emperors-hand',
      '/casino/games/spice-wheel',
      '/casino/games/fate-of-arrakis',
      '/casino/games/spice-harvest',
      '/casino/games/ornithopter-run',
      '/casino/games/great-houses',
      '/casino/wallet',
      '/casino/history',
      '/casino/fairness',
      '/casino/admin',
      '/casino/rules',
      '/changelog',
      '/status',
      '/events',
      '/seasons',
      '/admin',
    ]);
    expect(new Set(links.map((item) => item.href)).size).toBe(links.length);
    expect(NAVIGATION_ITEMS.map((item) => item.order)).toEqual([5, 10, 20, 30, 40, 50, 60, 70, 80, 85, 87, 90]);
  });

  it('hides administration unless the server supplies admin visibility', () => {
    expect(navigationLinks(navigationFor()).map((item) => item.href)).not.toContain('/admin');
    expect(navigationLinks(navigationFor({ isAdmin: true })).map((item) => item.href)).toContain('/admin');
  });

  it('supports nested feature flags and dynamic badges by stable ID', () => {
    const source = [
      {
        id: 'group',
        label: 'Group',
        order: 10,
        children: [{ id: 'flagged', label: 'Flagged', href: '/flagged', featureFlag: 'preview', order: 10 }],
      },
    ];
    expect(resolveNavigationItems(source, { featureFlags: { preview: false } })).toEqual([]);
    expect(
      resolveNavigationItems(source, { featureFlags: { preview: true }, badges: { flagged: 'New' } })[0].children?.[0]
        .badge,
    ).toBe('New');
    expect(navigationFor({ badges: { guilds: '2' } }).find((item) => item.id === 'guilds')?.badge).toBe('2');
  });

  it('marks parents and children active for nested and dynamic routes', () => {
    const bases = NAVIGATION_ITEMS.find((item) => item.id === 'bases')!;
    const assets = NAVIGATION_ITEMS.find((item) => item.id === 'assets')!;
    expect(isNavigationActive('/bases/community-base', bases)).toBe(true);
    expect(isNavigationActive('/bases/upload', bases)).toBe(true);
    expect(isNavigationActive('/holdings', assets)).toBe(true);
    expect(isNavigationActive('/holdings/preview', bases)).toBe(true);
    expect(isNavigationActive('/holdings/preview', assets)).toBe(false);
    expect(isNavigationActive('/market', bases)).toBe(false);
  });
});
