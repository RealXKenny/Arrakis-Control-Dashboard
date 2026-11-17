import type { ReactNode } from 'react';
import { Card } from './card';
import { Button } from './button';

/** Callers supply honest messages and explicit retry actions; no automatic network activity. */
export function StatePanel({
  title,
  children,
  kind = 'empty',
  onRetry,
}: {
  title: string;
  children?: ReactNode;
  kind?: 'empty' | 'loading' | 'error';
  onRetry?: () => void;
}) {
  return (
    <Card
      as="div"
      className="ui-card p-5"
      role={kind === 'error' ? 'alert' : kind === 'loading' ? 'status' : undefined}
      aria-busy={kind === 'loading' ? true : undefined}
    >
      <p className="font-semibold text-sand-100">{title}</p>
      {children && <div className="mt-2 max-w-prose text-sm leading-relaxed text-sand-300">{children}</div>}
      {onRetry && (
        <Button type="button" variant="secondary" className="mt-4" onClick={onRetry}>
          Try again
        </Button>
      )}
    </Card>
  );
}
