import Link from 'next/link';
import UnreadBadge from './UnreadBadge';

/** Shared pillbox link styling for the Topbar and secondary navigation rows. */

export type PillNavItem = { label: string; href: string; active?: boolean; unreadCount?: number };

export function pillClass(active: boolean) {
  return `inline-flex min-h-9 items-center rounded-full border px-3 py-1.5 text-[11px] font-medium whitespace-nowrap no-underline transition-colors ${active ? 'border-indigo-500/20 bg-indigo-500/10 text-indigo-300' : 'border-transparent text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100'}`;
}

export default function PillNav({ label, items }: { label: string; items: readonly PillNavItem[] }) {
  return (
    <nav aria-label={label} className="min-w-0 overflow-x-auto">
      <ul className="m-0 flex w-max max-w-full list-none items-center gap-1 rounded-full border border-white/[0.06] bg-zinc-950/45 p-1">
        {items.map((item) => (
          <li key={item.href} className="shrink-0">
            <Link
              href={item.href}
              shallow
              scroll={false}
              aria-current={item.active ? 'page' : undefined}
              aria-label={item.unreadCount ? item.label : undefined}
              aria-description={item.unreadCount ? `${item.unreadCount} unread messages` : undefined}
              className={pillClass(Boolean(item.active))}
            >
              {item.label}
              <UnreadBadge count={item.unreadCount ?? 0} />
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
