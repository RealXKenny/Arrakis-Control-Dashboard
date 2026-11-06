import { useState } from 'react';
import type { AdminOperation } from '../types';
import css from '../styles/admin.module.css';

export default function ApiReference({
  operations,
  onSelect,
}: {
  operations: AdminOperation[];
  onSelect: (operation: AdminOperation) => void;
}) {
  const [search, setSearch] = useState('');
  const [group, setGroup] = useState('all');
  const [method, setMethod] = useState('all');
  const [page, setPage] = useState(0);
  const filtered = operations.filter(
    (entry) =>
      (group === 'all' || entry.group === group) &&
      (method === 'all' || entry.method === method) &&
      `${entry.title} ${entry.route} ${entry.parameters}`.toLowerCase().includes(search.toLowerCase()),
  );
  return (
    <section className={css.panel} aria-label="Administration API reference">
      <p className={css.eyebrow}>API REFERENCE</p>
      <h2>Every operation, explained</h2>
      <p>
        Browse what each API does, its parameters, and whether this dashboard can use it. Opening a tool prepares its
        form.
      </p>
      <div className={css.formGrid}>
        <label className={css.field}>
          Search API reference
          <input
            type="search"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(0);
            }}
          />
        </label>
        <label className={css.field}>
          Feature group
          <select
            value={group}
            onChange={(event) => {
              setGroup(event.target.value);
              setPage(0);
            }}
          >
            <option value="all">All features</option>
            {[...new Set(operations.map((entry) => entry.group))].map((name) => (
              <option key={name}>{name}</option>
            ))}
          </select>
        </label>
        <label className={css.field}>
          HTTP method
          <select
            value={method}
            onChange={(event) => {
              setMethod(event.target.value);
              setPage(0);
            }}
          >
            <option value="all">All methods</option>
            {['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].map((name) => (
              <option key={name}>{name}</option>
            ))}
          </select>
        </label>
      </div>
      <p>
        {filtered.length} matching APIs · {operations.filter((entry) => !entry.restriction).length} eligible operations
        · {operations.filter((entry) => entry.restriction).length} restricted or planned
      </p>
      <div className={css.tableScroll}>
        <table>
          <thead>
            <tr>
              <th>Method & route</th>
              <th>Purpose</th>
              <th>Parameters</th>
              <th>Access</th>
              <th>Tool</th>
            </tr>
          </thead>
          <tbody>
            {filtered.slice(page * 20, page * 20 + 20).map((entry) => (
              <tr key={entry.id}>
                <td>
                  <span className={css.method}>{entry.method}</span>
                  <code>{entry.route}</code>
                </td>
                <td>
                  {entry.title}
                  <small>
                    {entry.group} · {entry.mode}
                  </small>
                </td>
                <td>{entry.parameters}</td>
                <td>
                  {entry.restriction ??
                    (entry.provider === 'adapter'
                      ? 'Discord adapter credential'
                      : 'Admin API key with required scopes')}
                </td>
                <td>
                  <button onClick={() => onSelect(entry)}>Open tool</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!filtered.length && <p>No matching operations.</p>}
      <nav className={css.actions} aria-label="API reference pages">
        <button disabled={!page} onClick={() => setPage(page - 1)}>
          Previous APIs
        </button>
        <span>
          Page {page + 1} of {Math.max(1, Math.ceil(filtered.length / 20))}
        </span>
        <button disabled={(page + 1) * 20 >= filtered.length} onClick={() => setPage(page + 1)}>
          Next APIs
        </button>
      </nav>
    </section>
  );
}
