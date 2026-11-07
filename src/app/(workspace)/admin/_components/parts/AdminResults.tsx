import { useState } from 'react';
import type { AdminOperation } from '../../../../../features/admin/types';
import { fieldLabel, resultRows, rowContext } from '../../../../../features/admin/operation-fields';
import { ui } from '../ui';

export default function AdminResults({
  value,
  operation,
  operations,
  path,
  busy,
  onSelect,
}: {
  value: unknown;
  operation: AdminOperation;
  operations: AdminOperation[];
  path: Record<string, string>;
  busy: boolean;
  onSelect: (operation: AdminOperation, path: Record<string, string>) => void;
}) {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const rows = resultRows(value);
  const filtered = rows?.filter((row) => JSON.stringify(row).toLowerCase().includes(search.toLowerCase())) ?? [];
  const columns = [...new Set((rows ?? []).flatMap(Object.keys))].slice(0, 8);
  return (
    <>
      {rows && (
        <>
          <label className={ui.field}>
            Filter returned rows
            <input
              type="search"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(0);
              }}
            />
          </label>
          <p className={ui.count}>{filtered.length} matching rows in this response</p>
          <div className={ui.tableScroll}>
            <table>
              <thead>
                <tr>
                  {columns.map((name) => (
                    <th key={name}>{fieldLabel(name)}</th>
                  ))}
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.slice(page * 20, page * 20 + 20).map((row, index) => {
                  const context = rowContext(operation, row, path);
                  const related = operations.filter(
                    (entry) =>
                      !entry.restriction &&
                      entry.pathParameters.length > 0 &&
                      entry.pathParameters.every((name) => context[name]) &&
                      entry.id !== operation.id,
                  );
                  return (
                    <tr key={index}>
                      {columns.map((name) => (
                        <td key={name}>
                          {row[name] == null
                            ? '—'
                            : typeof row[name] === 'object'
                              ? JSON.stringify(row[name])
                              : String(row[name])}
                        </td>
                      ))}
                      <td>
                        {related.length ? (
                          <select
                            aria-label={`Actions for row ${page * 20 + index + 1}`}
                            disabled={busy}
                            value=""
                            onChange={(event) => {
                              const next = related.find((entry) => entry.id === event.target.value);
                              if (next) onSelect(next, context);
                            }}
                          >
                            <option value="">View or manage…</option>
                            {related.map((entry) => (
                              <option value={entry.id} key={entry.id}>
                                {entry.method === 'GET' ? 'View' : 'Change'} · {entry.title}
                              </option>
                            ))}
                          </select>
                        ) : (
                          '—'
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {!filtered.length && <p>No matching rows.</p>}
          {filtered.length > 20 && (
            <nav className={ui.actions} aria-label="Returned rows">
              <button disabled={page === 0} onClick={() => setPage(page - 1)}>
                Previous rows
              </button>
              <span>Page {page + 1}</span>
              <button disabled={(page + 1) * 20 >= filtered.length} onClick={() => setPage(page + 1)}>
                Next rows
              </button>
            </nav>
          )}
        </>
      )}
      <details open={!rows}>
        <summary>Inspect response{rows ? ` · ${rows.length} rows` : ''}</summary>
        <pre>{JSON.stringify(value, null, 2)}</pre>
      </details>
    </>
  );
}
