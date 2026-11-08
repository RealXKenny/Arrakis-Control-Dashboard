import { useState } from 'react';
import { findOperation } from '../../client';
import ConsoleHandoff from '../console-handoff';
import { Facts, QueryState, Table } from '../data-panel';
import useAdminQuery from '../../hooks/use-admin-query';
import useAdminUrl from '../../hooks/use-admin-url';
import { text, type Row } from '../../records';
import type { AdminOperation } from '../../types';
import { ui } from '../ui';

const ADDON_HANDOFF = [
  'post-addons-community-install',
  'post-addons-community-update',
  'post-addons-installed-id-enable',
  'post-addons-installed-id-disable',
  'delete-addons-installed-id',
  'post-addons-installed-id-bridge',
];
const VIEWS = [
  ['installed', 'Installed'],
  ['community', 'Community catalog'],
] as const;

function Content({ operations, id }: { operations: AdminOperation[]; id: string }) {
  const [path, setPath] = useState('');
  const [open, setOpen] = useState('');
  const content = useAdminQuery(
    findOperation(operations, 'get-addons-installed-id-content-path'),
    { path: { id, path: open } },
    Boolean(open),
  );
  const safe = path.trim().replace(/^\/+/, '');
  const valid = Boolean(safe) && !safe.split('/').some((part) => part === '..' || part === '');
  return (
    <section className={ui.panel} aria-label="Addon content">
      <h3>Inspect a file in {id}</h3>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (valid) setOpen(safe);
        }}
      >
        <label className={ui.field}>
          File path inside the addon
          <input value={path} placeholder="README.md" onChange={(event) => setPath(event.target.value)} />
        </label>
        <button type="submit" disabled={!valid}>
          Read file
        </button>
        {path && !valid && <p className={ui.stateLine}>Use a relative path without “..” or empty segments.</p>}
      </form>
      {open && (
        <QueryState loading={content.loading} error={content.error} onRetry={content.refresh}>
          {typeof content.data === 'string' ? (
            <pre className={ui.logView}>{content.data}</pre>
          ) : (
            <Facts value={content.data} />
          )}
        </QueryState>
      )}
    </section>
  );
}

export default function AddonsScreen({
  operations,
  consoleOrigin,
}: {
  operations: AdminOperation[];
  consoleOrigin: string | null;
}) {
  const url = useAdminUrl();
  const view = VIEWS.find(([id]) => id === url.read('view'))?.[0] ?? 'installed';
  const addon = url.read('addon');
  const installed = useAdminQuery(findOperation(operations, 'get-addons-installed'), {}, view === 'installed');
  const community = useAdminQuery(findOperation(operations, 'get-addons-community'), {}, view === 'community');
  return (
    <div className={ui.screen}>
      <div className={ui.subTabs} role="group" aria-label="Addon views">
        {VIEWS.map(([id, label]) => (
          <button
            key={id}
            type="button"
            aria-pressed={id === view}
            onClick={() => url.update({ view: id === 'installed' ? null : id, addon: null })}
          >
            {label}
          </button>
        ))}
      </div>
      {view === 'installed' && (
        <section className={ui.panel} aria-label="Installed addons">
          <h3>Installed addons</h3>
          <QueryState loading={installed.loading} error={installed.error} onRetry={installed.refresh}>
            <Table
              value={installed.data}
              caption="Installed addons"
              empty="No addons are installed."
              action={(row: Row) => {
                const id = text(row, ['id', 'addon_id', 'name']);
                return id ? (
                  <button aria-label={`Inspect ${id}`} type="button" onClick={() => url.update({ addon: id })}>
                    Inspect
                  </button>
                ) : null;
              }}
            />
          </QueryState>
        </section>
      )}
      {view === 'installed' && addon && <Content key={addon} operations={operations} id={addon} />}
      {view === 'community' && (
        <section className={ui.panel} aria-label="Community addons">
          <h3>Community catalog</h3>
          <QueryState loading={community.loading} error={community.error} onRetry={community.refresh}>
            <Table value={community.data} caption="Community addons" empty="The catalog is empty." />
          </QueryState>
        </section>
      )}
      <ConsoleHandoff
        operations={operations}
        ids={ADDON_HANDOFF}
        consoleOrigin={consoleOrigin}
        heading="Installing, updating and removing addons"
      />
    </div>
  );
}
