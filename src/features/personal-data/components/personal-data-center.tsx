'use client';
import { Button } from '../../../components/ui/button';
import { Card } from '../../../components/ui/card';

import { buttonClass, cardClass } from '../../../components/ui/control-styles';
import { useEffect, useEffectEvent, useRef, useState } from 'react';
import { downloadBlob } from '../../../lib/ui/download';
import {
  dataExportSchema,
  dataScopeLabels,
  dataScopes,
  dataSummarySchema,
  erasureResultSchema,
  type DataScope,
  type DataSummary,
  type ScopeSummary,
} from '../model';
import styles from './personal-data.module.css';

async function boundedJson(response: Response): Promise<unknown> {
  if (!response.body) throw new Error('No response');
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const next = await reader.read();
    if (next.done) break;
    size += next.value.byteLength;
    if (size > 524288) {
      await reader.cancel();
      throw new Error('Response too large');
    }
    chunks.push(next.value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return JSON.parse(new TextDecoder().decode(bytes));
}
export function PersonalDataCenter() {
  const [summary, setSummary] = useState<DataSummary | null>(null);
  const [selected, setSelected] = useState<DataScope[]>([...dataScopes]);
  const [review, setReview] = useState<ScopeSummary | null>(null);
  const [phrase, setPhrase] = useState('');
  const [busy, setBusy] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const request = useRef<AbortController | null>(null);
  const heading = useRef<HTMLHeadingElement | null>(null);
  const reviewButton = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    if (review) heading.current?.focus();
    else reviewButton.current?.focus();
  }, [review]);
  async function run(action: 'summary' | 'export' | 'delete') {
    if (request.current) return;
    const controller = new AbortController();
    request.current = controller;
    setBusy(true);
    setError('');
    setMessage('');
    const timer = setTimeout(() => controller.abort('timeout'), 15000);
    let failureMessage = 'Personal data status could not be confirmed. Reload the summary before another action.';
    try {
      const input =
        action === 'export'
          ? {
              selection: summary!.scopes
                .filter((s) => selected.includes(s.scope))
                .map(({ scope, revision }) => ({ scope, revision })),
            }
          : action === 'delete'
            ? { scope: review!.scope, revision: review!.revision, confirmation: phrase }
            : undefined;
      const response = await fetch(action === 'summary' ? '/api/v2/personal-data' : `/api/v2/personal-data/${action}`, {
        method: action === 'summary' ? 'GET' : 'POST',
        cache: 'no-store',
        signal: controller.signal,
        headers: input ? { 'Content-Type': 'application/json' } : undefined,
        body: input ? JSON.stringify(input) : undefined,
      });
      if (!response.ok) {
        failureMessage =
          response.status === 401
            ? 'Your session ended. Sign in again.'
            : response.status === 409
              ? 'Data changed in another tab. Reload and review the latest summary before trying again.'
              : failureMessage;
        throw new Error('Request failed');
      }
      const raw = await boundedJson(response);
      if (controller.signal.aborted) return;
      if (action === 'summary') {
        setSummary(dataSummarySchema.parse(raw));
        setReview(null);
        setPhrase('');
        setMessage('Current saved data summary loaded.');
      } else if (action === 'export') {
        const exported = dataExportSchema.parse(raw);
        const blob = new Blob([JSON.stringify(exported)], { type: 'application/json' });
        downloadBlob(blob, 'arrakis-personal-data.json');
        setMessage(
          'Export file prepared. Your browser controls where it is saved. Keep this private JSON file secure.',
        );
      } else {
        const result = erasureResultSchema.parse(raw);
        setSummary((previous) =>
          previous
            ? {
                checkedAt: result.checkedAt,
                scopes: previous.scopes.map((s) => (s.scope === result.erased.scope ? result.erased : s)),
              }
            : null,
        );
        setReview(null);
        setPhrase('');
        setMessage(
          `${dataScopeLabels[result.erased.scope]} content erased. Other scopes are unchanged. Existing downloaded or received copies cannot be retracted.`,
        );
      }
      setBlocked(false);
    } catch {
      if (!controller.signal.aborted || controller.signal.reason === 'timeout') {
        setError(
          controller.signal.reason === 'timeout'
            ? 'Request timed out. It may have completed. Reload the summary before another action.'
            : failureMessage,
        );
        setBlocked(true);
      }
    } finally {
      clearTimeout(timer);
      if (request.current === controller) request.current = null;
      if (!controller.signal.aborted || controller.signal.reason === 'timeout') setBusy(false);
    }
  }
  const loadInitialSummary = useEffectEvent(() => void run('summary'));
  useEffect(() => {
    loadInitialSummary();
    const hide = () => {
      if (document.hidden) {
        request.current?.abort();
        request.current = null;
        setSummary(null);
        setReview(null);
        setPhrase('');
        setBusy(false);
        setBlocked(true);
        setMessage('View paused. Reload the summary to continue.');
      }
    };
    document.addEventListener('visibilitychange', hide);
    return () => {
      request.current?.abort();
      document.removeEventListener('visibilitychange', hide);
    };
  }, []);
  return (
    <section className={styles.root} aria-label="Personal data center">
      <p>
        Export or erase dashboard-owned notes, plans, sharing snapshots and saved activity views for your signed-in
        account. No linked game character or guild is required.
      </p>
      <div className={styles.actions}>
        <Button className={buttonClass()} disabled={busy} onClick={() => void run('summary')}>
          Reload data summary
        </Button>
        <Button
          className={buttonClass({ variant: 'primary' })}
          disabled={busy || blocked || !summary || !selected.length || Boolean(review)}
          onClick={() => void run('export')}
        >
          Export selected data
        </Button>
      </div>
      <p className={styles.note}>
        Exports contain private text and may include chosen locations or contact details. Save the JSON securely.
        Downloaded files and copies already received by other members stay outside these controls.
      </p>
      <p role="status">{busy ? 'Reading or processing your personal data…' : message}</p>
      {error && (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      )}
      {!summary && !busy && <p>Saved data status is unknown until the summary loads.</p>}
      {summary && (
        <>
          <p className={styles.note}>
            Summary checked {summary.checkedAt}. Scopes are read independently, not as one synchronized account
            snapshot.
          </p>
          <div className={styles.grid}>
            {summary.scopes.map((scope) => (
              <Card
                key={scope.scope}
                className={cardClass({ className: styles.card })}
                aria-label={dataScopeLabels[scope.scope]}
              >
                <h2>{dataScopeLabels[scope.scope]}</h2>
                <p>
                  {scope.scope === 'tasks'
                    ? `${scope.entries} saved tasks, projects and goals. Includes notes, completed entries, dates and private planning references.`
                    : scope.scope === 'sharing'
                      ? `${scope.entries} customized private drafts and ${scope.snapshots} retained publication snapshots, including expired snapshots.`
                      : `${scope.entries} saved activity setups, including filters, widgets and planning references.`}
                </p>
                <label className={styles.check}>
                  <input
                    type="checkbox"
                    checked={selected.includes(scope.scope)}
                    disabled={busy || Boolean(review)}
                    onChange={(e) =>
                      setSelected((previous) =>
                        e.target.checked ? [...previous, scope.scope] : previous.filter((s) => s !== scope.scope),
                      )
                    }
                  />
                  Include {dataScopeLabels[scope.scope].toLowerCase()} in export
                </label>
                <Button
                  className={buttonClass()}
                  disabled={busy || blocked || Boolean(review)}
                  onClick={(event) => {
                    reviewButton.current = event.currentTarget;
                    setReview(scope);
                    setPhrase('');
                  }}
                >
                  Review deletion of {dataScopeLabels[scope.scope].toLowerCase()}
                </Button>
              </Card>
            ))}
          </div>
        </>
      )}
      {review && (
        <section className={cardClass({ className: styles.review })} aria-label="Review personal data deletion">
          <h2 ref={heading} tabIndex={-1}>
            Erase {dataScopeLabels[review.scope].toLowerCase()}?
          </h2>
          <p>
            {review.scope === 'tasks'
              ? 'This permanently removes all tasks, projects, goals, notes and references in this list, including completed entries.'
              : review.scope === 'sharing'
                ? 'This permanently clears all four private sharing drafts and retained publication snapshots. Old member links stop working atomically.'
                : 'This permanently removes all saved activity view definitions. Your task notes, normal portal layout and notification preferences are unchanged.'}
          </p>
          <p>
            A minimal empty record with a new revision remains for up to 90 days of inactivity to reject stale saves.
            There is no undo. Data saved after this review causes a conflict rather than being silently erased.
          </p>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (phrase === 'DELETE MY DATA' && !blocked && !busy) void run('delete');
            }}
          >
            <label>
              Type DELETE MY DATA to confirm
              <input
                value={phrase}
                onChange={(e) => setPhrase(e.target.value)}
                disabled={busy}
                autoComplete="off"
                spellCheck={false}
                maxLength={30}
              />
            </label>
            <div className={styles.actions}>
              <Button
                type="submit"
                className={buttonClass({ variant: 'primary' })}
                disabled={busy || blocked || phrase !== 'DELETE MY DATA'}
              >
                Permanently erase this scope
              </Button>
              <Button
                type="button"
                className={buttonClass()}
                disabled={busy}
                onClick={() => {
                  setReview(null);
                  setPhrase('');
                }}
              >
                Keep my data
              </Button>
            </div>
          </form>
        </section>
      )}
      <Card as="section" className={cardClass({ className: styles.card })} aria-label="Data retention boundaries">
        <h2>What these controls cover</h2>
        <p>
          Notes and plans are your private task-list records. Sharing snapshots are the dashboard cards you chose to
          publish, not historical game inventory or location telemetry. Those game readings and freshness history are
          not retained as a personal archive. Saved activity views contain configuration and planning references, not
          copies of game readings or task notes.
        </p>
        <p>
          Portal layouts, notification controls and pinned-item selections keep their own settings controls. Account
          credentials, sessions, security audit records, game characters, guild records, chat messages, marketplace
          publications and financial/game ledgers are outside this deletion. Manage shared publications in their
          original workspace.
        </p>
        <p>
          Each deletion is atomic within one scope; scopes are erased separately. Reads refresh the existing 90-day
          inactivity retention. Previously opened tabs or downloaded exports can contain copies, but old revisions
          cannot restore erased content through a stale save during the revision fence&apos;s lifetime.
        </p>
      </Card>
    </section>
  );
}
