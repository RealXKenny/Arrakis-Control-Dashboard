import { useState, type FormEvent } from 'react';
import { downloadAdmin, findOperation } from '../client';
import { Facts, QueryState, Table } from '../components/DataPanel';
import { useConfirmedAction } from '../hooks/useConfirmedAction';
import useAdminQuery from '../hooks/useAdminQuery';
import useAdminUrl from '../hooks/useAdminUrl';
import { hasMore, idFrom, nameFrom, resultRows, text, type Row } from '../records';
import type { AdminOperation } from '../types';
import css from '../styles/admin.module.css';

const VIEWS = [
  ['bases', 'Bases'],
  ['storage', 'Storage containers'],
  ['queues', 'Pending queues'],
  ['automation', 'Automatic refills'],
] as const;
const SECTIONS = [
  ['overview', 'Contents'],
  ['maintenance', 'Generators & water'],
  ['access', 'Ownership & access'],
  ['manage', 'Export & removal'],
] as const;
const PAGE_SIZE = 20;

function Panel({
  operations,
  id,
  path,
  title,
  kind = 'facts',
  empty,
}: {
  operations: AdminOperation[];
  id: string;
  path: Record<string, string>;
  title: string;
  kind?: 'facts' | 'table';
  empty?: string;
}) {
  const query = useAdminQuery(findOperation(operations, id), { path });
  return (
    <section className={css.panel} aria-label={title}>
      <h3>{title}</h3>
      <QueryState loading={query.loading} error={query.error} onRetry={query.refresh}>
        {kind === 'table' ? (
          <Table value={query.data} caption={title} empty={empty ?? `No ${title.toLowerCase()}.`} />
        ) : (
          <Facts value={query.data} />
        )}
      </QueryState>
    </section>
  );
}

function enrolled(data: unknown, baseId: string): boolean | null {
  const rows = resultRows(data);
  if (!rows) return null;
  return rows.some((row) => idFrom(row, 'base') === baseId);
}

function BaseDetail({
  operations,
  baseId,
  summary,
}: {
  operations: AdminOperation[];
  baseId: string;
  summary: Row | null;
}) {
  const url = useAdminUrl();
  const section = SECTIONS.find(([id]) => id === url.read('section'))?.[0] ?? 'overview';
  const [notice, setNotice] = useState('');
  const autoRefill = useAdminQuery(findOperation(operations, 'get-bases-auto-refill'), {}, section === 'maintenance');
  const autoWater = useAdminQuery(
    findOperation(operations, 'get-bases-auto-refill-water'),
    {},
    section === 'maintenance',
  );
  const { act, dialog } = useConfirmedAction(operations, (message) => {
    setNotice(message);
    autoRefill.refresh();
    autoWater.refresh();
  });
  const name = summary ? nameFrom(summary, `Base ${baseId}`) : `Base ${baseId}`;
  const target = `${name} (ID ${baseId})`;
  const path = { baseId };
  const fuelEnrolled = enrolled(autoRefill.data, baseId);
  const waterEnrolled = enrolled(autoWater.data, baseId);
  return (
    <div className={css.screen}>
      <div className={css.toolbar}>
        <button type="button" onClick={() => url.update({ base: null, section: null })}>
          ← All bases
        </button>
        <h3 style={{ margin: 0 }}>{name}</h3>
        <span className={css.stateLine}>ID {baseId}</span>
      </div>
      <div className={css.subTabs} role="group" aria-label="Base sections">
        {SECTIONS.map(([id, label]) => (
          <button
            key={id}
            type="button"
            aria-pressed={id === section}
            onClick={() => url.update({ section: id }, 'replace')}
          >
            {label}
          </button>
        ))}
      </div>
      {notice && (
        <p role="status" className={css.status}>
          {notice}
        </p>
      )}
      {section === 'overview' && (
        <>
          {summary && (
            <section className={css.panel} aria-label="Base details">
              <h3>Details</h3>
              <Facts value={summary} />
            </section>
          )}
          <Panel
            operations={operations}
            id="get-bases-baseid-inventory"
            path={path}
            title="Inventory"
            kind="table"
            empty="The Console reported no stored items."
          />
        </>
      )}
      {section === 'maintenance' && (
        <>
          <Panel operations={operations} id="get-bases-baseid-water" path={path} title="Water" />
          <section className={css.panel} aria-label="Maintenance actions">
            <h3>Maintenance</h3>
            <p className={css.stateLine}>
              Refills may be queued until the base’s map can be changed safely. A queued refill has not happened yet;
              see Pending queues.
            </p>
            <div className={css.actions}>
              <button
                type="button"
                onClick={() =>
                  act(
                    'post-bases-baseid-refill-generators',
                    { path },
                    {
                      title: 'Refill generators',
                      confirmLabel: 'Refill generators',
                      danger: false,
                      target,
                      consequences: ['Adds fuel to this base’s generators.', 'The Console may queue it.'],
                      done: 'Generator refill requested.',
                    },
                  )
                }
              >
                Refill generators…
              </button>
              <button
                type="button"
                onClick={() =>
                  act(
                    'post-bases-baseid-refill-water',
                    { path },
                    {
                      title: 'Refill water',
                      confirmLabel: 'Refill water',
                      danger: false,
                      target,
                      consequences: ['Refills this base’s water storage.', 'The Console may queue it.'],
                      done: 'Water refill requested.',
                    },
                  )
                }
              >
                Refill water…
              </button>
            </div>
          </section>
          <section className={css.panel} aria-label="Automatic refill enrollment">
            <h3>Automatic refills</h3>
            <QueryState
              loading={autoRefill.loading || autoWater.loading}
              error={autoRefill.error ?? autoWater.error}
              onRetry={() => {
                autoRefill.refresh();
                autoWater.refresh();
              }}
            >
              <p>
                Generators:{' '}
                <strong>{fuelEnrolled === null ? 'Not reported' : fuelEnrolled ? 'Enrolled' : 'Not enrolled'}</strong>
                {' · '}Water:{' '}
                <strong>{waterEnrolled === null ? 'Not reported' : waterEnrolled ? 'Enrolled' : 'Not enrolled'}</strong>
              </p>
              <div className={css.actions}>
                {(
                  [
                    ['post-bases-baseid-auto-refill', 'generators', fuelEnrolled],
                    ['post-bases-baseid-auto-refill-water', 'water', waterEnrolled],
                  ] as const
                ).map(([id, label, state]) => (
                  <button
                    key={id}
                    type="button"
                    disabled={state === null}
                    onClick={() =>
                      act(
                        id,
                        { path, body: { enabled: !state } },
                        {
                          title: `${state ? 'Stop' : 'Start'} automatic ${label} refills`,
                          confirmLabel: state ? 'Stop automatic refills' : 'Enroll base',
                          danger: false,
                          target,
                          consequences: [
                            state
                              ? `This base is removed from automatic ${label} refills.`
                              : `This base is refilled automatically using the thresholds under Automatic refills.`,
                          ],
                          done: state ? `Automatic ${label} refills stopped.` : `Automatic ${label} refills enabled.`,
                        },
                      )
                    }
                  >
                    {state ? `Stop automatic ${label} refills…` : `Enroll in automatic ${label} refills…`}
                  </button>
                ))}
              </div>
            </QueryState>
          </section>
        </>
      )}
      {section === 'access' && (
        <>
          <Panel
            operations={operations}
            id="get-bases-baseid-permissions"
            path={path}
            title="Ownership and shared access"
            kind="table"
            empty="No players have access entries."
          />
          <Panel
            operations={operations}
            id="get-bases-baseid-child-access"
            path={path}
            title="Child-piece access"
            kind="table"
            empty="No child-piece access settings were reported."
          />
          <section className={css.panel} aria-label="System custody">
            <h3>System custody</h3>
            <div className={css.actions}>
              <button
                type="button"
                onClick={() =>
                  act(
                    'post-bases-baseid-system-custodian',
                    { path },
                    {
                      title: 'Hand to system custody',
                      confirmLabel: 'Hand to system',
                      target,
                      consequences: [
                        'The system becomes the custodian of this base.',
                        'Players lose their current ownership entries until access is granted again.',
                      ],
                      done: 'System custody requested.',
                    },
                  )
                }
              >
                Hand to system custody…
              </button>
            </div>
          </section>
        </>
      )}
      {section === 'manage' && (
        <section className={css.panel} aria-label="Export and removal">
          <h3>Export</h3>
          <p className={css.stateLine}>
            Downloads the base layout as a file in a new tab. Nothing changes on the server.
          </p>
          <div className={css.actions}>
            <button
              type="button"
              onClick={() => {
                const operation = findOperation(operations, 'get-bases-baseid-export');
                if (operation) {
                  downloadAdmin(operation, { path });
                  setNotice('Export requested. Provider errors open in the download tab.');
                }
              }}
            >
              Download export
            </button>
          </div>
          <h3>Removal</h3>
          <p className={css.notice}>
            Deleting a base removes it and everything in it. The Console may queue the deletion; queued deletions can be
            cancelled under Pending queues.
          </p>
          <div className={css.actions}>
            <button
              type="button"
              className={css.danger}
              onClick={() =>
                act(
                  'delete-bases-baseid',
                  { path, body: { confirmation: 'DELETE BASE' } },
                  {
                    title: 'Delete base',
                    confirmLabel: 'Delete base',
                    phrase: 'DELETE BASE',
                    target,
                    consequences: [
                      'Deletes the base, its pieces and stored contents.',
                      'This cannot be undone once it runs.',
                    ],
                    done: 'Base deletion requested.',
                  },
                )
              }
            >
              Delete base…
            </button>
          </div>
        </section>
      )}
      {dialog}
    </div>
  );
}

function Queue({
  operations,
  listId,
  cancelId,
  title,
  cancelLabel,
}: {
  operations: AdminOperation[];
  listId: string;
  cancelId: string;
  title: string;
  cancelLabel: string;
}) {
  const [notice, setNotice] = useState('');
  const list = useAdminQuery(findOperation(operations, listId));
  const { act, dialog } = useConfirmedAction(operations, (message) => {
    setNotice(message);
    list.refresh();
  });
  return (
    <section className={css.panel} aria-label={title}>
      <h3>{title}</h3>
      {notice && (
        <p role="status" className={css.status}>
          {notice}
        </p>
      )}
      <QueryState loading={list.loading} error={list.error} onRetry={list.refresh}>
        <Table
          value={list.data}
          caption={title}
          empty="Nothing is queued."
          action={(row) => {
            const baseId = idFrom(row, 'base');
            return baseId ? (
              <button
                type="button"
                onClick={() =>
                  act(
                    cancelId,
                    { path: { baseId } },
                    {
                      title: cancelLabel,
                      confirmLabel: cancelLabel,
                      danger: false,
                      target: `${nameFrom(row, 'Base')} (ID ${baseId})`,
                      consequences: ['The queued action is removed and will not run.'],
                      done: 'Cancellation requested.',
                    },
                  )
                }
              >
                Cancel
              </button>
            ) : null;
          }}
        />
      </QueryState>
      {dialog}
    </section>
  );
}

function Queues({ operations }: { operations: AdminOperation[] }) {
  return (
    <div className={css.screen}>
      <p className={css.stateLine}>These actions are queued, not completed. Cancelling keeps the base unchanged.</p>
      <Queue
        operations={operations}
        listId="get-bases-pending-refills"
        cancelId="delete-bases-baseid-queued-refill"
        title="Generator refills"
        cancelLabel="Cancel refill"
      />
      <Queue
        operations={operations}
        listId="get-bases-pending-water-refills"
        cancelId="delete-bases-baseid-queued-water-refill"
        title="Water refills"
        cancelLabel="Cancel water refill"
      />
      <Queue
        operations={operations}
        listId="get-bases-pending-child-access"
        cancelId="delete-bases-baseid-queued-child-access"
        title="Child-piece access changes"
        cancelLabel="Cancel access change"
      />
      <Queue
        operations={operations}
        listId="get-bases-pending-deletes"
        cancelId="delete-bases-baseid-queued-delete"
        title="Base deletions"
        cancelLabel="Cancel deletion"
      />
    </div>
  );
}

const SETTINGS: [string, string][] = [
  ['thresholdPercent', 'Generator refill below (%)'],
  ['windtrapThresholdPercent', 'Windtrap refill below (%)'],
  ['intervalHours', 'Fuel check interval (hours)'],
  ['waterThresholdPercent', 'Water refill below (%)'],
  ['waterIntervalHours', 'Water check interval (hours)'],
];

function Automation({ operations }: { operations: AdminOperation[] }) {
  const [notice, setNotice] = useState('');
  const [draft, setDraft] = useState<Record<string, string>>({});
  const settings = useAdminQuery(findOperation(operations, 'get-bases-auto-refill-settings'));
  const fuel = useAdminQuery(findOperation(operations, 'get-bases-auto-refill'));
  const water = useAdminQuery(findOperation(operations, 'get-bases-auto-refill-water'));
  const { act, dialog } = useConfirmedAction(operations, (message) => {
    setNotice(message);
    settings.refresh();
  });
  function submit(event: FormEvent) {
    event.preventDefault();
    const body: Record<string, number> = {};
    for (const [key] of SETTINGS) {
      const raw = (draft[key] ?? '').trim();
      if (!raw) continue;
      const value = Number(raw);
      if (!Number.isFinite(value) || value < 0) return setNotice('Settings must be positive numbers.');
      body[key] = value;
    }
    if (!Object.keys(body).length) return setNotice('Change at least one setting.');
    act(
      'post-bases-auto-refill-settings',
      { body },
      {
        title: 'Save automatic refill settings',
        confirmLabel: 'Save settings',
        danger: false,
        target: 'Automatic refill settings for all enrolled bases',
        consequences: Object.entries(body).map(
          ([key, value]) => `${SETTINGS.find(([name]) => name === key)?.[1]}: ${value}`,
        ),
        done: 'Settings saved.',
      },
    );
    setDraft({});
  }
  return (
    <div className={css.screen}>
      {notice && (
        <p role="status" className={css.status}>
          {notice}
        </p>
      )}
      <section className={css.panel} aria-label="Current refill settings">
        <h3>Current settings</h3>
        <QueryState loading={settings.loading} error={settings.error} onRetry={settings.refresh}>
          <Facts value={settings.data} />
        </QueryState>
        <form onSubmit={submit}>
          <div className={css.facts}>
            {SETTINGS.map(([key, label]) => (
              <label className={css.field} key={key}>
                {label}
                <input
                  inputMode="decimal"
                  value={draft[key] ?? ''}
                  onChange={(event) => setDraft({ ...draft, [key]: event.target.value })}
                />
              </label>
            ))}
          </div>
          <button type="submit">Review changes…</button>
        </form>
      </section>
      <section className={css.panel} aria-label="Enrolled bases">
        <h3>Enrolled for generators</h3>
        <QueryState loading={fuel.loading} error={fuel.error} onRetry={fuel.refresh}>
          <Table
            value={fuel.data}
            caption="Bases enrolled for automatic generator refills"
            empty="No bases are enrolled."
          />
        </QueryState>
        <h3>Enrolled for water</h3>
        <QueryState loading={water.loading} error={water.error} onRetry={water.refresh}>
          <Table
            value={water.data}
            caption="Bases enrolled for automatic water refills"
            empty="No bases are enrolled."
          />
        </QueryState>
      </section>
      {dialog}
    </div>
  );
}

function StorageScreen({ operations }: { operations: AdminOperation[] }) {
  const url = useAdminUrl();
  const storageId = url.read('storage');
  const [notice, setNotice] = useState('');
  const [itemName, setItemName] = useState('');
  const [quantity, setQuantity] = useState('1');
  const list = useAdminQuery(findOperation(operations, 'get-storage'), {}, !storageId);
  const detail = useAdminQuery(
    findOperation(operations, 'get-storage-storageid'),
    { path: { storageId } },
    Boolean(storageId),
  );
  const items = useAdminQuery(
    findOperation(operations, 'get-storage-storageid-items'),
    { path: { storageId } },
    Boolean(storageId),
  );
  const { act, dialog } = useConfirmedAction(operations, (message) => {
    setNotice(message);
    items.refresh();
  });
  if (!storageId)
    return (
      <section className={css.panel} aria-label="Storage containers">
        <h3>Storage containers</h3>
        <QueryState loading={list.loading} error={list.error} onRetry={list.refresh}>
          <Table
            value={list.data}
            caption="Storage containers"
            empty="No storage containers were reported."
            action={(row) => {
              const id = text(row, ['storage_id', 'storageId', 'id']);
              return id ? (
                <button type="button" onClick={() => url.update({ storage: id })}>
                  Open {nameFrom(row, 'container')}
                </button>
              ) : null;
            }}
          />
        </QueryState>
      </section>
    );
  const target = `Storage container ${storageId}`;
  function submit(event: FormEvent) {
    event.preventDefault();
    const count = Number(quantity);
    if (!itemName.trim() || !Number.isSafeInteger(count) || count <= 0)
      return setNotice('Enter an item name and a whole quantity greater than zero.');
    act(
      'post-storage-storageid-give-item',
      {
        path: { storageId },
        body: { itemName: itemName.trim(), quantity: count, confirmation: 'GIVE ITEM TO STORAGE' },
      },
      {
        title: 'Add item to storage',
        confirmLabel: 'Add item',
        phrase: 'GIVE ITEM TO STORAGE',
        danger: false,
        target,
        consequences: [
          `Adds ${count} × ${itemName.trim()} to this container.`,
          'Crafting and refining contents are read-only and the Console may refuse.',
        ],
        done: `Added ${count} × ${itemName.trim()}.`,
      },
    );
  }
  return (
    <div className={css.screen}>
      <div className={css.toolbar}>
        <button type="button" onClick={() => url.update({ storage: null })}>
          ← All containers
        </button>
        <h3 style={{ margin: 0 }}>{target}</h3>
        <button
          type="button"
          onClick={() => {
            const operation = findOperation(operations, 'get-storage-storageid-export');
            if (operation) {
              downloadAdmin(operation, { path: { storageId } });
              setNotice('Export requested. Provider errors open in the download tab.');
            }
          }}
        >
          Download export
        </button>
      </div>
      {notice && (
        <p role="status" className={css.status}>
          {notice}
        </p>
      )}
      <section className={css.panel} aria-label="Container details">
        <h3>Details</h3>
        <QueryState loading={detail.loading} error={detail.error} onRetry={detail.refresh}>
          <Facts value={detail.data} />
        </QueryState>
      </section>
      <section className={css.panel} aria-label="Container items">
        <h3>Items</h3>
        <QueryState loading={items.loading} error={items.error} onRetry={items.refresh}>
          <Table value={items.data} caption="Container items" empty="This container is empty." />
        </QueryState>
      </section>
      <section className={css.panel} aria-label="Add item">
        <h3>Add an item</h3>
        <form onSubmit={submit}>
          <label className={css.field}>
            Item name
            <input value={itemName} onChange={(event) => setItemName(event.target.value)} />
          </label>
          <label className={css.field}>
            Quantity
            <input inputMode="numeric" value={quantity} onChange={(event) => setQuantity(event.target.value)} />
          </label>
          <button type="submit">Review…</button>
        </form>
      </section>
      {dialog}
    </div>
  );
}

export default function BasesScreen({ operations }: { operations: AdminOperation[] }) {
  const url = useAdminUrl();
  const view = VIEWS.find(([id]) => id === url.read('view'))?.[0] ?? 'bases';
  const baseId = url.read('base');
  const search = url.read('q');
  const page = Math.max(0, Number(url.read('page')) || 0);
  const [draft, setDraft] = useState<string | null>(null);
  const list = useAdminQuery(
    findOperation(operations, 'get-bases'),
    { query: { page, pageSize: PAGE_SIZE, ...(search ? { q: search } : {}) } },
    view === 'bases' && !baseId,
  );
  const selected = (resultRows(list.data) ?? []).find((row) => idFrom(row, 'base') === baseId) ?? null;
  if (view === 'bases' && baseId) return <BaseDetail operations={operations} baseId={baseId} summary={selected} />;
  return (
    <div className={css.screen}>
      <div className={css.subTabs} role="group" aria-label="Base views">
        {VIEWS.map(([id, label]) => (
          <button
            key={id}
            type="button"
            aria-pressed={id === view}
            onClick={() => url.update({ view: id === 'bases' ? null : id, base: null, storage: null })}
          >
            {label}
          </button>
        ))}
      </div>
      {view === 'storage' && <StorageScreen operations={operations} />}
      {view === 'queues' && <Queues operations={operations} />}
      {view === 'automation' && <Automation operations={operations} />}
      {view === 'bases' && (
        <>
          <form
            className={css.toolbar}
            role="search"
            onSubmit={(event) => {
              event.preventDefault();
              url.update({ q: draft ?? search, page: null });
              setDraft(null);
            }}
          >
            <label className={css.field}>
              Search bases
              <input type="search" value={draft ?? search} onChange={(event) => setDraft(event.target.value)} />
            </label>
            <button type="submit">Search</button>
            <button type="button" onClick={list.refresh} disabled={list.loading}>
              Refresh
            </button>
          </form>
          <QueryState loading={list.loading} error={list.error} onRetry={list.refresh}>
            <Table
              value={list.data}
              caption="Bases"
              empty="No bases match this search."
              action={(row) => {
                const id = idFrom(row, 'base');
                return id ? (
                  <button type="button" onClick={() => url.update({ base: id, section: null })}>
                    Open {nameFrom(row, 'base')}
                  </button>
                ) : null;
              }}
            />
            <nav className={css.pager} aria-label="Base pages">
              <button type="button" disabled={page === 0} onClick={() => url.update({ page: page - 1 || null })}>
                Previous page
              </button>
              <span>Page {page + 1}</span>
              <button
                type="button"
                disabled={!hasMore(list.data, page, PAGE_SIZE)}
                onClick={() => url.update({ page: page + 1 })}
              >
                Next page
              </button>
            </nav>
          </QueryState>
        </>
      )}
    </div>
  );
}
