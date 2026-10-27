import type { ReactNode } from 'react';
import ChangelogDialog from '../modules/changelog/components/ChangelogDialog';
import Topbar, { type TopbarItem } from './Topbar';

/** Shared public, member, and admin shell with pill navigation and fluid gutters. */

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
  const items: TopbarItem[] = navigation.map(({ label, href, active }) => ({ label, href, active }));
  return (
    <div className="flex min-h-screen flex-col bg-transparent font-sans text-zinc-200 antialiased">
      <a
        href="#dashboard-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-3 focus:left-3 focus:z-50 focus:rounded-full focus:border focus:border-indigo-500/20 focus:bg-zinc-900 focus:px-4 focus:py-2 focus:text-sm focus:text-zinc-100"
      >
        Skip to content
      </a>
      <Topbar
        brand={brand}
        subtitle={subtitle}
        brandHref={brandHref}
        items={items}
        actions={actions}
        onNavigate={onNavigate}
      />
      <main id="dashboard-content" className="workspace-frame workspace-content">
        {children}
      </main>
      <footer className="border-t border-white/5">
        <div className="workspace-frame flex flex-wrap items-center justify-between gap-2 py-5 text-xs text-zinc-500">
          <span>
            {brand} · <ChangelogDialog />
          </span>
          <span>Your community. Connected.</span>
        </div>
      </footer>
    </div>
  );
}
