import type { ReactNode } from 'react';

export function StatusBadge({
  tone = 'neutral',
  children,
}: {
  tone?: 'success' | 'warning' | 'danger' | 'neutral';
  children: ReactNode;
}) {
  return (
    <span className="status-badge" data-tone={tone}>
      <span aria-hidden="true" className="status-badge-dot" />
      {children}
    </span>
  );
}
