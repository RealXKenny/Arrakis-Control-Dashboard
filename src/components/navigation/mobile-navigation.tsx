'use client';

import { NavigationLink as Link } from './navigation-link';
import { type RefObject, useEffect, useRef, useState } from 'react';
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
      className={`flex min-h-12 items-center gap-3 border-l-2 px-3 py-2 text-sm font-semibold ${
        active ? 'border-spice-400 bg-spice-500/10 text-spice-300' : 'border-transparent text-sand-200'
      }`}
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
      <button
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
      </button>
      {isOpen && (
        <div id={`mobile-navigation-${item.id}`} className="ml-4 border-l border-[#302B24] bg-[#0D0E10]">
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
}: {
  items: readonly NavigationItem[];
  pathname: string;
  identity: NavIdentity | null;
  isAdmin: boolean;
  onClose: () => void;
  triggerRef: RefObject<HTMLButtonElement | null>;
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
    const previousOverflow = document.body.style.overflow;
    const trigger = triggerRef.current;
    document.body.style.overflow = 'hidden';
    close.current?.focus();
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
        return;
      }
      if (event.key !== 'Tab') return;
      const controls = Array.from(
        drawer.current?.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), input, select, textarea') ?? [],
      ).filter((control) => control.offsetParent !== null);
      if (!controls.length) return;
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', keydown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', keydown);
      trigger?.focus();
    };
  }, [onClose, triggerRef]);

  return (
    <div className="fixed inset-0 z-[80] xl:hidden">
      <button
        type="button"
        aria-label="Close navigation"
        onClick={onClose}
        className="absolute inset-0 bg-black/70 motion-safe:animate-[nav-backdrop-enter_180ms_ease-out]"
      />
      <div
        ref={drawer}
        id="mobile-nav"
        role="dialog"
        aria-modal="true"
        aria-label="Navigation"
        className="absolute inset-y-0 right-0 flex w-[min(88vw,22rem)] flex-col border-l border-[#302B24] bg-[#111215] shadow-[-20px_0_50px_rgb(0_0_0/0.5)] motion-safe:animate-[nav-drawer-enter_180ms_ease-out]"
      >
        <div className="flex h-20 shrink-0 items-center justify-between border-b border-[#6f4d1f]/60 px-4">
          <span className="font-mono text-[0.625rem] font-bold uppercase tracking-[0.24em] text-[#C8A46A]">
            Command navigation
          </span>
          <button
            ref={close}
            type="button"
            aria-label="Close menu"
            onClick={onClose}
            className="inline-flex size-10 items-center justify-center border border-sand-200/15 text-sand-100 hover:border-spice-400"
          >
            <CloseIcon className="size-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto pb-6">
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
            <section aria-labelledby="mobile-notifications" className="border-t border-[#302B24] p-3">
              <h2 id="mobile-notifications" className="px-3 py-2 text-[0.625rem] tracking-[0.2em] text-[#C8A46A]">
                Notifications
              </h2>
              {NOTIFICATION_ITEMS.map((item) => (
                <MobileLink key={item.id} item={item} pathname={pathname} onNavigate={onClose} />
              ))}
            </section>
          )}
          <section aria-labelledby="mobile-account" className="border-t border-[#302B24] p-3">
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
                  <button
                    type="submit"
                    className="flex min-h-12 w-full items-center gap-3 border border-sand-200/15 px-3 text-sm font-bold text-sand-100 hover:border-spice-400 hover:text-spice-300"
                  >
                    <SignOutIcon className="size-4" />
                    Sign out
                  </button>
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
