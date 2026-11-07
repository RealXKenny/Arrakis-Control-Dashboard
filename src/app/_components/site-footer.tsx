import Link from 'next/link';
import { Logo } from './logo';
import { NAV_ITEMS } from './nav-config';

export function SiteFooter() {
  return (
    <footer className="border-t border-sand-200/10 bg-obsidian-900">
      <div className="mx-auto flex max-w-shell flex-col gap-8 px-4 py-10 sm:px-6 md:flex-row md:items-center md:justify-between">
        <Logo />
        <ul className="flex flex-wrap gap-x-6 gap-y-2">
          {NAV_ITEMS.map((item) => (
            <li key={item.href}>
              <Link
                href={item.href}
                className="text-xs font-bold uppercase tracking-[0.2em] text-sand-400 hover:text-spice-300"
              >
                {item.label}
              </Link>
            </li>
          ))}
        </ul>
        <p className="font-mono text-[0.6875rem] uppercase tracking-widest text-sand-600">
          Fan-made. Not affiliated with Funcom.
        </p>
      </div>
    </footer>
  );
}
