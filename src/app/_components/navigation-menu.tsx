'use client';

import Link from 'next/link';
import { type KeyboardEvent, type ReactNode, type SVGProps, useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  AssetsIcon,
  BaseIcon,
  BroadcastIcon,
  CharacterIcon,
  ChevronDownIcon,
  GuildIcon,
  MapIcon,
  MarketIcon,
  MoreIcon,
  PortalIcon,
  PreviewIcon,
  StorageIcon,
  UploadIcon,
  VehicleIcon,
} from './icons';
import { isNavigationActive, type NavigationIcon, type NavigationItem } from './nav-config';

const ICONS: Record<NavigationIcon, (props: SVGProps<SVGSVGElement>) => ReactNode> = {
  assets: AssetsIcon,
  bases: BaseIcon,
  character: CharacterIcon,
  changelog: BroadcastIcon,
  guilds: GuildIcon,
  holdings: BaseIcon,
  map: MapIcon,
  market: MarketIcon,
  more: MoreIcon,
  portal: PortalIcon,
  preview: PreviewIcon,
  storage: StorageIcon,
  upload: UploadIcon,
  vehicles: VehicleIcon,
};

export function NavigationGlyph({ icon, className = 'size-4' }: { icon?: NavigationIcon; className?: string }) {
  if (!icon) return null;
  const Icon = ICONS[icon];
  return <Icon className={`${className} shrink-0`} />;
}

export function NavigationDirectLink({ item, pathname }: { item: NavigationItem; pathname: string }) {
  if (!item.href) return null;
  const active = isNavigationActive(pathname, item);
  return (
    <Link
      href={item.href}
      aria-current={active ? 'page' : undefined}
      data-current={active ? 'true' : undefined}
      className={`command-nav-control relative flex items-center uppercase transition-all duration-200 ${
        item.tabletOverflow ? 'hidden min-[1560px]:flex' : ''
      }`}
    >
      <NavigationGlyph icon={item.icon} className="size-[18px]" />
      {item.label}
      {item.badge && <span className="font-mono text-xs text-spice-300">{item.badge}</span>}
    </Link>
  );
}

export function NavigationMenuItems({
  items,
  pathname,
  onNavigate,
  overflow = false,
}: {
  items: readonly NavigationItem[];
  pathname: string;
  onNavigate: () => void;
  overflow?: boolean;
}) {
  return (
    <ul className="p-2.5">
      {items.map((item) => {
        const active = isNavigationActive(pathname, item);
        return (
          <li key={item.id} className={overflow && item.tabletOverflow ? 'min-[1560px]:hidden' : undefined}>
            {item.href ? (
              <Link
                href={item.href}
                role="menuitem"
                aria-current={active ? 'page' : undefined}
                onClick={onNavigate}
                className={`flex items-start gap-3.5 border-l-2 px-3.5 py-3 outline-none transition-all duration-150 focus-visible:border-spice-300 focus-visible:bg-spice-500/14 focus-visible:text-sand-50 focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-spice-400/60 ${
                  active
                    ? 'border-spice-400 bg-spice-500/12 text-spice-300'
                    : 'border-transparent text-sand-200 hover:translate-x-0.5 hover:border-spice-500/40 hover:bg-spice-500/6 hover:text-sand-50'
                }`}
              >
                <NavigationGlyph icon={item.icon} className="mt-0.5 size-[18px] text-spice-400" />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center justify-between gap-3 text-sm font-bold tracking-normal">
                    {item.label}
                    {item.badge && <span className="font-mono text-xs text-spice-300">{item.badge}</span>}
                  </span>
                  {item.description && (
                    <span className="mt-1 block text-[0.8125rem] leading-5 text-[#A89B87]">{item.description}</span>
                  )}
                </span>
              </Link>
            ) : (
              <section className="h-full px-3 py-2" aria-label={item.label}>
                <div className="mb-2.5 flex items-center gap-2.5 border-b border-[#6f4d1f]/45 px-2 pb-3 text-xs font-bold uppercase tracking-[0.18em] text-[#C8A46A]">
                  <NavigationGlyph icon={item.icon} className="size-[18px] text-spice-400" />
                  {item.label}
                </div>
                <NavigationMenuItems
                  items={item.children ?? []}
                  pathname={pathname}
                  onNavigate={onNavigate}
                  overflow={overflow}
                />
              </section>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function moveFocus(event: KeyboardEvent<HTMLElement>) {
  const items = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('[role="menuitem"]')).filter(
    (item) => item.offsetParent !== null,
  );
  if (!items.length) return;
  const current = items.indexOf(document.activeElement as HTMLElement);
  let next = current;
  if (event.key === 'ArrowDown') next = (current + 1 + items.length) % items.length;
  else if (event.key === 'ArrowUp') next = (current - 1 + items.length) % items.length;
  else if (event.key === 'Home') next = 0;
  else if (event.key === 'End') next = items.length - 1;
  else return;
  event.preventDefault();
  items[next].focus();
}

export function NavigationDropdown({
  item,
  pathname,
  open,
  onToggle,
  onClose,
  extraItems = [],
  suppressActiveOnDesktop = false,
  trigger,
  triggerLabel,
  variant = 'category',
  footer,
}: {
  item: NavigationItem;
  pathname: string;
  open: boolean;
  onToggle: () => void;
  onClose: () => void;
  extraItems?: readonly NavigationItem[];
  suppressActiveOnDesktop?: boolean;
  trigger?: ReactNode;
  triggerLabel?: string;
  variant?: 'category' | 'utility' | 'account';
  footer?: ReactNode;
}) {
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const [focusOnOpen, setFocusOnOpen] = useState(false);
  const [menuOffset, setMenuOffset] = useState(0);
  const [arrowX, setArrowX] = useState<number | null>(null);
  // Stay mounted briefly after closing so the exit animation can play.
  const [rendered, setRendered] = useState(open);
  const items = [...extraItems, ...(item.children ?? [])].sort((a, b) => a.order - b.order);
  const active = isNavigationActive(pathname, { ...item, children: items });
  const grouped = items.length > 0 && items.every((entry) => entry.children?.length);
  const menuId = `navigation-menu-${item.id}`;

  useLayoutEffect(() => {
    if (!open) return;
    const constrain = () => {
      const element = menu.current;
      const anchor = button.current?.getBoundingClientRect();
      const origin = root.current?.getBoundingClientRect();
      if (!element || !anchor || !origin) return;
      // Layout metrics (offsetLeft/offsetWidth) ignore transforms, so the open animation cannot skew the maths,
      // and the wrapper is never animated. The menu is placed from its trigger, then nudged inside the viewport.
      const width = element.offsetWidth;
      const baseLeft = origin.left + element.offsetLeft;
      // clientWidth excludes a vertical scrollbar, which innerWidth would count as usable space.
      const available = document.documentElement.clientWidth;
      const shifted = -Math.max(0, baseLeft + width - available + 16);
      const next = shifted + Math.max(0, 16 - (baseLeft + shifted));
      setMenuOffset(next);
      const center = anchor.left + anchor.width / 2;
      setArrowX(Math.min(Math.max(center - (baseLeft + next), 20), width - 20));
    };
    constrain();
    window.addEventListener('resize', constrain);
    return () => window.removeEventListener('resize', constrain);
  }, [open]);

  useEffect(() => {
    if (open) {
      setRendered(true);
      return;
    }
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const timer = window.setTimeout(() => setRendered(false), reduced ? 0 : 130);
    return () => window.clearTimeout(timer);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) onClose();
    };
    const escape = (event: globalThis.KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      onClose();
      button.current?.focus();
    };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('keydown', escape);
    };
  }, [onClose, open]);

  useEffect(() => {
    if (!open || !focusOnOpen) return;
    menu.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
    setFocusOnOpen(false);
  }, [focusOnOpen, open]);

  const triggerClasses =
    variant === 'category'
      ? 'command-nav-control relative uppercase'
      : variant === 'account'
        ? 'command-utility h-12 gap-2.5 border border-[#6f4d1f]/45 bg-[#111215] px-2.5 text-sm font-bold hover:border-spice-400/60 min-[2000px]:h-[3.25rem]'
        : 'command-utility size-12 justify-center border border-[#6f4d1f]/45 bg-[#111215] text-sand-300 hover:border-spice-400/60 hover:bg-spice-500/6 min-[2000px]:size-[3.25rem]';
  // "Current" (you are on this page) and "open" (this menu is expanded) are separate, visibly different states.
  const showCurrent = variant === 'category' && active && !suppressActiveOnDesktop;
  const showOverflowCurrent = variant === 'category' && active && suppressActiveOnDesktop;

  return (
    <div ref={root} className={`relative ${item.tabletOverflow ? 'hidden min-[1560px]:block' : ''}`}>
      <button
        ref={button}
        type="button"
        aria-label={triggerLabel}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        aria-current={variant === 'category' && active ? 'page' : undefined}
        data-current={showCurrent ? 'true' : undefined}
        data-overflow-current={showOverflowCurrent ? 'true' : undefined}
        data-open={open ? 'true' : undefined}
        className={`flex items-center transition-all duration-200 ${triggerClasses}`}
        onClick={onToggle}
        onKeyDown={(event) => {
          if (event.key !== 'ArrowDown') return;
          event.preventDefault();
          if (!open) onToggle();
          setFocusOnOpen(true);
        }}
      >
        {trigger ?? (
          <>
            <NavigationGlyph icon={item.icon} className="size-[18px]" />
            {item.label}
            <ChevronDownIcon className={`size-4 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
          </>
        )}
      </button>
      {(open || rendered) && (
        <div
          ref={menu}
          id={menuId}
          role="menu"
          data-state={open ? 'open' : 'closed'}
          inert={open ? undefined : true}
          aria-label={triggerLabel ?? item.label}
          data-align={item.align === 'right' || variant !== 'category' ? 'right' : 'left'}
          onKeyDown={(event) => {
            if (event.key === 'Tab') onClose();
            else moveFocus(event);
          }}
          style={{
            // `translate` moves left- and right-anchored menus alike (a margin is ignored by `right: 0`) and
            // composes with the transform used by the open and close animations.
            translate: `${menuOffset}px 0`,
            ...(arrowX === null ? {} : { ['--menu-arrow-x' as string]: `${arrowX}px` }),
          }}
          className={`command-menu absolute top-[calc(100%+0.75rem)] z-[70] max-h-[min(76vh,42rem)] overflow-y-auto border border-[#a96d18]/85 bg-[#111215] ${
            item.align === 'right' || variant !== 'category' ? 'right-0' : 'left-0'
          } ${grouped ? 'w-[min(60rem,calc(100vw-2rem))]' : 'w-88 max-w-[calc(100vw-1.5rem)]'}`}
        >
          {grouped ? (
            <div className="flex flex-col lg:flex-row">
              {item.description && (
                <div className="command-summary flex shrink-0 flex-col justify-center border-b border-[#6f4d1f]/50 p-6 lg:w-64 lg:border-r lg:border-b-0">
                  <span className="flex size-12 items-center justify-center border border-spice-500/40 bg-spice-500/8 text-spice-300">
                    <NavigationGlyph icon={item.icon} className="size-6" />
                  </span>
                  <p className="mt-5 font-mono text-[0.625rem] uppercase tracking-[0.24em] text-[#C8A46A]">
                    {item.label} command
                  </p>
                  <h2 className="mt-2 text-2xl tracking-[0.08em] text-sand-50">{item.label}</h2>
                  <p className="mt-3 text-sm leading-6 text-[#A89B87]">{item.description}</p>
                  <div aria-hidden="true" className="mt-6 h-px bg-gradient-to-r from-spice-500/70 to-transparent" />
                </div>
              )}
              <div
                className="grid flex-1"
                style={{ gridTemplateColumns: `repeat(${Math.min(items.length, 3)}, minmax(0, 1fr))` }}
              >
                {items.map((group) => (
                  <div key={group.id} className="border-l border-[#6f4d1f]/35 py-3 first:border-l-0">
                    <NavigationMenuItems
                      items={[group]}
                      pathname={pathname}
                      onNavigate={onClose}
                      overflow={extraItems.length > 0}
                    />
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <NavigationMenuItems
              items={items}
              pathname={pathname}
              onNavigate={onClose}
              overflow={extraItems.length > 0}
            />
          )}
          {footer && <div className="border-t border-[#6f4d1f]/45 p-2">{footer}</div>}
        </div>
      )}
    </div>
  );
}
