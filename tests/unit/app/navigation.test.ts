import { describe, expect, it } from 'vitest';
import {
  isNavigationActive,
  NAVIGATION_ITEMS,
  navigationFor,
  resolveNavigationItems,
  type NavigationItem,
} from '../../../src/app/_components/nav-config';

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
  it('keeps every real destination in one ordered, deduplicated inventory', () => {
    const links = navigationLinks(navigationFor({ isAdmin: true }));
    expect(links.map((item) => item.href)).toEqual([
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
      '/changelog',
      '/admin',
    ]);
    expect(new Set(links.map((item) => item.href)).size).toBe(links.length);
    expect(NAVIGATION_ITEMS.map((item) => item.order)).toEqual([10, 20, 30, 40, 50, 60, 70, 80, 90]);
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
