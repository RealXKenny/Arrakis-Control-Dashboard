import { useEffect, useRef, useState } from 'react';
import { downloadAdmin, findOperation } from '../../client';
import { QueryState } from '../data-panel';
import useAdminQuery from '../../hooks/use-admin-query';
import useAdminUrl from '../../hooks/use-admin-url';
import { text, type Row } from '../../records';
import type { AdminOperation } from '../../types';
import { ui } from '../ui';

const TAIL_BYTES = 64 * 1024;
type StreamState = 'idle' | 'connecting' | 'live' | 'ended' | 'error';

/** Service names arrive as strings or objects; anything else is ignored. */
export function serviceNames(value: unknown): string[] {
  const list = Array.isArray(value)
    ? value
    : value && typeof value === 'object'
      ? ((['services', 'rows', 'data'] as const).map((key) => (value as Row)[key]).find(Array.isArray) as
          unknown[] | undefined)
      : undefined;
  const names = (list ?? []).map((entry) =>
    typeof entry === 'string'
      ? entry
      : entry && typeof entry === 'object'
        ? text(entry as Row, ['service', 'name', 'id'])
        : '',
  );
  return [...new Set(names.filter(Boolean))];
}

/** Turn the Console's log payload into plain text lines without assuming one shape. */
export function logText(value: unknown): string {
  if (typeof value === 'string') return value;
  if (Array.isArray(value))
    return value.map((line) => (typeof line === 'string' ? line : JSON.stringify(line))).join('\n');
  if (value && typeof value === 'object') {
    const record = value as Row;
    for (const key of ['logs', 'lines', 'output', 'text', 'data']) {
      if (record[key] !== undefined && record[key] !== value) return logText(record[key]);
    }
  }
  return '';
}

export default function LogsScreen({ operations }: { operations: AdminOperation[] }) {
  const url = useAdminUrl();
  const services = useAdminQuery(findOperation(operations, 'get-logs-services'));
  const names = serviceNames(services.data);
  const service = names.includes(url.read('service')) ? url.read('service') : '';
  const logs = useAdminQuery(findOperation(operations, 'get-logs-service'), { path: { service } }, Boolean(service));
  const [state, setState] = useState<StreamState>('idle');
  const [live, setLive] = useState('');
  const [message, setMessage] = useState('');
  const controller = useRef<AbortController | null>(null);

  // Leaving the screen, or choosing another service, always closes the stream.
  useEffect(() => {
    return () => controller.current?.abort();
  }, [service]);

  async function start() {
    const operation = findOperation(operations, 'get-logs-service-stream');
    if (!operation || !service) return;
    controller.current?.abort();
    const abort = new AbortController();
    controller.current = abort;
    setState('connecting');
    setLive('');
    setMessage('');
    const timeout = setTimeout(() => abort.abort(), 65_000);
    try {
      const response = await fetch('/api/v2/admin/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ operation: operation.id, path: { service }, query: {}, body: {}, acknowledgement: '' }),
        signal: abort.signal,
      });
      if (!response.ok || !response.body || !response.headers.get('content-type')?.includes('text/event-stream')) {
        let reason = 'The Console did not open a live stream.';
        try {
          const failure = await response.json();
          if (typeof failure.error === 'string') reason = failure.error;
        } catch {
          // Keep the generic reason.
        }
        throw new Error(reason);
      }
      setState('live');
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      for (;;) {
        const part = await reader.read();
        if (part.done) break;
        buffer = (buffer + decoder.decode(part.value, { stream: true })).slice(-TAIL_BYTES);
        setLive(buffer);
      }
      setState('ended');
      setMessage('The stream ended. The dashboard limits a live view to about 60 seconds; reconnect to continue.');
    } catch (error) {
      if (abort.signal.aborted) {
        setState('ended');
        setMessage('Stopped.');
      } else {
        setState('error');
        setMessage((error as Error).message || 'The stream failed.');
      }
    } finally {
      clearTimeout(timeout);
    }
  }

  const bounded = logText(logs.data);
  return (
    <div className={ui.screen}>
      <section className={ui.panel} aria-label="Log service">
        <h3>Service logs</h3>
        <p className={ui.stateLine}>
          Output is sanitized by the dashboard before it is shown. Views are bounded; download the full log for anything
          longer. Administrator command history is not provided by the Console, so it is not shown here.
        </p>
        <QueryState loading={services.loading} error={services.error} onRetry={services.refresh}>
          <label className={ui.field}>
            Service
            <select value={service} onChange={(event) => url.update({ service: event.target.value || null })}>
              <option value="">Choose a service…</option>
              {names.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </label>
          {!names.length && <p className={ui.stateLine}>The Console reported no log services.</p>}
        </QueryState>
      </section>
      {service && (
        <>
          <section className={ui.panel} aria-label="Recent log output">
            <h3>Recent output</h3>
            <div className={ui.actions}>
              <button type="button" onClick={logs.refresh} disabled={logs.loading}>
                Refresh
              </button>
              <button
                type="button"
                onClick={() => {
                  const operation = findOperation(operations, 'get-logs-service-download');
                  if (operation) downloadAdmin(operation, { path: { service } });
                }}
              >
                Download full log
              </button>
            </div>
            <QueryState loading={logs.loading} error={logs.error} onRetry={logs.refresh}>
              {bounded ? (
                <pre className={ui.logView}>{bounded}</pre>
              ) : (
                <p className={ui.stateLine}>No output was returned.</p>
              )}
            </QueryState>
          </section>
          <section className={ui.panel} aria-label="Live stream">
            <h3>Live stream</h3>
            <p role="status" className={ui.status}>
              {state === 'idle' && 'Not connected.'}
              {state === 'connecting' && 'Connecting…'}
              {state === 'live' && 'Streaming live. Shows the latest 64 KiB.'}
              {(state === 'ended' || state === 'error') && message}
            </p>
            <div className={ui.actions}>
              <button type="button" onClick={() => void start()} disabled={state === 'connecting' || state === 'live'}>
                {state === 'ended' || state === 'error' ? 'Reconnect' : 'Start live stream'}
              </button>
              <button
                type="button"
                onClick={() => controller.current?.abort()}
                disabled={state !== 'live' && state !== 'connecting'}
              >
                Stop
              </button>
            </div>
            {live && (
              <pre className={ui.logView} aria-label="Live log output">
                {live}
              </pre>
            )}
          </section>
        </>
      )}
    </div>
  );
}
