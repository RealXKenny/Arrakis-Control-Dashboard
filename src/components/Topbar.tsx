'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { MouseEvent, ReactNode } from 'react';
import css from './topbar.module.css';

export type TopbarItem = { label: string; href: string; active?: boolean };
export type TopbarProps = {
  brand?: string;
  subtitle?: string;
  brandHref?: string;
  items?: readonly TopbarItem[];
  actions?: ReactNode;
  onNavigate?: (href: string) => boolean;
};
const DEFAULT_ITEMS: readonly TopbarItem[] = [
  { label: 'Home', href: '/' },
  { label: 'Portal', href: '/portal' },
  { label: 'Map', href: '/map' },
];

/** Share the navigation across public, member, and admin pages without a server dependency. */
export default function Topbar({
  brand = 'Crimson Skies',
  subtitle = 'Community workspace',
  brandHref = '/',
  items = DEFAULT_ITEMS,
  actions,
  onNavigate,
}: TopbarProps) {
  const pathname = usePathname();
  function navigate(event: MouseEvent<HTMLAnchorElement>, href: string) {
    // Dev note: modified clicks keep their new tab; plain clicks get the portal express lane.
    if (
      event.button === 0 &&
      !event.metaKey &&
      !event.ctrlKey &&
      !event.shiftKey &&
      !event.altKey &&
      onNavigate?.(href)
    )
      event.preventDefault();
  }
  return (
    <header className={css.header}>
      <div className={`workspace-frame ${css.frame}`}>
        <div className={css.capsule}>
          <Link
            href={brandHref}
            as={brandHref.startsWith('/portal?view=') ? '/portal' : undefined}
            onClick={(event) => navigate(event, brandHref)}
            className={css.brand}
            aria-label={`${brand} home`}
          >
            <svg width="36" height="36" viewBox="0 0 32 32" fill="none" aria-hidden="true">
              <rect width="32" height="32" rx="11" fill="var(--color-accent)" />
              <path d="M9 10h6v6H9zm8 0h6v3h-6zm0 5h6v7h-6zm-8 3h6v4H9z" fill="var(--color-ink)" />
            </svg>
            <span>
              <strong>{brand}</strong>
              <small>{subtitle}</small>
            </span>
          </Link>
          {items.length > 0 && (
            <nav className={css.navigation} aria-label="Main navigation">
              <ul>
                {items.map((item) => {
                  const active =
                    item.active ??
                    (item.href === '/'
                      ? pathname === '/'
                      : pathname === item.href || pathname?.startsWith(`${item.href}/`));
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        as={item.href.startsWith('/portal?view=') ? '/portal' : undefined}
                        shallow={item.href.startsWith('/portal?view=')}
                        onClick={(event) => navigate(event, item.href)}
                        aria-current={active ? 'page' : undefined}
                      >
                        {item.label}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </nav>
          )}
          <div className={css.actions}>
            {actions ?? (
              <Link href="/portal">
                Open portal <span aria-hidden="true">↗</span>
              </Link>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
