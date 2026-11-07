'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import type { NavIdentity } from '../../features/auth/identity';
import { signOutAction } from './auth-actions';
import { CloseIcon, MenuIcon } from './icons';
import { Logo } from './logo';
import { NAV_ITEMS, SIGN_IN_HREF } from './nav-config';

function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

function Avatar({ identity }: { identity: NavIdentity }) {
  if (identity.avatarUrl) {
    return (
      // Discord CDN avatars are small and already sized (CSP allows cdn.discordapp.com); next/image adds nothing here.
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={identity.avatarUrl}
        alt=""
        width={32}
        height={32}
        className="size-8 border border-sand-200/20 object-cover"
      />
    );
  }
  return (
    <span
      aria-hidden="true"
      className="flex size-8 items-center justify-center border border-sand-200/20 bg-obsidian-800 text-xs font-bold text-spice-300"
    >
      {identity.ign.slice(0, 1).toUpperCase()}
    </span>
  );
}

function SignOutButton({ className = '' }: { className?: string }) {
  return (
    <form action={signOutAction}>
      <button type="submit" className={`btn btn-ghost ${className}`}>
        Sign out
      </button>
    </form>
  );
}

/** `identity` is resolved on the server from the verified session; null means signed out. */
export function TopNavigation({ identity }: { identity: NavIdentity | null }) {
  const pathname = usePathname();
  // Store the path the menu was opened on: navigating elsewhere closes it with no effect needed.
  const [openFor, setOpenFor] = useState<string | null>(null);
  const open = openFor === pathname;

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpenFor(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <header className="sticky top-0 z-50 border-b border-sand-200/10 bg-obsidian-950/75 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-shell items-center justify-between gap-6 px-4 sm:px-6">
        <Link href="/" aria-label="Arrakis Control home" className="shrink-0">
          <Logo />
        </Link>

        <nav aria-label="Primary" className="hidden md:block">
          <ul className="flex items-stretch">
            {NAV_ITEMS.map((item) => {
              const active = isActive(pathname, item.href);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={active ? 'page' : undefined}
                    className={`relative flex h-16 items-center px-4 text-xs font-bold uppercase tracking-[0.2em] transition-colors ${
                      active ? 'text-spice-400' : 'text-sand-300 hover:text-sand-50'
                    }`}
                  >
                    {item.label}
                    <span
                      aria-hidden="true"
                      className={`absolute inset-x-4 bottom-0 h-0.5 ${active ? 'bg-spice-500' : 'bg-transparent'}`}
                    />
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="flex items-center gap-3">
          {identity ? (
            <div className="hidden items-center gap-3 sm:flex">
              <Avatar identity={identity} />
              <span className="max-w-40 truncate text-xs font-bold uppercase tracking-[0.15em] text-sand-100">
                {identity.ign}
              </span>
              <SignOutButton className="min-h-10 px-4" />
            </div>
          ) : (
            <Link href={SIGN_IN_HREF} prefetch={false} className="btn btn-primary hidden sm:inline-flex">
              Sign in
            </Link>
          )}
          <button
            type="button"
            className="inline-flex size-10 items-center justify-center border border-sand-200/20 text-sand-100 hover:border-spice-400 hover:text-spice-300 md:hidden"
            aria-expanded={open}
            aria-controls="mobile-nav"
            aria-label={open ? 'Close menu' : 'Open menu'}
            onClick={() => setOpenFor(open ? null : pathname)}
          >
            {open ? <CloseIcon className="size-5" /> : <MenuIcon className="size-5" />}
          </button>
        </div>
      </div>

      {open && (
        <nav id="mobile-nav" aria-label="Mobile" className="border-t border-sand-200/10 bg-obsidian-950 md:hidden">
          <ul className="mx-auto max-w-shell px-4 py-2 sm:px-6">
            {NAV_ITEMS.map((item) => {
              const active = isActive(pathname, item.href);
              return (
                <li key={item.href} className="border-b border-sand-200/5 last:border-0">
                  <Link
                    href={item.href}
                    aria-current={active ? 'page' : undefined}
                    className={`flex min-h-12 items-center text-xs font-bold uppercase tracking-[0.2em] ${
                      active ? 'text-spice-400' : 'text-sand-200'
                    }`}
                  >
                    {item.label}
                  </Link>
                </li>
              );
            })}
            <li className="py-3">
              {identity ? (
                <div className="flex flex-col gap-3">
                  <div className="flex items-center gap-3">
                    <Avatar identity={identity} />
                    <span className="truncate text-xs font-bold uppercase tracking-[0.15em] text-sand-100">
                      {identity.ign}
                    </span>
                  </div>
                  <SignOutButton className="w-full" />
                </div>
              ) : (
                <Link href={SIGN_IN_HREF} prefetch={false} className="btn btn-primary w-full">
                  Sign in
                </Link>
              )}
            </li>
          </ul>
        </nav>
      )}
    </header>
  );
}
