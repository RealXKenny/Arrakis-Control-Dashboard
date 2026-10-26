'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';

/**
 * Pillbox navigation chrome for the App Router shell.
 *
 * Fully rounded controls (segmented nav pills, status pill, actions) on the
 * charcoal SaaS palette. Client-safe by construction: no server-only imports,
 * no secrets — active state comes from the URL alone.
 */

type NavItem = { label: string; href: string };

const NAV_ITEMS: readonly NavItem[] = [
  { label: 'Dashboard', href: '/' },
  { label: 'Portal', href: '/portal' },
  { label: 'Map', href: '/map' },
];

function isActive(pathname: string, href: string): boolean {
  if (href === '/') return pathname === '/';
  return pathname === href || pathname.startsWith(`${href}/`);
}

function BrandMark() {
  return (
    <svg width="28" height="28" viewBox="0 0 32 32" fill="none" aria-hidden="true" className="shrink-0">
      <rect width="32" height="32" rx="9" fill="#3b82f6" />
      <path d="M9 10h6v6H9zm8 0h6v3h-6zm0 5h6v7h-6zm-8 3h6v4H9z" fill="#ffffff" />
    </svg>
  );
}

export default function Topbar() {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);

  // Dev note: pills roll shut whenever the route changes.
  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  return (
    <header className="sticky top-0 z-40 border-b border-edge bg-ink/85 backdrop-blur">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2.5" aria-label="Arrakis Control Dashboard home">
          <BrandMark />
          <span className="flex flex-col leading-tight">
            <span className="text-sm font-semibold text-zinc-100">Arrakis</span>
            <span className="hidden text-xs text-zinc-500 sm:block">Control Dashboard</span>
          </span>
        </Link>

        <nav aria-label="Primary" className="hidden items-center md:block">
          <ul className="flex items-center gap-1 rounded-full border border-edge bg-panel p-1">
            {NAV_ITEMS.map((item) => {
              const active = isActive(pathname ?? '', item.href);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={active ? 'page' : undefined}
                    className={`inline-block rounded-full px-4 py-1.5 text-sm transition-colors ${
                      active ? 'bg-accent font-medium text-white' : 'text-zinc-400 hover:bg-white/5 hover:text-zinc-100'
                    }`}
                  >
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="flex items-center gap-2">
          <span className="hidden items-center gap-2 rounded-full border border-edge bg-panel px-3 py-1.5 text-xs text-zinc-400 lg:flex">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" aria-hidden="true" />
            Live
          </span>
          <Link
            href="/portal"
            className="rounded-full bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-500"
          >
            Open portal
          </Link>
          <button
            type="button"
            onClick={() => setMenuOpen((open) => !open)}
            aria-expanded={menuOpen}
            aria-label="Toggle navigation menu"
            className="rounded-full border border-edge bg-panel p-2 text-zinc-300 transition-colors hover:text-zinc-100 md:hidden"
          >
            <svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden="true">
              {menuOpen ? (
                <path d="M5 5l10 10M15 5L5 15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              ) : (
                <path d="M3 6h14M3 10h14M3 14h14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              )}
            </svg>
          </button>
        </div>
      </div>

      {menuOpen ? (
        <nav aria-label="Mobile" className="border-t border-edge bg-ink px-4 py-3 md:hidden">
          <ul className="flex flex-col gap-1">
            {NAV_ITEMS.map((item) => {
              const active = isActive(pathname ?? '', item.href);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={active ? 'page' : undefined}
                    className={`block rounded-full px-4 py-2 text-sm transition-colors ${
                      active ? 'bg-accent font-medium text-white' : 'text-zinc-400 hover:bg-white/5 hover:text-zinc-100'
                    }`}
                  >
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      ) : null}
    </header>
  );
}
