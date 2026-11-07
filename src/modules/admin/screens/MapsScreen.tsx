import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { findOperation } from '../client';
import { Facts, QueryState, Table } from '../components/DataPanel';
import useAdminQuery from '../hooks/useAdminQuery';
import useAdminUrl from '../hooks/useAdminUrl';
import { useConfirmedAction } from '../hooks/useConfirmedAction';
import { adminHref } from '../navigation';
import type { AdminOperation } from '../types';
import css from '../styles/admin.module.css';

const VIEWS = [
  ['worlds', 'Maps & status'],
  ['memory', 'Memory & scaling'],
  ['settings', 'Settings'],
  ['features', 'World features'],
] as const;

function Read({
  operations,
  id,
  title,
  kind = 'facts',
  query,
  empty,
}: {
  operations: AdminOperation[];
  id: string;
  title: string;
  kind?: 'facts' | 'table';
  query?: Record<string, string | number | boolean>;
  empty?: string;
}) {
  const result = useAdminQuery(findOperation(operations, id), { query });
  return (
    <section className={css.panel} aria-label={title}>
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

const SHORTCUTS: [string, string][] = [
  ['post-maps-spawn', 'Start a map'],
  ['post-maps-despawn', 'Stop a map'],
  ['post-maps-respawn', 'Restart a map'],
  ['post-maps-mode', 'Change a map’s mode'],
  ['post-maps-reconcile', 'Reconcile maps'],
];

function Worlds({ operations }: { operations: AdminOperation[] }) {
  return (
    <>
      <Read
        operations={operations}
        id="get-maps"
        title="Maps and partitions"
        kind="table"
        query={{ raw: 0 }}
        empty="No maps were reported."
      />
      <Read operations={operations} id="get-map-status" title="Runtime status" query={{ raw: 0 }} />
      <section className={css.panel} aria-label="Map controls">
        <h3>Start, stop and restart</h3>
        <p className={css.stateLine}>
          Each map and partition action names its exact target and requires its Console confirmation phrase, so these
          open in the full tool form. The dashboard never starts a map or crosses partitions silently.
        </p>
        <ul>
          {SHORTCUTS.map(([id, label]) => (
            <li key={id}>
              <Link href={adminHref('maps', id)} shallow>
                {label}
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}

function Memory({ operations }: { operations: AdminOperation[] }) {
  const [notice, setNotice] = useState('');
  const { act, dialog } = useConfirmedAction(operations, setNotice);
  return (
    <>
      {notice && (
        <p role="status" className={css.status}>
          {notice}
        </p>
      )}
      <Read operations={operations} id="get-maps-memory-live" title="Live memory and swap" />
      <Read operations={operations} id="get-maps-memory" title="Memory limits per map" kind="table" />
      <section className={css.panel} aria-label="Memory balancer">
        <h3>Memory balancer</h3>
        <Read operations={operations} id="get-maps-memory-balancer" title="Balancer state" />
        <div className={css.actions}>
          {[true, false].map((enabled) => (
            <button
              key={String(enabled)}
              type="button"
              onClick={() =>
                act(
                  'post-maps-memory-balancer',
                  { body: { enabled } },
                  {
                    title: `Turn memory balancer ${enabled ? 'on' : 'off'}`,
                    confirmLabel: enabled ? 'Turn on' : 'Turn off',
                    danger: false,
                    target: 'Memory balancer for all maps',
                    consequences: [
                      enabled
                        ? 'Map memory limits are rebalanced automatically.'
                        : 'Map memory limits stay where they are until changed manually.',
                    ],
                    done: `Balancer ${enabled ? 'enabled' : 'disabled'}.`,
                  },
                )
              }
            >
              Turn {enabled ? 'on' : 'off'}…
            </button>
          ))}
        </div>
      </section>
      <Read operations={operations} id="get-maps-memory-swap" title="Swap" />
      <Read operations={operations} id="get-maps-autoscaler" title="Autoscaler" />
      <p className={css.stateLine}>
        Changing individual limits, swap or the autoscaler needs its confirmation phrase:{' '}
        <Link href={adminHref('maps', 'post-maps-autoscaler')} shallow>
          open the autoscaler tool
        </Link>
        .
      </p>
      {dialog}
    </>
  );
}

function Settings({ operations }: { operations: AdminOperation[] }) {
  const [notice, setNotice] = useState('');
  const [parallelism, setParallelism] = useState('');
  const runtime = useAdminQuery(findOperation(operations, 'get-maps-runtime-settings'));
  const { act, dialog } = useConfirmedAction(operations, (message) => {
    setNotice(message);
    runtime.refresh();
  });
  function submit(event: FormEvent) {
    event.preventDefault();
    const value = Number(parallelism);
    if (!Number.isSafeInteger(value) || value < 1) return setNotice('Enter a whole number of at least 1.');
    act(
      'post-maps-runtime-settings',
      { body: { alwaysOnStartupParallelism: value } },
      {
        title: 'Save startup parallelism',
        confirmLabel: 'Save',
        danger: false,
        target: 'Always-on map startup',
        consequences: [`Always-on maps start ${value} at a time.`, 'Applies the next time maps start.'],
        done: 'Runtime setting saved.',
      },
    );
  }
  return (
    <>
      {notice && (
        <p role="status" className={css.status}>
          {notice}
        </p>
      )}
      <section className={css.panel} aria-label="Runtime settings">
        <h3>Runtime settings</h3>
        <QueryState loading={runtime.loading} error={runtime.error} onRetry={runtime.refresh}>
          <Facts value={runtime.data} />
        </QueryState>
        <form onSubmit={submit}>
          <label className={css.field}>
            Always-on startup parallelism
            <input inputMode="numeric" value={parallelism} onChange={(event) => setParallelism(event.target.value)} />
          </label>
          <button type="submit">Review…</button>
        </form>
      </section>
      <Read
        operations={operations}
        id="get-maps-user-settings-restart-pending"
        title="Changes waiting for a restart"
        kind="table"
        empty="No map is waiting for a restart."
      />
      <Read
        operations={operations}
        id="get-maps-user-settings-deferred-pending"
        title="Deferred changes"
        kind="table"
        empty="No changes are deferred."
      />
      <Read operations={operations} id="get-maps-userengine" title="UserEngine" />
      <p className={css.stateLine}>
        Editing UserEngine or UserGame values is schema-driven in the full tool form so the affected map and partition
        are named before anything is saved:{' '}
        <Link href={adminHref('maps', 'post-maps-user-settings-save')} shallow>
          open the settings editor
        </Link>
        .
      </p>
      {dialog}
    </>
  );
}

function Features({ operations }: { operations: AdminOperation[] }) {
  return (
    <>
      <Read operations={operations} id="get-deepdesert" title="Deep Desert" />
      <Read
        operations={operations}
        id="get-sietches"
        title="Sietches"
        kind="table"
        empty="No sietches were reported."
      />
      <Read
        operations={operations}
        id="get-maps-spicefields"
        title="Spicefields"
        kind="table"
        empty="No spicefields were reported."
      />
      <Read
        operations={operations}
        id="get-maps-choam-terminals"
        title="CHOAM terminals"
        kind="table"
        empty="No CHOAM terminals were reported."
      />
      <p className={css.stateLine}>
        Installing, positioning and removing terminals, and updating spicefields, Sietches or the Deep Desert, use the
        full tool forms:{' '}
        <Link href={adminHref('maps', 'get-maps-choam-terminals-capture')} shallow>
          terminal capture
        </Link>
        .
      </p>
    </>
  );
}

export default function MapsScreen({ operations }: { operations: AdminOperation[] }) {
  const url = useAdminUrl();
  const view = VIEWS.find(([id]) => id === url.read('view'))?.[0] ?? 'worlds';
  return (
    <div className={css.screen}>
      <div className={css.subTabs} role="group" aria-label="Map views">
        {VIEWS.map(([id, label]) => (
          <button
            key={id}
            type="button"
            aria-pressed={id === view}
            onClick={() => url.update({ view: id === 'worlds' ? null : id })}
          >
            {label}
          </button>
        ))}
      </div>
      {view === 'worlds' && <Worlds operations={operations} />}
      {view === 'memory' && <Memory operations={operations} />}
      {view === 'settings' && <Settings operations={operations} />}
      {view === 'features' && <Features operations={operations} />}
    </div>
  );
}
