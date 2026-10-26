import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import DashboardShell from '../../../components/DashboardShell';
import type { AdminOperation } from '../types';
import css from '../admin.module.css';

function objectInput(text: string): Record<string, unknown> {
  const value: unknown = JSON.parse(text || '{}');
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Enter a JSON object, for example {"page":0,"pageSize":20}.');
  return value as Record<string, unknown>;
}

/** Tables for ordinary lists, expandable JSON for nested provider-specific results. */
function ResultView({ value }: { value: unknown }) {
  const record = value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
  const rows = Array.isArray(value) ? value : Array.isArray(record.rows) ? record.rows : null;
  const columns = rows?.[0] && typeof rows[0] === 'object' ? Object.keys(rows[0]).slice(0, 8) : [];
  return (
    <>
      {rows && columns.length > 0 && (
        <div className={css.tableScroll}>
          <table>
            <thead>
              <tr>
                {columns.map((key) => (
                  <th key={key}>{key.replaceAll('_', ' ')}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, 100).map((row, index) => (
                <tr key={index}>
                  {columns.map((key) => (
                    <td key={key}>
                      {row[key] == null
                        ? '—'
                        : typeof row[key] === 'object'
                          ? JSON.stringify(row[key])
                          : String(row[key])}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <details open={!rows}>
        <summary>Inspect response{rows ? ` · ${rows.length} rows (table shows up to 100)` : ''}</summary>
        <pre>{JSON.stringify(value, null, 2)}</pre>
      </details>
    </>
  );
}

export default function AdminWorkspace({ accountName }: { accountName: string }) {
  const [operations, setOperations] = useState<AdminOperation[]>([]);
  const [configured, setConfigured] = useState(false);
  const [consoleOrigin, setConsoleOrigin] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [group, setGroup] = useState('All operations');
  const [search, setSearch] = useState('');
  const [operation, setOperation] = useState<AdminOperation | null>(null);
  const [path, setPath] = useState<Record<string, string>>({});
  const [query, setQuery] = useState('{}');
  const [body, setBody] = useState('{}');
  const [acknowledgement, setAcknowledgement] = useState('');
  const [files, setFiles] = useState<Record<string, File>>({});
  const [result, setResult] = useState<unknown>(undefined);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [truncated, setTruncated] = useState(false);
  const request = useRef<AbortController | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/admin/catalog', { cache: 'no-store', signal: controller.signal })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error ?? 'Administration is unavailable.');
        setOperations(data.operations);
        setConfigured(data.configured);
        setConsoleOrigin(data.consoleOrigin);
        setOperation(
          data.operations.find((entry: AdminOperation) => entry.id === 'get-server-status') ?? data.operations[0],
        );
      })
      .catch((failure) => {
        if (!controller.signal.aborted) setError(failure.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => {
      controller.abort();
      request.current?.abort();
    };
  }, []);

  const groups = ['All operations', ...new Set(operations.map((entry) => entry.group))];
  const filtered = operations.filter(
    (entry) =>
      (group === 'All operations' || entry.group === group) &&
      `${entry.title} ${entry.route} ${entry.method}`.toLowerCase().includes(search.toLowerCase()),
  );
  const confirmation = operation ? `${operation.method} ${operation.route}` : '';
  const mutation = operation?.method !== 'GET';
  const blocked =
    operation?.restriction ||
    (operation?.provider === 'console' && !configured
      ? 'Set ADMIN_CONSOLE_API_KEY on the server to enable these operations.'
      : '');

  function select(next: AdminOperation) {
    if (busy) return;
    setOperation(next);
    setPath({});
    setQuery('{}');
    setBody('{}');
    setFiles({});
    setAcknowledgement('');
    setResult(undefined);
    setError('');
    setStatus('');
    setTruncated(false);
  }

  async function run() {
    if (!operation || busy || blocked) return;
    setError('');
    setResult(undefined);
    setStatus('');
    setTruncated(false);
    let payload;
    try {
      payload = { operation: operation.id, path, query: objectInput(query), body: objectInput(body), acknowledgement };
    } catch (failure) {
      setError(failure.message);
      return;
    }
    if (operation.mode === 'download') {
      // A native same-origin form keeps large transfers out of client-side JavaScript memory.
      const form = document.createElement('form');
      form.method = 'POST';
      form.action = '/api/admin/execute';
      form.target = '_blank';
      const field = document.createElement('input');
      field.type = 'hidden';
      field.name = 'request';
      field.value = JSON.stringify(payload);
      form.append(field);
      document.body.append(form);
      form.submit();
      form.remove();
      setStatus('Download requested. Provider errors open in the download tab.');
      setAcknowledgement('');
      return;
    }
    const controller = new AbortController();
    request.current = controller;
    const timeout = setTimeout(() => controller.abort(), operation.mode === 'events' ? 65_000 : 125_000);
    setBusy(true);
    try {
      const upload = ['multipart', 'upload'].includes(operation.mode);
      let outgoing: FormData | string = JSON.stringify(payload);
      if (upload) {
        const chosen = operation.files ?? [];
        if (chosen.some((name) => !files[name])) throw new Error('Choose every required file.');
        if (chosen.reduce((sum, name) => sum + files[name].size, 0) > 8 * 1024 * 1024)
          throw new Error('The combined file limit is 8 MiB.');
        outgoing = new FormData();
        outgoing.set('request', JSON.stringify(payload));
        for (const name of chosen) outgoing.set(name, files[name]);
      }
      const response = await fetch(upload ? '/api/admin/upload' : '/api/admin/execute', {
        method: 'POST',
        headers: upload ? {} : { 'Content-Type': 'application/json' },
        body: outgoing,
        signal: controller.signal,
      });
      if (
        operation.mode === 'events' &&
        response.ok &&
        response.body &&
        response.headers.get('content-type')?.includes('text/event-stream')
      ) {
        setStatus('Streaming · stops after 60 seconds or 2 MiB');
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let text = '';
        while (true) {
          const part = await reader.read();
          if (part.done) break;
          text = (text + decoder.decode(part.value, { stream: true })).slice(-64 * 1024);
          setResult({ events: text });
        }
        setStatus('Stream ended. Run again to reconnect.');
      } else {
        const data = await response.json();
        setResult(data.data ?? data);
        setTruncated(data.truncated === true);
        setStatus(`HTTP ${data.upstreamStatus ?? response.status}`);
        if (!response.ok)
          setError(`${data.error ?? 'Request failed.'}${data.requestId ? ` Request ID: ${data.requestId}` : ''}`);
      }
    } catch (failure) {
      setError(
        controller.signal.aborted
          ? 'Stopped waiting. A submitted change may still be running; check its status before retrying.'
          : failure.message || 'Request failed.',
      );
    } finally {
      clearTimeout(timeout);
      request.current = null;
      setBusy(false);
      setAcknowledgement('');
      // Credentials and passphrases entered for writes are never retained after submission.
      if (mutation) {
        setBody('{}');
        setFiles({});
      }
    }
  }

  return (
    <DashboardShell
      brand="Crimson Skies"
      brandHref="/portal"
      subtitle="Administration"
      navigation={[
        { label: 'Workspace', group: 'Dashboard', href: '/portal' },
        { label: 'Administration', group: 'Manage', href: '/admin', active: true },
      ]}
      actions={
        <>
          <span className={css.account}>{accountName}</span>
          <Link href="/portal">Back to workspace</Link>
        </>
      }
    >
      <header className={css.header}>
        <div>
          <p>Administration</p>
          <h1>Your server. Under control.</h1>
          <span>Inspect data, manage operations, and review changes from one workspace.</span>
        </div>
        <span className={css.access}>Administrator access</span>
      </header>
      <div className={css.metrics}>
        <article>
          <strong>{operations.length || '—'}</strong>
          <span>Documented operations</span>
        </article>
        <article>
          <strong>{operations.filter((entry) => !entry.restriction).length || '—'}</strong>
          <span>API-key compatible</span>
        </article>
        <article>
          <strong>{operations.filter((entry) => entry.restriction).length || '—'}</strong>
          <span>Restricted or planned</span>
        </article>
      </div>
      {loading ? (
        <p role="status">Loading administration…</p>
      ) : (
        <div className={css.workspace}>
          <aside className={css.sidebar} aria-label="API categories">
            <h2>Browse categories</h2>
            {groups.map((name) => (
              <button key={name} aria-pressed={name === group} onClick={() => setGroup(name)}>
                {name}
                <span>
                  {name === 'All operations'
                    ? operations.length
                    : operations.filter((entry) => entry.group === name).length}
                </span>
              </button>
            ))}
          </aside>
          <section className={css.operations} aria-label="Console operations">
            <label className={css.search}>
              Find an operation
              <input
                type="search"
                placeholder="Search players, backups, maps…"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </label>
            <p className={css.count}>{filtered.length} operations</p>
            <div className={css.operationList}>
              {filtered.map((entry) => (
                <button
                  key={entry.id}
                  disabled={busy}
                  aria-pressed={entry.id === operation?.id}
                  onClick={() => select(entry)}
                >
                  <span className={css.method}>{entry.method}</span>
                  <span>
                    {entry.title}
                    <small>{entry.restriction ? 'Restricted' : entry.mode === 'json' ? entry.route : entry.mode}</small>
                  </span>
                </button>
              ))}
            </div>
          </section>
          <section className={css.detail} aria-label="Selected operation">
            {operation && (
              <>
                <div className={css.operationHeader}>
                  <span className={css.method}>{operation.method}</span>
                  <span>{operation.group}</span>
                </div>
                <h2>{operation.title}</h2>
                <code className={css.route}>{operation.route}</code>
                {blocked ? (
                  <div className={css.notice} role="status">
                    <p>{blocked}</p>
                    {operation.restriction && consoleOrigin && (
                      <a href={consoleOrigin} target="_blank" rel="noreferrer">
                        Open Console ↗
                      </a>
                    )}
                  </div>
                ) : (
                  <>
                    <details className={css.help}>
                      <summary>Parameters and requirements</summary>
                      <p>{operation.parameters || 'No parameters required.'}</p>
                      {operation.confirmationPhrases.map((phrase) => (
                        <p key={phrase}>
                          Console confirmation phrase: <code>{phrase}</code>
                        </p>
                      ))}
                    </details>
                    {operation.pathParameters.map((name) => (
                      <label className={css.field} key={name}>
                        {name.replace(/([a-z])([A-Z])/g, '$1 $2')}
                        <input
                          required
                          value={path[name] ?? ''}
                          disabled={busy}
                          onChange={(event) => {
                            setPath({ ...path, [name]: event.target.value });
                            setAcknowledgement('');
                          }}
                        />
                      </label>
                    ))}
                    <label className={css.field}>
                      Query parameters <span>JSON object · IDs may be decimal strings</span>
                      <textarea
                        spellCheck={false}
                        value={query}
                        disabled={busy}
                        onChange={(event) => {
                          setQuery(event.target.value);
                          setAcknowledgement('');
                        }}
                        rows={3}
                      />
                    </label>
                    {mutation && (
                      <label className={css.field}>
                        Request fields{' '}
                        <span>
                          {operation.mode === 'multipart'
                            ? 'Non-file form fields as a JSON object'
                            : 'JSON object · include any required Console confirmation phrase'}
                        </span>
                        <textarea
                          spellCheck={false}
                          value={body}
                          disabled={busy}
                          onChange={(event) => {
                            setBody(event.target.value);
                            setAcknowledgement('');
                          }}
                          rows={6}
                        />
                      </label>
                    )}
                    {operation.files?.map((name) => (
                      <label className={css.field} key={name}>
                        {name} file <span>Combined upload limit: 8 MiB</span>
                        <input
                          key={`${operation.id}-${name}`}
                          type="file"
                          disabled={busy}
                          onChange={(event) => {
                            if (event.target.files?.[0]) setFiles({ ...files, [name]: event.target.files[0] });
                            setAcknowledgement('');
                          }}
                        />
                      </label>
                    ))}
                    {mutation && (
                      <div className={css.confirmation}>
                        <strong>This operation changes server state.</strong>
                        <p>Review the target and request fields. To proceed, type:</p>
                        <code>{confirmation}</code>
                        <label className={css.field}>
                          Confirm operation
                          <input
                            autoComplete="off"
                            value={acknowledgement}
                            disabled={busy}
                            onChange={(event) => setAcknowledgement(event.target.value)}
                          />
                        </label>
                      </div>
                    )}
                    <div className={css.actions}>
                      <button
                        disabled={busy || (mutation && acknowledgement !== confirmation)}
                        onClick={() => void run()}
                      >
                        {busy
                          ? 'Working…'
                          : operation.mode === 'download'
                            ? 'Download file'
                            : operation.mode === 'events'
                              ? 'Start log stream'
                              : mutation
                                ? 'Execute operation'
                                : 'Run read'}
                      </button>
                      {busy && <button onClick={() => request.current?.abort()}>Stop waiting</button>}
                    </div>
                  </>
                )}
              </>
            )}
            {error && (
              <p className={css.error} role="alert">
                {error}
              </p>
            )}
            {status && (
              <p className={css.status} role="status">
                {status}
              </p>
            )}
            {truncated && (
              <p className={css.notice}>
                This preview was truncated. Narrow the query or use pagination to inspect more data.
              </p>
            )}
            {result !== undefined && (
              <div className={css.result}>
                <h3>Result</h3>
                <ResultView value={result} />
              </div>
            )}
          </section>
        </div>
      )}
      {!loading && !operations.length && error && (
        <p className={css.error} role="alert">
          {error}
        </p>
      )}
    </DashboardShell>
  );
}
