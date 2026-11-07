'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import PlayersScreen from '../screens/PlayersScreen';
import VehiclesScreen from '../screens/VehiclesScreen';
import BasesScreen from '../screens/BasesScreen';
import MapsScreen from '../screens/MapsScreen';
import BackupsScreen from '../screens/BackupsScreen';
import MarketScreen from '../screens/MarketScreen';
import ServerScreen from '../screens/ServerScreen';
import LogsScreen from '../screens/LogsScreen';
import CareScreen from '../screens/CareScreen';
import UpdatesScreen from '../screens/UpdatesScreen';
import AddonsScreen from '../screens/AddonsScreen';
import GuildToolsScreen from '../screens/GuildToolsScreen';
import DiscordScreen from '../screens/DiscordScreen';
import DirectoryScreen from '../screens/DirectoryScreen';
import LiveMapScreen from '../screens/LiveMapScreen';
import StatisticsScreen from '../screens/StatisticsScreen';
import AdminToolsScreen from '../screens/AdminToolsScreen';
import { isDedicatedKind, adminHref, findAdminTab, tabForOperation } from '../../../../../features/admin/navigation';
import type { AdminOperation } from '../../../../../features/admin/types';
import OperationGuide from './OperationGuide';
import OperationFields from './OperationFields';
import AdminResults from './AdminResults';
import GuildOversight from './GuildOversight';
import { defaultQuery, operationFields, resultHasNext } from '../../../../../features/admin/operation-fields';
import { ui } from '../ui';

function objectInput(text: string): Record<string, unknown> {
  const value: unknown = JSON.parse(text || '{}');
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Enter a JSON object, for example {"page":0,"pageSize":20}.');
  return value as Record<string, unknown>;
}

export type AdminCatalog = {
  operations: AdminOperation[];
  configured: boolean;
  adapterConfigured: boolean;
  consoleOrigin: string | null;
};

/** Interactive screens and the generic catalog forms. The server page supplies the catalog and gates access. */
export default function AdminWorkspace({ catalog }: { catalog: AdminCatalog }) {
  const { operations, configured, adapterConfigured, consoleOrigin } = catalog;
  const router = useRouter();
  const params = useSearchParams();
  const { tab } = findAdminTab(params.get('tab'));
  const dedicated = isDedicatedKind(tab.kind);
  const advanced = params.get('advanced') === '1';
  const view = dedicated && advanced ? 'operations' : tab.kind;
  const [accessFilter, setAccessFilter] = useState('all');
  const [validFields, setValidFields] = useState(true);
  const [fieldRevision, setFieldRevision] = useState(0);
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

  useEffect(() => () => request.current?.abort(), []);

  const tabOperations = operations.filter((entry) => tab.groups.includes(entry.group));
  const groups = ['All operations', ...tab.groups];
  const filtered = tabOperations.filter(
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
    const owner = tabForOperation(next);
    const href = adminHref(owner?.tab.id ?? tab.id, next.id);
    apply(next, context);
    void router.push(href, { scroll: false });
  }

  function apply(next: AdminOperation, context: Record<string, string> = {}) {
    setOperation(next);
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

  const urlOperation = params.get('operation') ?? '';
  useEffect(() => {
    // Browser back/forward and shared links drive the selected tool; the URL is the source of truth.
    if (!operations.length || !(dedicated || ['operations', 'console'].includes(tab.kind))) return;
    const inTab = (entry: AdminOperation) => tab.groups.includes(entry.group);
    const wanted = operations.find((entry) => entry.id === urlOperation && inTab(entry));
    if (wanted) {
      if (wanted.id !== operation?.id) apply(wanted);
    } else if (!operation || !inTab(operation)) {
      const first = operations.find((entry) => inTab(entry) && !entry.restriction) ?? operations.find(inTab);
      if (first) apply(first);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlOperation, tab.id, operations]);
  useEffect(() => {
    setGroup('All operations');
    setSearch('');
  }, [tab.id]);

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
      form.action = '/api/v2/admin/execute';
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
      const response = await fetch(upload ? '/api/v2/admin/upload' : '/api/v2/admin/execute', {
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
    <div className={ui.scope}>
      {view === 'guilds' && <GuildOversight operations={operations} onSelect={select} />}
      {view === 'players' && <PlayersScreen operations={operations} />}
      {view === 'vehicles' && <VehiclesScreen operations={operations} />}
      {view === 'bases' && <BasesScreen operations={operations} />}
      {view === 'maps' && <MapsScreen operations={operations} />}
      {view === 'backups' && <BackupsScreen operations={operations} />}
      {view === 'market' && <MarketScreen operations={operations} />}
      {view === 'server' && <ServerScreen operations={operations} />}
      {view === 'logs' && <LogsScreen operations={operations} />}
      {view === 'care' && <CareScreen operations={operations} />}
      {view === 'updates' && <UpdatesScreen operations={operations} consoleOrigin={consoleOrigin} />}
      {view === 'guildtools' && <GuildToolsScreen operations={operations} />}
      {view === 'discord' && (
        <DiscordScreen operations={operations} adapterConfigured={adapterConfigured} consoleOrigin={consoleOrigin} />
      )}
      {view === 'statistics' && <StatisticsScreen operations={operations} adapterConfigured={adapterConfigured} />}
      {view === 'livemap' && <LiveMapScreen operations={operations} />}
      {view === 'directory' && <DirectoryScreen operations={operations} consoleOrigin={consoleOrigin} />}
      {view === 'addons' && <AddonsScreen operations={operations} consoleOrigin={consoleOrigin} />}
      {view === 'admintools' && <AdminToolsScreen operations={operations} />}
      {dedicated && (
        <p className={ui.advancedLink}>
          <Link
            href={{ pathname: '/admin', query: advanced ? { tab: tab.id } : { tab: tab.id, advanced: '1' } }}
            scroll={false}
          >
            {advanced
              ? `← Back to the ${tab.label.toLowerCase()} manager`
              : 'Advanced tools: every API operation for this area'}
          </Link>
        </p>
      )}
      {view === 'operations' || view === 'console' ? (
        <div className={groups.length > 2 ? ui.workspace : ui.workspaceNarrow}>
          {groups.length > 2 && (
            <aside className={ui.sidebar} aria-label="API categories">
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
                      ? tabOperations.length
                      : operations.filter((entry) => entry.group === name).length}
                  </span>
                </button>
              ))}
            </aside>
          )}
          <section className={ui.operations} aria-label="Console operations">
            <label className={ui.search}>
              Find an operation
              <input
                type="search"
                placeholder="Search players, backups, maps…"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </label>
            <label className={ui.search}>
              Availability
              <select value={accessFilter} onChange={(event) => setAccessFilter(event.target.value)}>
                <option value="all">All tools</option>
                <option value="supported">Supported tools</option>
                <option value="restricted">Requires Console</option>
              </select>
            </label>
            <p className={ui.count}>{filtered.length} operations</p>
            <div className={ui.operationList}>
              {filtered.map((entry) => (
                <button
                  key={entry.id}
                  disabled={busy}
                  aria-pressed={entry.id === operation?.id}
                  onClick={() => select(entry)}
                >
                  <span className={ui.method}>{entry.method}</span>
                  <span>
                    {entry.title}
                    <small>{entry.restriction ? 'Restricted' : entry.mode === 'json' ? entry.route : entry.mode}</small>
                  </span>
                </button>
              ))}
            </div>
          </section>
          <section className={ui.detail} aria-label="Selected operation">
            {operation && (
              <>
                <div className={ui.operationHeader}>
                  <span className={ui.method}>{operation.method}</span>
                  <span>{operation.group}</span>
                </div>
                <h2>{operation.title}</h2>
                <code className={ui.route}>{operation.route}</code>
                <OperationGuide operation={operation} />
                {operation.id === 'post-guilds-guildid-members-playerid-promote' && (
                  <p className={ui.notice}>
                    Promoting an Officer transfers leadership and demotes the current leader. Check the current rank
                    before confirming.
                  </p>
                )}
                {blocked ? (
                  <div className={ui.notice} role="status">
                    <p>{blocked}</p>
                    {operation.restriction && consoleOrigin && (
                      <a href={consoleOrigin} target="_blank" rel="noreferrer">
                        Open Console ↗
                      </a>
                    )}
                  </div>
                ) : (
                  <>
                    <details className={ui.help}>
                      <summary>Parameters and requirements</summary>
                      <p>{operation.parameters || 'No parameters required.'}</p>
                      {operation.confirmationPhrases.map((phrase) => (
                        <p key={phrase}>
                          Console confirmation phrase: <code>{phrase}</code>
                        </p>
                      ))}
                    </details>
                    {operation.pathParameters.map((name) => (
                      <label className={ui.field} key={name}>
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
                    <details className={ui.help}>
                      <summary>Advanced request fields</summary>
                      <p>
                        Use JSON for nested settings or additional fields documented by Console. These values are shared
                        with the form above.
                      </p>
                      <label className={ui.field}>
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
                        <label className={ui.field}>
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
                      <label className={ui.field} key={name}>
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
                      <div className={ui.confirmation}>
                        <strong>This operation changes server state.</strong>
                        <p>Review the target and request fields. To proceed, type:</p>
                        <code>{confirmation}</code>
                        <label className={ui.field}>
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
                    <div className={ui.actions}>
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
              <p className={ui.error} role="alert">
                {error}
              </p>
            )}
            {status && (
              <p className={ui.status} role="status">
                {status}
              </p>
            )}
            {truncated && (
              <p className={ui.notice}>
                This preview was truncated. Narrow the query or use pagination to inspect more data.
              </p>
            )}
            {result !== undefined && (
              <div className={ui.result}>
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
                    <nav className={ui.actions} aria-label="Provider result pages">
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
      {!operations.length && error && (
        <p className={ui.error} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
