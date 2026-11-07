import { useState } from 'react';
import { adminCall, findOperation } from '../client';
import ConsoleHandoff from '../components/ConsoleHandoff';
import { Facts, ReadPanel } from '../components/DataPanel';
import type { AdminOperation } from '../types';
import css from '../styles/admin.module.css';

const HANDOFF = [
  'post-updates-apply-game',
  'post-updates-apply-stack',
  'post-updates-fix-steamcmd',
  'post-updates-install-assets',
  'post-updates-repair-runtime',
  'post-console-reload',
  'post-updates-auto-game',
];

type Check = { at: string; data?: unknown; error?: string };

function Checker({
  operations,
  id,
  title,
  fresh,
}: {
  operations: AdminOperation[];
  id: string;
  title: string;
  fresh?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [forceFresh, setForceFresh] = useState(false);
  const [result, setResult] = useState<Check | null>(null);
  async function run() {
    const operation = findOperation(operations, id);
    if (!operation || busy) return;
    setBusy(true);
    try {
      const outcome = await adminCall(operation, { body: fresh && forceFresh ? { fresh: true } : {} });
      setResult({ at: new Date().toLocaleTimeString(), data: outcome.data });
    } catch (error) {
      setResult({ at: new Date().toLocaleTimeString(), error: (error as Error).message });
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className={css.panel} aria-label={title}>
      <h3>{title}</h3>
      <p className={css.stateLine}>A check only looks for updates. It does not download or install anything.</p>
      {fresh && (
        <label className={css.field}>
          <span>
            <input type="checkbox" checked={forceFresh} onChange={(event) => setForceFresh(event.target.checked)} />{' '}
            Ignore cached results and ask the update source again
          </span>
        </label>
      )}
      <div className={css.actions}>
        <button type="button" onClick={() => void run()} disabled={busy}>
          {busy ? 'Checking…' : 'Check now'}
        </button>
      </div>
      {result?.error && (
        <p role="alert" className={css.error}>
          {result.error}
        </p>
      )}
      {result?.data !== undefined && (
        <>
          <p role="status" className={css.status}>
            Checked at {result.at}.
          </p>
          <Facts value={result.data} />
        </>
      )}
    </section>
  );
}

export default function UpdatesScreen({
  operations,
  consoleOrigin,
}: {
  operations: AdminOperation[];
  consoleOrigin: string | null;
}) {
  return (
    <div className={css.screen}>
      <Checker operations={operations} id="post-updates-check-game" title="Game update check" fresh />
      <Checker operations={operations} id="post-updates-check-stack" title="Stack update check" />
      <ReadPanel operations={operations} id="get-updates-auto-game" title="Automatic game updates (current settings)" />
      <ConsoleHandoff
        operations={operations}
        ids={HANDOFF}
        consoleOrigin={consoleOrigin}
        heading="Applying updates and repairs"
      />
    </div>
  );
}
