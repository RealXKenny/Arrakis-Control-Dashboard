import Link from 'next/link';
import type { ReactNode } from 'react';
import ChangelogDialog from '../modules/changelog/components/ChangelogDialog';
import css from './dashboard-shell.module.css';

export type NavigationItem = { label: string; href: string; group: string; active?: boolean };

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
            <svg className={css.mark} viewBox="0 0 32 32" width="36" height="36" fill="none" aria-hidden="true">
              <rect width="32" height="32" rx="9" fill="currentColor" />
              <path d="M9 10h6v6H9zm8 0h6v3h-6zm0 5h6v7h-6zm-8 3h6v4H9z" fill="var(--theme-on-accent)" />
            </svg>
            <span>
              {brand}
              <small className={css.subtitle}>{subtitle}</small>
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
        <div>
          {brand} · <ChangelogDialog />
        </div>
        <span>Your community. Connected.</span>
      </footer>
    </div>
  );
}
