import type { ReactNode } from 'react';

export function PageHeader({ eyebrow, title, children }: { eyebrow: string; title: string; children?: ReactNode }) {
  return (
    <header className="mb-10 flex flex-wrap items-end justify-between gap-6 border-b border-sand-200/10 pb-6">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h1 className="mt-3 text-2xl sm:text-4xl">{title}</h1>
      </div>
      {children}
    </header>
  );
}

export function Notice({
  tone = 'info',
  title,
  children,
}: {
  tone?: 'info' | 'warn';
  title: string;
  children?: ReactNode;
}) {
  return (
    <div
      role="status"
      className={`panel border-l-4 p-6 ${tone === 'warn' ? 'border-l-status-warn' : 'border-l-ibad-400'}`}
    >
      <p className="text-sm font-bold uppercase tracking-[0.2em] text-sand-50">{title}</p>
      {children && <p className="mt-2 max-w-prose text-sm leading-relaxed text-sand-400">{children}</p>}
    </div>
  );
}
