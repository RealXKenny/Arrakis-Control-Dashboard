import { Card } from './card';
import type { ReactNode } from 'react';

export function PageHeader({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow: string;
  title: string;
  description?: string;
  children?: ReactNode;
}) {
  return (
    <header className="mb-6 flex flex-wrap items-center justify-between gap-4 border-b border-sand-200/10 pb-5">
      <div className="min-w-0">
        <p className="eyebrow">{eyebrow}</p>
        <h1 className="mt-1.5 text-[1.5rem] leading-tight sm:text-[1.75rem]">{title}</h1>
        {description && <p className="mt-2 max-w-prose text-sm leading-relaxed text-sand-300">{description}</p>}
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
    <Card
      as="div"
      role="status"
      className={`panel border-l-4 p-6 ${tone === 'warn' ? 'border-l-status-warn' : 'border-l-ibad-400'}`}
    >
      <p className="text-sm font-semibold text-sand-50">{title}</p>
      {children && <p className="mt-2 max-w-prose text-sm leading-relaxed text-sand-400">{children}</p>}
    </Card>
  );
}
