import { APP_VERSION } from '../config/version';
import Link from 'next/link';
import Image from 'next/image';
import type { ReactNode } from 'react';
import css from './dashboard-shell.module.css';
import { useSiteConfig } from './SiteConfigProvider';

export type NavigationItem = {
  label: string;
  href: string;
  group: string;
  active?: boolean;
  destinationType?: 'PvE' | 'PvP';
  destinationStatus?: boolean | null;
};

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
  brand?: string;
  brandHref?: string;
  subtitle?: string;
  navigation: NavigationItem[];
  actions?: ReactNode;
  children: ReactNode;
  onNavigate?: (href: string) => boolean;
}) {
  const site = useSiteConfig();
  const displayedBrand = brand ?? site.name;
  const displayedSubtitle = subtitle ?? site.subtitle;
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
              {displayedBrand}
              <small className={css.visuallyHidden}>{displayedSubtitle}</small>
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
                      aria-label={item.label}
                      aria-current={item.active ? 'page' : undefined}
                      className={item.active ? css.active : undefined}
                    >
                      {item.destinationType ? (
                        <span className={css.destinationMeta}>
                          <small
                            className={`${css.destinationType} ${item.destinationType === 'PvP' ? css.pvp : css.pve}`}
                            title={`Combat type · ${item.destinationType}`}
                          >
                            {item.destinationType}
                          </small>
                          <small
                            className={`${css.destinationStatus} ${item.destinationStatus === false ? css.offline : item.destinationStatus == null ? css.unknown : css.online}`}
                            title={`Current status · ${item.destinationStatus === false ? 'offline' : item.destinationStatus == null ? 'unknown' : 'online'}`}
                          >
                            {item.destinationStatus === false
                              ? 'Offline'
                              : item.destinationStatus == null
                                ? 'Unknown'
                                : 'Online'}
                          </small>
                        </span>
                      ) : null}
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
          {displayedBrand} · Dune: Awakening · v{APP_VERSION}
        </span>
        <span>{site.footer}</span>
      </footer>
    </div>
  );
}
