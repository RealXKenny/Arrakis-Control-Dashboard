import useSupportUnread from '../../guilds/hooks/useSupportUnread';
import UnreadBadge from '../../../components/UnreadBadge';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import DashboardShell from '../../../components/DashboardShell';
import type { AdminOperation } from '../types';
import AdminOverviewPanel from './AdminOverviewPanel';
import ApiReference from './ApiReference';
import OperationGuide from './OperationGuide';
import useAdminOverview from '../hooks/useAdminOverview';
import OperationFields from './OperationFields';
import AdminResults from './AdminResults';
import GuildOversight from './GuildOversight';
import { defaultQuery, operationFields, resultHasNext } from '../operation-fields';
import css from '../styles/admin.module.css';

function objectInput(text: string): Record<string, unknown> {
  const value: unknown = JSON.parse(text || '{}');
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Enter a JSON object, for example {"page":0,"pageSize":20}.');
  return value as Record<string, unknown>;
}

export default function AdminWorkspace({ accountName }: { accountName: string }) {
  const [operations, setOperations] = useState<AdminOperation[]>([]);
  const supportUnread = useSupportUnread({ admin: true });
  const [view, setView] = useState<'overview' | 'operations' | 'guilds' | 'setup' | 'reference'>('overview');
  const overview = useAdminOverview(view === 'overview' || view === 'setup');
  const [showFeatures, setShowFeatures] = useState(false);
  const [accessFilter, setAccessFilter] = useState('all');
  const [validFields, setValidFields] = useState(true);
  const [fieldRevision, setFieldRevision] = useState(0);
  const [adapterConfigured, setAdapterConfigured] = useState(false);
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
        setAdapterConfigured(data.adapterConfigured === true);
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
      (accessFilter === 'all' || (accessFilter === 'supported' ? !entry.restriction : !!entry.restriction)) &&
      `${entry.title} ${entry.route} ${entry.method}`.toLowerCase().includes(search.toLowerCase()),
  );
  const confirmation = operation ? `${operation.method} ${operation.route}` : '';
  const mutation = operation?.method !== 'GET';
  const blocked =
    operation?.restriction ||
    (operation?.provider === 'console' && !configured
      ? 'Set ADMIN_CONSOLE_API_KEY on the server to enable these operations.'
      : operation?.provider === 'adapter' && !adapterConfigured
        ? 'Configure ADAPTER_TOKEN on the server to enable adapter operations.'
        : '');

  function select(next: AdminOperation, context: Record<string, string> = {}) {
    if (busy) return;
    setOperation(next);
    setView('operations');
    setValidFields(true);
    setFieldRevision((value) => value + 1);
    if (Object.keys(context).length) setGroup(next.group);
    setSearch('');
    setPath(
      Object.fromEntries(next.pathParameters.filter((name) => context[name]).map((name) => [name, context[name]])),
    );
    setQuery(JSON.stringify(defaultQuery(next)));
    setBody('{}');
    setFiles({});
    setAcknowledgement('');
    setResult(undefined);
    setError('');
    setStatus('');
    setTruncated(false);
  }

  async function run(queryOverride?: Record<string, unknown>) {
    if (!operation || busy || blocked || !validFields) return;
    setError('');
    setResult(undefined);
    setStatus('');
    setTruncated(false);
    let payload;
    try {
      payload = {
        operation: operation.id,
        path,
        query: queryOverride ?? objectInput(query),
        body: objectInput(body),
        acknowledgement,
      };
    } catch (failure) {
      setError(failure.message);
      return;
    }
    if (queryOverride) {
      setQuery(JSON.stringify(queryOverride));
      setFieldRevision((value) => value + 1);
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
        setStatus(`HTTP ${data.upstreamStatus ?? response.status}${data.warning ? ` · ${data.warning}` : ''}`);
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
        setFieldRevision((value) => value + 1);
      }
    }
  }

  return (
    <DashboardShell
      brand="Crimson Skies"
      subtitle="Administration"
      navigation={[
        { label: 'Workspace', group: 'Dashboard', href: '/portal' },
        { label: 'Administration', group: 'Manage', href: '/admin', active: true, unreadCount: supportUnread.total },
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
      <nav className={css.viewTabs} aria-label="Administration sections">
        <button aria-pressed={view === 'overview'} disabled={busy} onClick={() => setView('overview')}>
          Overview
        </button>
        <button aria-pressed={view === 'operations'} disabled={busy} onClick={() => setView('operations')}>
          Operations
        </button>
        <button
          aria-label="Guild oversight"
          aria-pressed={view === 'guilds'}
          disabled={busy}
          onClick={() => setView('guilds')}
        >
          Guild oversight <UnreadBadge count={supportUnread.total} />
        </button>
        <button aria-pressed={view === 'reference'} disabled={busy} onClick={() => setView('reference')}>
          API reference
        </button>
        <button aria-pressed={view === 'setup'} disabled={busy} onClick={() => setView('setup')}>
          Setup & connections
        </button>
        <button aria-expanded={showFeatures} onClick={() => setShowFeatures(!showFeatures)}>
          Browse features
        </button>
      </nav>
      {showFeatures && (
        <nav className={css.featureGrid} aria-label="Admin features">
          {groups
            .filter((name) => name !== 'All operations')
            .map((name) => (
              <button
                key={name}
                disabled={busy}
                onClick={() => {
                  setGroup(name);
                  setSearch('');
                  setView('operations');
                  setShowFeatures(false);
                  const first =
                    operations.find((entry) => entry.group === name && !entry.restriction) ??
                    operations.find((entry) => entry.group === name);
                  if (first) select(first);
                }}
              >
                <strong>{name}</strong>
                <span>
                  {operations.filter((entry) => entry.group === name && !entry.restriction).length} supported tools
                </span>
              </button>
            ))}
        </nav>
      )}
      {!loading && (view === 'overview' || view === 'setup') && (
        <AdminOverviewPanel
          data={overview.data}
          loading={overview.loading}
          error={overview.error}
          history={overview.history}
          setupOnly={view === 'setup'}
          operations={operations}
          onSelect={select}
          onSetup={() => setView('setup')}
          onRefresh={overview.refresh}
        />
      )}
      {!loading && view === 'reference' && <ApiReference operations={operations} onSelect={select} />}
      {!loading && view === 'guilds' && <GuildOversight operations={operations} onSelect={select} />}
      {loading ? (
        <p role="status">Loading administration…</p>
      ) : view === 'operations' ? (
        <div className={css.workspace}>
          <aside className={css.sidebar} aria-label="API categories">
            <h2>Browse categories</h2>
            {groups.map((name) => (
              <button
                key={name}
                aria-pressed={name === group}
                disabled={busy}
                onClick={() => {
                  setGroup(name);
                  setSearch('');
                }}
              >
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
            <label className={css.search}>
              Availability
              <select value={accessFilter} onChange={(event) => setAccessFilter(event.target.value)}>
                <option value="all">All tools</option>
                <option value="supported">Supported tools</option>
                <option value="restricted">Requires Console</option>
              </select>
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
                <OperationGuide operation={operation} />
                {operation.id === 'post-guilds-guildid-members-playerid-promote' && (
                  <p className={css.notice}>
                    Promoting an Officer transfers leadership and demotes the current leader. Check the current rank
                    before confirming.
                  </p>
                )}
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
                          aria-label={name.replace(/([a-z])([A-Z])/g, '$1 $2')}
                          value={path[name] ?? ''}
                          disabled={busy}
                          onChange={(event) => {
                            setPath({ ...path, [name]: event.target.value });
                            setResult(undefined);
                            setAcknowledgement('');
                          }}
                        />
                      </label>
                    ))}
                    <OperationFields
                      key={operation.id + '-' + fieldRevision}
                      operation={operation}
                      query={query}
                      body={body}
                      disabled={busy}
                      onValidityChange={setValidFields}
                      onChange={(location, value) => {
                        if (location === 'query') setQuery(value);
                        else setBody(value);
                        setAcknowledgement('');
                        setResult(undefined);
                      }}
                    />
                    <details className={css.help}>
                      <summary>Advanced request fields</summary>
                      <p>
                        Use JSON for nested settings or additional fields documented by Console. These values are shared
                        with the form above.
                      </p>
                      <label className={css.field}>
                        Query parameters <span>JSON object · IDs may be decimal strings</span>
                        <textarea
                          spellCheck={false}
                          value={query}
                          disabled={busy}
                          onChange={(event) => {
                            setQuery(event.target.value);
                            setFieldRevision((value) => value + 1);
                            setValidFields(true);
                            setResult(undefined);
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
                              setFieldRevision((value) => value + 1);
                              setValidFields(true);
                              setResult(undefined);
                              setAcknowledgement('');
                            }}
                            rows={6}
                          />
                        </label>
                      )}
                    </details>
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
                        disabled={busy || !validFields || (mutation && acknowledgement !== confirmation)}
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
                <AdminResults
                  key={operation?.id + '-' + status}
                  value={result}
                  operation={operation!}
                  operations={operations}
                  path={path}
                  busy={busy}
                  onSelect={select}
                />
                {operation &&
                  operationFields(operation).some((field) => field.name === 'page' && field.location === 'query') && (
                    <nav className={css.actions} aria-label="Provider result pages">
                      <button
                        disabled={busy || Number(objectInput(query).page ?? 0) <= 0}
                        onClick={() =>
                          void run({ ...objectInput(query), page: Number(objectInput(query).page ?? 0) - 1 })
                        }
                      >
                        Previous page
                      </button>
                      <span>Page {Number(objectInput(query).page ?? 0) + 1}</span>
                      <button
                        disabled={
                          busy ||
                          !resultHasNext(
                            result,
                            Number(objectInput(query).page ?? 0),
                            Number(objectInput(query).pageSize ?? 20),
                          )
                        }
                        onClick={() =>
                          void run({ ...objectInput(query), page: Number(objectInput(query).page ?? 0) + 1 })
                        }
                      >
                        Next page
                      </button>
                    </nav>
                  )}
              </div>
            )}
          </section>
        </div>
      ) : null}
      {!loading && !operations.length && error && (
        <p className={css.error} role="alert">
          {error}
        </p>
      )}
    </DashboardShell>
  );
}
