'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import useSupportUnread from '../../guilds/hooks/use-support-unread';
import { ADMIN_SECTIONS, adminHref, findAdminTab } from '../navigation';

const ANNOUNCEMENTS_HREF = '/admin/changelog';
const ANNOUNCEMENTS = { id: 'announcements', label: 'Discord announcements' };
const CONFIGURATION = 'configuration';

function Badge({ count }: { count: number }) {
  if (!count) return null;
  return (
    <span
      className="ml-2 bg-spice-500 px-1.5 font-mono text-[0.625rem] text-obsidian-950"
      aria-label={`${count} unread`}
    >
      {count > 99 ? '99+' : count}
    </span>
  );
}

/**
 * Grouped administrator navigation: sections, tabs and breadcrumbs. State is the URL
 * (`?tab=`), so deep links and back/forward keep working. Rendering here is cosmetic;
 * every page and API route re-verifies the administrator on the server.
 */
export function AdminNav() {
  const pathname = usePathname();
  const params = useSearchParams();
  const unread = useSupportUnread({ admin: true });
  const announcements = pathname.startsWith(ANNOUNCEMENTS_HREF);
  const located = findAdminTab(params.get('tab'));
  const section = announcements ? ADMIN_SECTIONS.find((entry) => entry.id === CONFIGURATION)! : located.section;
  const currentTabId = announcements ? ANNOUNCEMENTS.id : located.tab.id;
  const tabLabel = announcements ? ANNOUNCEMENTS.label : located.tab.label;

  const bar = 'mx-auto flex max-w-shell gap-1 overflow-x-auto px-4 sm:px-6';
  const link = (active: boolean, small = false) =>
    `flex items-center whitespace-nowrap border-b-2 px-3 font-bold uppercase ${
      small ? 'h-9 text-[0.625rem] tracking-[0.16em]' : 'h-11 text-[0.6875rem] tracking-[0.2em]'
    } ${active ? 'border-spice-500 text-spice-400' : 'border-transparent text-sand-400 hover:text-sand-100'}`;

  return (
    <div className="border-b border-sand-200/10 bg-obsidian-900/40">
      <nav aria-label="Breadcrumb" className="mx-auto max-w-shell px-4 pt-4 sm:px-6">
        <ol className="flex flex-wrap items-center gap-2 font-mono text-[0.6875rem] uppercase tracking-widest text-sand-500">
          <li>
            <Link href={adminHref('overview')} className="hover:text-spice-300">
              Administration
            </Link>
          </li>
          <li aria-hidden="true">/</li>
          <li>{section.label}</li>
          <li aria-hidden="true">/</li>
          <li aria-current="page" className="text-sand-200">
            {tabLabel}
          </li>
        </ol>
      </nav>
      <nav aria-label="Administration sections">
        <ul className={bar}>
          {ADMIN_SECTIONS.map((entry) => (
            <li key={entry.id} className="shrink-0">
              <Link
                href={adminHref(entry.tabs[0].id)}
                aria-current={entry.id === section.id ? 'page' : undefined}
                className={link(entry.id === section.id)}
              >
                {entry.label}
                {entry.id === 'community' && <Badge count={unread.total} />}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      <nav aria-label={`${section.label} pages`} className="border-t border-sand-200/10">
        <ul className={bar}>
          {section.tabs.map((entry) => (
            <li key={entry.id} className="shrink-0">
              <Link
                href={adminHref(entry.id)}
                aria-current={entry.id === currentTabId ? 'page' : undefined}
                className={link(entry.id === currentTabId, true)}
              >
                {entry.label}
                {entry.kind === 'guilds' && <Badge count={unread.total} />}
              </Link>
            </li>
          ))}
          {section.id === CONFIGURATION && (
            <li className="shrink-0">
              <Link
                href={ANNOUNCEMENTS_HREF}
                aria-current={announcements ? 'page' : undefined}
                className={link(announcements, true)}
              >
                {ANNOUNCEMENTS.label}
              </Link>
            </li>
          )}
        </ul>
      </nav>
    </div>
  );
}
