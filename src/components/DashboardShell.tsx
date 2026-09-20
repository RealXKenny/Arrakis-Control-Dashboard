import { APP_VERSION } from '../config/version';
import Link from 'next/link';
import Image from 'next/image';
import type { ReactNode } from 'react';
import css from './dashboard-shell.module.css';

export type NavigationItem = { label: string; href: string; group: string; active?: boolean };

/** Shared presentation only: feature routes and account actions belong to callers. */
export default function DashboardShell({
  brand,
  brandHref = '/',
  subtitle,
  navigation,
  actions,
  children,
  onNavigate,
}: {
  brand: string;
  brandHref?: string;
  subtitle: string;
  navigation: NavigationItem[];
  actions?: ReactNode;
  children: ReactNode;
  onNavigate?: (href: string) => boolean;
}) {
  return (
    <div className={css.shell}>
      <a href="#dashboard-content" className={css.skip}>
        Skip to content
      </a>
      <div className={css.masthead}>
        <header className={css.header}>
          <Link
            href={brandHref}
            onClick={(event) => {
              if (!event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey && onNavigate?.(brandHref))
                event.preventDefault();
            }}
            as={brandHref.startsWith('/portal?view=') ? '/portal' : undefined}
            className={css.brand}
          >
            <Image className={css.mark} src="/favicon.ico" alt="" width={32} height={32} priority unoptimized />
            <span>
              {brand}
              <small className={css.visuallyHidden}>{subtitle}</small>
            </span>
          </Link>
          <div className={css.actions}>{actions}</div>
        </header>
        <nav className={css.navigation} aria-label="Main navigation">
          {Array.from(new Set(navigation.map((item) => item.group))).map((group) => (
            <div className={css.navGroup} role="group" aria-label={group} key={group}>
              <small>{group}</small>
              <div>
                {navigation
                  .filter((item) => item.group === group)
                  .map((item) => (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={(event) => {
                        if (
                          !event.metaKey &&
                          !event.ctrlKey &&
                          !event.shiftKey &&
                          !event.altKey &&
                          onNavigate?.(item.href)
                        )
                          event.preventDefault();
                      }}
                      as={item.href.startsWith('/portal?view=') ? '/portal' : undefined}
                      shallow={item.href.startsWith('/portal?view=')}
                      aria-current={item.active ? 'page' : undefined}
                      className={item.active ? css.active : undefined}
                    >
                      <span>{item.label}</span>
                    </Link>
                  ))}
              </div>
            </div>
          ))}
        </nav>
      </div>
      <main id="dashboard-content" className={css.content}>
        {children}
      </main>
      <footer className={css.footer}>
        <span>
          {brand} · Dune: Awakening · v{APP_VERSION}
        </span>
        <span>Explore. Prepare. Endure.</span>
      </footer>
    </div>
  );
}
