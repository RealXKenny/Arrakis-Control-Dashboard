'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { MouseEvent, ReactNode } from 'react';

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
    <header className="sticky top-0 z-50 bg-gradient-to-b from-zinc-950 via-zinc-950/90 to-transparent pt-3 pb-2 sm:pt-4">
      <div className="workspace-frame min-w-0">
        <div className="flex flex-wrap items-center gap-3 rounded-[28px] border border-white/5 bg-zinc-900/50 p-3 backdrop-blur-md xl:flex-nowrap xl:rounded-full xl:px-4">
          <Link
            href={brandHref}
            as={brandHref.startsWith('/portal?view=') ? '/portal' : undefined}
            onClick={(event) => navigate(event, brandHref)}
            className="flex shrink-0 items-center gap-2.5 rounded-full text-zinc-100 no-underline"
            aria-label={`${brand} home`}
          >
            <Image
              src="/favicon.ico"
              alt=""
              width={32}
              height={32}
              unoptimized
              className="h-8 w-8 shrink-0 rounded-full border border-white/5"
            />
            <span className="grid gap-0.5">
              <strong className="text-[13px] font-semibold tracking-tight sm:text-sm">{brand}</strong>
              <small className="text-[10px] text-zinc-400 sm:text-[11px]">{subtitle}</small>
            </span>
          </Link>
          {items.length > 0 && (
            <nav aria-label="Main navigation" className="order-3 min-w-0 flex-1 overflow-x-auto xl:order-none">
              <ul className="mx-0 flex w-max max-w-full list-none items-center gap-1 rounded-full border border-white/5 bg-zinc-950/50 p-1 xl:mx-auto">
                {items.map((item) => {
                  const active =
                    item.active ??
                    (item.href === '/'
                      ? pathname === '/'
                      : pathname === item.href || pathname?.startsWith(`${item.href}/`));
                  return (
                    <li key={item.href} className="shrink-0">
                      <Link
                        href={item.href}
                        as={item.href.startsWith('/portal?view=') ? '/portal' : undefined}
                        shallow={item.href.startsWith('/portal?view=')}
                        onClick={(event) => navigate(event, item.href)}
                        aria-current={active ? 'page' : undefined}
                        className={`inline-flex min-h-10 items-center rounded-full border px-3.5 py-2 text-xs font-medium whitespace-nowrap no-underline transition-colors sm:px-4 ${
                          active
                            ? 'border-indigo-500/20 bg-indigo-500/10 text-indigo-300'
                            : 'border-transparent text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100'
                        }`}
                      >
                        {item.label}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </nav>
          )}
          <div className="ml-auto flex shrink-0 flex-wrap items-center justify-end gap-2 [&_a]:inline-flex [&_a]:min-h-9 [&_a]:items-center [&_a]:justify-center [&_a]:rounded-full [&_a]:border [&_a]:border-white/5 [&_a]:bg-zinc-800 [&_a]:px-3.5 [&_a]:py-2 [&_a]:text-xs [&_a]:font-medium [&_a]:text-zinc-300 [&_a]:no-underline [&_a]:transition-colors hover:[&_a]:bg-zinc-700 [&_button]:inline-flex [&_button]:min-h-9 [&_button]:items-center [&_button]:justify-center [&_button]:rounded-full [&_button]:border [&_button]:border-white/5 [&_button]:bg-zinc-800 [&_button]:px-3.5 [&_button]:py-2 [&_button]:text-xs [&_button]:font-medium [&_button]:text-zinc-300 [&_button]:transition-colors hover:[&_button]:bg-zinc-700 disabled:[&_button]:opacity-50 [&_form]:m-0 [&>span]:max-w-44 [&>span]:truncate [&>span]:rounded-full [&>span]:bg-zinc-800/60 [&>span]:px-3 [&>span]:py-2 [&>span]:text-xs [&>span]:text-zinc-400">
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
