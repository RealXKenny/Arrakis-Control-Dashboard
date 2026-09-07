import Link from 'next/link';
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
}: {
  brand: string;
  brandHref?: string;
  subtitle: string;
  navigation: NavigationItem[];
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className={css.shell}>
      <a href="#dashboard-content" className={css.skip}>
        Skip to content
      </a>
      <div className={css.masthead}>
        <header className={css.header}>
          <Link href={brandHref} className={css.brand}>
            <span className={css.mark} aria-hidden="true">
              ◈
            </span>
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
        <span>{brand} · Dune: Awakening</span>
        <span>Explore. Prepare. Endure.</span>
      </footer>
    </div>
  );
}
