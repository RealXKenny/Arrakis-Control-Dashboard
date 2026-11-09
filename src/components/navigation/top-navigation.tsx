'use client';

import { NavigationLink as Link } from './navigation-link';
import { usePathname } from 'next/navigation';
import { useCallback, useRef, useState } from 'react';
import type { NavIdentity } from '../../features/auth/identity';
import { Avatar } from './avatar';
import { signOutAction } from '../../features/auth/actions';
import { BellIcon, ChevronDownIcon, HomeIcon, MenuIcon, SignOutIcon } from '../icons';
import { BrandLockup } from '../brand/logo';
import { MobileNavigation } from './mobile-navigation';
import {
  isNavigationActive,
  NAVIGATION_ITEMS,
  navigationFor,
  NOTIFICATION_ITEMS,
  SIGN_IN_HREF,
  type NavigationItem,
} from './nav-config';
import { NavigationDirectLink, NavigationDropdown } from './navigation-menu';

/** `identity` and `isAdmin` are resolved on the server from the verified session. */
export function TopNavigation({ identity, isAdmin = false }: { identity: NavIdentity | null; isAdmin?: boolean }) {
  const pathname = usePathname();
  const items = navigationFor({ isAdmin });
  const [openMenu, setOpenMenu] = useState<{ id: string; pathname: string } | null>(null);
  const [mobileFor, setMobileFor] = useState<string | null>(null);
  const closeMenu = useCallback(() => setOpenMenu(null), [setOpenMenu]);
  const closeMobile = useCallback(() => setMobileFor(null), [setMobileFor]);
  const menuOpen = (id: string) => openMenu?.id === id && openMenu.pathname === pathname;
  const toggleMenu = (id: string) => setOpenMenu(menuOpen(id) ? null : { id, pathname });
  const mobileOpen = mobileFor === pathname;
  const mobileTriggerRef = useRef<HTMLButtonElement>(null);
  const homeActive = pathname === '/';

  const overflow = NAVIGATION_ITEMS.filter((item) => item.tabletOverflow);
  const more = items.find((item) => item.id === 'more');
  const moreActive = more ? isNavigationActive(pathname, more) : false;
  const overflowActive = overflow.some((item) => isNavigationActive(pathname, item));
  const character = items.find((item) => item.id === 'character');
  const administration = more?.children?.find((item) => item.id === 'administration');
  const accountItems = [
    character ? { ...character, id: 'account-character', label: 'Character profile', tabletOverflow: false } : null,
    administration ? { ...administration, id: 'account-administration' } : null,
  ].filter((item): item is NavigationItem => item !== null);

  return (
    <header className="command-header sticky top-0 z-50 border-b border-[#6f4d1f]/70 bg-[#090A0C]/98 shadow-[0_12px_36px_rgb(0_0_0/0.45)]">
      <div className="flex h-[4.5rem] w-full items-center justify-between gap-3 px-4 sm:px-6 xl:gap-4 xl:px-6 2xl:h-20 min-[1840px]:gap-3 min-[1840px]:px-6 min-[2000px]:gap-6 min-[2000px]:px-8">
        <Link
          href="/"
          aria-label="Arrakis Control home"
          className="shrink-0 border-r border-[#6f4d1f]/50 pr-3 min-[400px]:pr-5 sm:pr-6"
        >
          <BrandLockup size="large" />
        </Link>

        {identity && (
          <nav aria-label="Primary" className="hidden xl:block">
            <ul className="flex items-center gap-1 min-[2000px]:gap-2">
              {items.map((item) => (
                <li key={item.id}>
                  {item.href ? (
                    <NavigationDirectLink item={item} pathname={pathname} />
                  ) : item.id === 'more' ? (
                    <NavigationDropdown
                      item={item}
                      pathname={pathname}
                      open={menuOpen(item.id)}
                      onToggle={() => toggleMenu(item.id)}
                      onClose={closeMenu}
                      extraItems={overflow}
                      suppressActiveOnDesktop={overflowActive && !moreActive}
                    />
                  ) : (
                    <NavigationDropdown
                      item={item}
                      pathname={pathname}
                      open={menuOpen(item.id)}
                      onToggle={() => toggleMenu(item.id)}
                      onClose={closeMenu}
                    />
                  )}
                </li>
              ))}
            </ul>
          </nav>
        )}

        <div className="flex shrink-0 items-center gap-2 xl:gap-3">
          {identity ? (
            <>
              {/* Below the desktop bar the primary navigation is hidden, so Home stays one tap away. */}
              <Link
                href="/"
                aria-label="Home"
                aria-current={homeActive ? 'page' : undefined}
                data-current={homeActive ? 'true' : undefined}
                className="inline-flex h-11 min-w-11 items-center justify-center gap-2 border border-[#6f4d1f]/50 px-3 text-xs font-bold uppercase tracking-[0.2em] text-sand-100 transition-colors hover:border-spice-400 hover:text-spice-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-spice-300 data-[current=true]:border-spice-400 data-[current=true]:text-spice-300 xl:hidden"
              >
                <HomeIcon className="size-5" />
                <span className="hidden md:inline">Home</span>
              </Link>
              <NavigationDropdown
                item={{
                  id: 'notifications',
                  label: 'Notifications',
                  order: 0,
                  align: 'right',
                  children: NOTIFICATION_ITEMS,
                }}
                pathname={pathname}
                open={menuOpen('notifications')}
                onToggle={() => toggleMenu('notifications')}
                onClose={closeMenu}
                trigger={<BellIcon className="size-5" />}
                triggerLabel="Notifications"
                variant="utility"
              />
              <div className="hidden xl:block">
                <NavigationDropdown
                  item={{ id: 'account', label: identity.ign, order: 0, align: 'right', children: accountItems }}
                  pathname={pathname}
                  open={menuOpen('account')}
                  onToggle={() => toggleMenu('account')}
                  onClose={closeMenu}
                  trigger={
                    <>
                      <Avatar identity={identity} size="large" />
                      <span className="hidden max-w-32 truncate tracking-normal text-sand-100 min-[1840px]:inline">
                        {identity.ign}
                      </span>
                      <ChevronDownIcon className="size-4 text-sand-500" />
                    </>
                  }
                  triggerLabel={`Account menu for ${identity.ign}`}
                  variant="account"
                  footer={
                    <form action={signOutAction}>
                      <button
                        type="submit"
                        role="menuitem"
                        className="flex w-full items-center gap-3 border-l-2 border-transparent px-3 py-3 text-left text-sm font-bold text-sand-200 hover:border-spice-400 hover:bg-spice-500/6 hover:text-spice-300"
                      >
                        <SignOutIcon className="size-[18px]" />
                        Sign out
                      </button>
                    </form>
                  }
                />
              </div>
            </>
          ) : (
            <Link href={SIGN_IN_HREF} prefetch={false} className="btn btn-primary min-h-11 px-4 sm:px-6">
              Sign in
            </Link>
          )}
          {identity && (
            <button
              ref={mobileTriggerRef}
              type="button"
              className="inline-flex size-11 items-center justify-center border border-[#6f4d1f]/50 text-sand-100 hover:border-spice-400 hover:text-spice-300 xl:hidden"
              aria-expanded={mobileOpen}
              aria-controls="mobile-nav"
              aria-label="Open menu"
              onClick={() => setMobileFor(mobileOpen ? null : pathname)}
            >
              <MenuIcon className="size-6" />
            </button>
          )}
        </div>
      </div>

      {identity && mobileOpen && (
        <MobileNavigation
          items={items.filter((item) => item.id !== 'home')}
          pathname={pathname}
          identity={identity}
          isAdmin={isAdmin}
          onClose={closeMobile}
          triggerRef={mobileTriggerRef}
        />
      )}
    </header>
  );
}
