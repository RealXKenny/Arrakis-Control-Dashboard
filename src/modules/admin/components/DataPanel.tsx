import type { ReactNode } from 'react';
import { fieldLabel } from '../operation-fields';
import { columnsFor, display, facts, resultRows, type Row } from '../records';
import css from '../styles/admin.module.css';

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
      <p role="status" className={css.stateLine}>
        Loading…
      </p>
    );
  if (error)
    return (
      <div role="alert" className={css.error}>
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
  if (!entries.length) return <p className={css.stateLine}>The Console reported nothing for this section.</p>;
  return (
    <dl className={css.facts}>
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
  if (!rows?.length) return <p className={css.stateLine}>{empty}</p>;
  const columns = columnsFor(rows);
  return (
    <div className={css.tableScroll}>
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
