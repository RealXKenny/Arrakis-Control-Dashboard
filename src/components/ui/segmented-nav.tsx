import Link from 'next/link';

export interface SegmentedItem {
  id: string;
  label: string;
  count?: number;
  href: string;
}

/** Link-based tab bar (works without JavaScript, state lives in the URL). */
export function SegmentedNav({ label, items, active }: { label: string; items: SegmentedItem[]; active: string }) {
  return (
    <nav
      aria-label={label}
      className={`mb-6 grid border border-sand-200/20 ${items.length > 4 ? 'max-w-3xl max-lg:grid-cols-3!' : 'max-w-md'} ${items.length > 3 ? 'max-sm:grid-cols-2!' : ''}`}
      style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}
    >
      {items.map((item) => (
        <Link
          key={item.id}
          href={item.href}
          replace
          aria-current={active === item.id ? 'page' : undefined}
          className={`flex min-h-11 items-center justify-center gap-2 text-xs font-bold uppercase tracking-[0.2em] ${
            active === item.id ? 'bg-spice-500 text-obsidian-950' : 'text-sand-300 hover:text-spice-300'
          }`}
        >
          {item.label}
          {item.count !== undefined && <span className="font-mono opacity-70">{item.count}</span>}
        </Link>
      ))}
    </nav>
  );
}
