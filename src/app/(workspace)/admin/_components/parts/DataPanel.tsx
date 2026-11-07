import type { ReactNode } from 'react';
import { findOperation } from '../../../../../features/admin/client';
import useAdminQuery from '../hooks/useAdminQuery';
import type { AdminOperation } from '../../../../../features/admin/types';
import { fieldLabel } from '../../../../../features/admin/operation-fields';
import { columnsFor, display, facts, resultRows, type Row } from '../../../../../features/admin/records';
import { ui } from '../ui';

/** Loading, error, empty and data states shared by every dedicated screen. */
export function QueryState({
  loading,
  error,
  onRetry,
  children,
}: {
  loading: boolean;
  error?: string;
  onRetry?: () => void;
  children: ReactNode;
}) {
  if (loading)
    return (
      <p role="status" className={ui.stateLine}>
        Loading…
      </p>
    );
  if (error)
    return (
      <div role="alert" className={ui.error}>
        {error}
        {onRetry && (
          <>
            {' '}
            <button type="button" onClick={onRetry}>
              Try again
            </button>
          </>
        )}
      </div>
    );
  return <>{children}</>;
}

export function Facts({ value }: { value: unknown }) {
  const entries = facts(value);
  if (!entries.length) return <p className={ui.stateLine}>The Console reported nothing for this section.</p>;
  return (
    <dl className={ui.facts}>
      {entries.map(([label, entry]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>{entry}</dd>
        </div>
      ))}
    </dl>
  );
}

export function Table({
  value,
  caption,
  empty = 'Nothing to show.',
  action,
}: {
  value: unknown;
  caption: string;
  empty?: string;
  action?: (row: Row) => ReactNode;
}) {
  const rows = resultRows(value);
  if (!rows?.length) return <p className={ui.stateLine}>{empty}</p>;
  const columns = columnsFor(rows);
  return (
    <div className={ui.tableScroll}>
      <table>
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr>
            {columns.map((name) => (
              <th key={name}>{fieldLabel(name)}</th>
            ))}
            {action && <th>Actions</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={index}>
              {columns.map((name) => (
                <td key={name}>{display(row[name])}</td>
              ))}
              {action && <td>{action(row)}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** A titled panel that loads one read operation and renders it as facts or a table. */
export function ReadPanel({
  operations,
  id,
  title,
  kind = 'facts',
  empty,
  query,
}: {
  operations: AdminOperation[];
  id: string;
  title: string;
  kind?: 'facts' | 'table';
  empty?: string;
  query?: Record<string, string | number | boolean>;
}) {
  const result = useAdminQuery(findOperation(operations, id), { query });
  return (
    <section className={ui.panel} aria-label={title}>
      <h3>{title}</h3>
      <QueryState loading={result.loading} error={result.error} onRetry={result.refresh}>
        {kind === 'table' ? (
          <Table value={result.data} caption={title} empty={empty ?? 'Nothing was reported.'} />
        ) : (
          <Facts value={result.data} />
        )}
      </QueryState>
    </section>
  );
}
