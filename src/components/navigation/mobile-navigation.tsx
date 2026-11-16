'use client';
import { Button } from '../ui/button';

import { NavigationLink as Link } from './navigation-link';
import { type RefObject, useEffect, useRef, useState } from 'react';
import { containTabFocus, restoreFocus } from '../../lib/ui/focus';
import { lockPageScroll } from '../../lib/ui/scroll-lock';
import { menuItemClass } from '../ui/control-styles';
import type { NavIdentity } from '../../features/auth/identity';
import { Avatar } from './avatar';
import { signOutAction } from '../../features/auth/actions';
import { ChevronDownIcon, CloseIcon, SignOutIcon } from '../icons';
import { NavigationGlyph } from './navigation-menu';
import { isNavigationActive, NOTIFICATION_ITEMS, SIGN_IN_HREF, type NavigationItem } from './nav-config';

function MobileLink({
  item,
  pathname,
  onNavigate,
}: {
  item: NavigationItem;
  pathname: string;
  onNavigate: () => void;
}) {
  if (!item.href) return null;
  const active = isNavigationActive(pathname, item);
  return (
    <Link
      href={item.href}
      aria-current={active ? 'page' : undefined}
      onClick={onNavigate}
      className={menuItemClass({ active, layout: 'drawer' })}
    >
      <NavigationGlyph icon={item.icon} className="size-4 text-spice-400" />
      <span className="flex-1">{item.label}</span>
      {item.badge && <span className="font-mono text-xs text-spice-300">{item.badge}</span>}
    </Link>
  );
}

function MobileItem({
  item,
  pathname,
  expanded,
  onExpand,
  onNavigate,
}: {
  item: NavigationItem;
  pathname: string;
  expanded: readonly string[];
  onExpand: (id: string) => void;
  onNavigate: () => void;
}) {
  if (item.href) return <MobileLink item={item} pathname={pathname} onNavigate={onNavigate} />;
  const isOpen = expanded.includes(item.id);
  const active = isNavigationActive(pathname, item);
  return (
    <div>
      <Button
        type="button"
        aria-expanded={isOpen}
        aria-controls={`mobile-navigation-${item.id}`}
        className={`flex min-h-12 w-full items-center gap-3 px-3 text-left text-sm font-semibold ${
          active ? 'text-spice-300' : 'text-sand-200'
        }`}
        onClick={() => onExpand(item.id)}
      >
        <NavigationGlyph icon={item.icon} className="size-4 text-spice-400" />
        <span className="flex-1">{item.label}</span>
        <ChevronDownIcon className={`size-4 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
      </Button>
      {isOpen && (
        <div
          id={`mobile-navigation-${item.id}`}
          className="ml-4 border-l border-[var(--theme-border)] bg-[var(--theme-background)]"
        >
          {(item.children ?? []).map((child) => (
            <MobileItem
              key={child.id}
              item={child}
              pathname={pathname}
              expanded={expanded}
              onExpand={onExpand}
              onNavigate={onNavigate}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function MobileNavigation({
  items,
  pathname,
  identity,
  isAdmin,
  onClose,
  triggerRef,
  onOpenCommands,
  onOpenAppearance,
}: {
  items: readonly NavigationItem[];
  pathname: string;
  identity: NavIdentity | null;
  isAdmin: boolean;
  onClose: () => void;
  triggerRef: RefObject<HTMLButtonElement | null>;
  onOpenCommands?: () => void;
  onOpenAppearance?: () => void;
}) {
  const drawer = useRef<HTMLDivElement>(null);
  const close = useRef<HTMLButtonElement>(null);
  const [expanded, setExpanded] = useState<readonly string[]>(() => {
    const active = items.find((item) => item.children?.length && isNavigationActive(pathname, item))?.id;
    return active ? [active] : [];
  });
  const toggleExpanded = (id: string) =>
    setExpanded((current) => (current.includes(id) ? current.filter((entry) => entry !== id) : [...current, id]));

  useEffect(() => {
    const unlockScroll = lockPageScroll(document.body);
    const trigger = triggerRef.current;
    close.current?.focus();
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
        return;
      }
      containTabFocus(event, drawer.current);
    };
    document.addEventListener('keydown', keydown);
    return () => {
      unlockScroll();
      document.removeEventListener('keydown', keydown);
      restoreFocus(trigger);
    };
  }, [onClose, triggerRef]);

  return (
    <div className="fixed inset-0 z-[80] xl:hidden">
      <Button
        type="button"
        aria-label="Close navigation"
        onClick={onClose}
        className="absolute inset-0 bg-black/70 motion-safe:animate-[nav-backdrop-enter_180ms_ease-out]"
      />
      <div
        ref={drawer}
        tabIndex={-1}
        id="mobile-nav"
        role="dialog"
        aria-modal="true"
        aria-label="Navigation"
        className="absolute inset-y-0 right-0 flex w-[min(88vw,22rem)] flex-col border-l border-[var(--theme-border)] bg-[var(--theme-menu)] shadow-[-20px_0_50px_rgb(0_0_0/0.5)] motion-safe:animate-[nav-drawer-enter_180ms_ease-out]"
      >
        <div className="flex h-20 shrink-0 items-center justify-between border-b border-[var(--theme-header-border)]/60 px-4">
          <span className="font-mono text-[0.625rem] font-bold uppercase tracking-[0.24em] text-[#C8A46A]">
            Command navigation
          </span>
          <Button
            ref={close}
            type="button"
            aria-label="Close menu"
            onClick={onClose}
            className="inline-flex size-10 items-center justify-center border border-sand-200/15 text-sand-100 hover:border-spice-400"
          >
            <CloseIcon className="size-5" />
          </Button>
        </div>
        <div className="flex-1 overflow-y-auto pb-6">
          {onOpenAppearance && (
            <div className="p-3">
              <Button
                type="button"
                onClick={onOpenAppearance}
                className="min-h-12 w-full border border-sand-200/30 px-3 py-2 text-left text-sm font-bold text-spice-300"
              >
                Themes and custom colors
              </Button>
            </div>
          )}
          {onOpenCommands && (
            <div className="p-3">
              <Button
                type="button"
                onClick={onOpenCommands}
                className="min-h-12 w-full border border-sand-200/30 px-3 py-2 text-left text-sm font-bold text-spice-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-spice-300"
              >
                Search navigation and assets
              </Button>
            </div>
          )}
          <nav aria-label="Mobile" className="p-3">
            <div className="space-y-1">
              {items.map((item) => (
                <MobileItem
                  key={item.id}
                  item={item}
                  pathname={pathname}
                  expanded={expanded}
                  onExpand={toggleExpanded}
                  onNavigate={onClose}
                />
              ))}
            </div>
          </nav>
          {identity && (
            <section aria-labelledby="mobile-notifications" className="border-t border-[var(--theme-border)] p-3">
              <h2 id="mobile-notifications" className="px-3 py-2 text-[0.625rem] tracking-[0.2em] text-[#C8A46A]">
                Notifications
              </h2>
              {NOTIFICATION_ITEMS.map((item) => (
                <MobileLink key={item.id} item={item} pathname={pathname} onNavigate={onClose} />
              ))}
            </section>
          )}
          <section aria-labelledby="mobile-account" className="border-t border-[var(--theme-border)] p-3">
            <h2 id="mobile-account" className="px-3 py-2 text-[0.625rem] tracking-[0.2em] text-[#C8A46A]">
              Account
            </h2>
            {identity ? (
              <div className="space-y-1">
                <div className="flex items-center gap-3 px-3 py-3">
                  <Avatar identity={identity} />
                  <span className="truncate text-sm font-bold text-sand-100">{identity.ign}</span>
                </div>
                <MobileLink
                  item={{
                    id: 'mobile-profile',
                    label: 'Character profile',
                    href: '/character',
                    icon: 'character',
                    order: 10,
                  }}
                  pathname={pathname}
                  onNavigate={onClose}
                />
                {isAdmin && (
                  <MobileLink
                    item={{ id: 'mobile-admin', label: 'Administration', href: '/admin', icon: 'guilds', order: 20 }}
                    pathname={pathname}
                    onNavigate={onClose}
                  />
                )}
                <form action={signOutAction} className="pt-2">
                  <Button
                    type="submit"
                    className="flex min-h-12 w-full items-center gap-3 border border-sand-200/15 px-3 text-sm font-bold text-sand-100 hover:border-spice-400 hover:text-spice-300"
                  >
                    <SignOutIcon className="size-4" />
                    Sign out
                  </Button>
                </form>
              </div>
            ) : (
              <Link href={SIGN_IN_HREF} prefetch={false} onClick={onClose} className="btn btn-primary w-full">
                Sign in
              </Link>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
