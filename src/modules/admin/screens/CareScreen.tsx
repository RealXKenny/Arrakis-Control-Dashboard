import { useState } from 'react';
import Link from 'next/link';
import { QueryState, ReadPanel, Table } from '../components/DataPanel';
import useAdminQuery from '../hooks/useAdminQuery';
import useAdminUrl from '../hooks/useAdminUrl';
import { useConfirmedAction } from '../hooks/useConfirmedAction';
import { findOperation } from '../client';
import { adminHref } from '../navigation';
import type { AdminOperation } from '../types';
import css from '../styles/admin.module.css';

const VIEWS = [
  ['overview', 'Overview'],
  ['eligible', 'Eligible players'],
  ['grants', 'Grants & history'],
] as const;

function Overview({ operations }: { operations: AdminOperation[] }) {
  const [notice, setNotice] = useState('');
  const { act, dialog } = useConfirmedAction(operations, setNotice);
  return (
    <>
      {notice && (
        <p role="status" className={css.status}>
          {notice}
        </p>
      )}
      <ReadPanel operations={operations} id="get-care-package-capabilities" title="What the Console supports" />
      <ReadPanel operations={operations} id="get-care-package-config" title="Current configuration" />
      <section className={css.panel} aria-label="Care package controls">
        <h3>Controls</h3>
        <p className={css.stateLine}>
          Enabling lets the Console grant care packages to eligible players on its own. A scan checks eligibility now;
          it is separate from granting.
        </p>
        <div className={css.actions}>
          <button
            type="button"
            onClick={() =>
              act(
                'post-care-package-enable',
                { body: { confirmation: 'ENABLE CARE PACKAGE' } },
                {
                  title: 'Enable care packages',
                  confirmLabel: 'Enable',
                  phrase: 'ENABLE CARE PACKAGE',
                  danger: false,
                  target: 'Care package system',
                  consequences: ['Eligible players can receive care packages according to the saved configuration.'],
                  done: 'Care packages enabled.',
                },
              )
            }
          >
            Enable…
          </button>
          <button
            type="button"
            onClick={() =>
              act(
                'post-care-package-disable',
                { body: { confirmation: 'DISABLE CARE PACKAGE' } },
                {
                  title: 'Disable care packages',
                  confirmLabel: 'Disable',
                  phrase: 'DISABLE CARE PACKAGE',
                  target: 'Care package system',
                  consequences: ['No new care packages are granted automatically.', 'Existing grants are not removed.'],
                  done: 'Care packages disabled.',
                },
              )
            }
          >
            Disable…
          </button>
          <button
            type="button"
            onClick={() =>
              act(
                'post-care-package-run',
                { body: { confirmation: 'RUN CARE PACKAGE SCAN' } },
                {
                  title: 'Run a scan now',
                  confirmLabel: 'Run scan',
                  phrase: 'RUN CARE PACKAGE SCAN',
                  danger: false,
                  target: 'Care package eligibility scan',
                  consequences: [
                    'Checks which players are eligible right now.',
                    'The Console may grant packages as part of a scan; review Eligible players first.',
                  ],
                  done: 'Scan requested.',
                },
              )
            }
          >
            Run scan…
          </button>
        </div>
        <p className={css.stateLine}>
          Saving the configuration, granting to every eligible player or one player, and retrying a failed grant each
          need a Console confirmation whose wording is not documented, so they open in the full forms:{' '}
          <Link href={adminHref('care', 'post-care-package-config')} shallow>
            save configuration
          </Link>
          {' · '}
          <Link href={adminHref('care', 'post-care-package-grant-eligible')} shallow>
            grant to all eligible
          </Link>
          {' · '}
          <Link href={adminHref('care', 'post-care-package-grant-playerid')} shallow>
            grant to one player
          </Link>
          {' · '}
          <Link href={adminHref('care', 'post-care-package-retry-grantid')} shallow>
            retry a failed grant
          </Link>
          .
        </p>
      </section>
      {dialog}
    </>
  );
}

function Eligible({ operations }: { operations: AdminOperation[] }) {
  const url = useAdminUrl();
  const only = url.read('only') === '1';
  const list = useAdminQuery(findOperation(operations, 'get-care-package-eligible'), {
    query: only ? { onlyEligible: true } : {},
  });
  return (
    <section className={css.panel} aria-label="Eligible players">
      <h3>Eligible players</h3>
      <div className={css.toolbar}>
        <label className={css.field}>
          <span>
            <input
              type="checkbox"
              checked={only}
              onChange={(event) => url.update({ only: event.target.checked ? '1' : null })}
            />{' '}
            Only players who are eligible now
          </span>
        </label>
        <button type="button" onClick={list.refresh} disabled={list.loading}>
          Refresh
        </button>
      </div>
      <QueryState loading={list.loading} error={list.error} onRetry={list.refresh}>
        <Table value={list.data} caption="Care package eligibility" empty="No players to show." />
      </QueryState>
    </section>
  );
}

function Grants({ operations }: { operations: AdminOperation[] }) {
  const [notice, setNotice] = useState('');
  const { act, dialog } = useConfirmedAction(operations, setNotice);
  return (
    <>
      {notice && (
        <p role="status" className={css.status}>
          {notice}
        </p>
      )}
      <ReadPanel
        operations={operations}
        id="get-care-package-grants"
        title="Recent grants"
        kind="table"
        empty="No grants yet."
        query={{ limit: 50 }}
      />
      <ReadPanel
        operations={operations}
        id="get-care-package-history"
        title="Grant history"
        kind="table"
        empty="The history is empty."
        query={{ limit: 50 }}
      />
      <div className={css.actions}>
        <button
          type="button"
          className={css.danger}
          onClick={() =>
            act(
              'post-care-package-history-clear',
              { body: { confirmation: 'CLEAR GRANT HISTORY' } },
              {
                title: 'Clear the grant history',
                confirmLabel: 'Clear history',
                phrase: 'CLEAR GRANT HISTORY',
                target: 'Care package grant history',
                consequences: [
                  'Deletes the recorded grant history.',
                  'Items already granted to players are not taken back.',
                ],
                done: 'History cleared.',
              },
            )
          }
        >
          Clear history…
        </button>
      </div>
      {dialog}
    </>
  );
}

export default function CareScreen({ operations }: { operations: AdminOperation[] }) {
  const url = useAdminUrl();
  const view = VIEWS.find(([id]) => id === url.read('view'))?.[0] ?? 'overview';
  return (
    <div className={css.screen}>
      <div className={css.subTabs} role="group" aria-label="Care package views">
        {VIEWS.map(([id, label]) => (
          <button
            key={id}
            type="button"
            aria-pressed={id === view}
            onClick={() => url.update({ view: id === 'overview' ? null : id, only: null })}
          >
            {label}
          </button>
        ))}
      </div>
      {view === 'overview' && <Overview operations={operations} />}
      {view === 'eligible' && <Eligible operations={operations} />}
      {view === 'grants' && <Grants operations={operations} />}
    </div>
  );
}
