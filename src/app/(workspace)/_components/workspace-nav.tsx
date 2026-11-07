'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const TABS = [
  { href: '/portal', label: 'Overview', exact: true },
  { href: '/character', label: 'Character' },
  { href: '/holdings', label: 'Holdings' },
  { href: '/storage', label: 'Storage' },
  { href: '/map', label: 'Map' },
  { href: '/vehicles', label: 'Vehicles' },
  { href: '/market', label: 'Market' },
  { href: '/bases', label: 'Base marketplace' },
  { href: '/guilds', label: 'Guilds' },
  { href: '/guild', label: 'My guild' },
] as const;

/** Workspace sub-navigation shown under the top bar on every signed-in page. */
/** `showAdmin` is a rendering hint computed on the server from the verified session; /admin re-verifies. */
export function WorkspaceNav({ showAdmin = false }: { showAdmin?: boolean }) {
  const pathname = usePathname();
  const tabs = showAdmin ? [...TABS, { href: '/admin', label: 'Admin' }] : TABS;
  return (
    <nav aria-label="Workspace" className="border-b border-sand-200/10 bg-obsidian-900/60">
      <ul className="mx-auto flex max-w-shell gap-1 overflow-x-auto px-4 sm:px-6">
        {tabs.map((tab) => {
          const active =
            'exact' in tab ? pathname === tab.href : pathname === tab.href || pathname.startsWith(`${tab.href}/`);
          return (
            <li key={tab.href} className="shrink-0">
              <Link
                href={tab.href}
                aria-current={active ? 'page' : undefined}
                className={`flex h-11 items-center border-b-2 px-3 text-[0.6875rem] font-bold uppercase tracking-[0.2em] ${
                  active ? 'border-spice-500 text-spice-400' : 'border-transparent text-sand-400 hover:text-sand-100'
                }`}
              >
                {tab.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
