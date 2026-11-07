import { useState } from 'react';
import { findOperation } from '../../../../../features/admin/client';
import { useConfirmedAction as useVehicleActions } from '../hooks/useConfirmedAction';
import { Facts, QueryState, Table } from '../parts/DataPanel';
import useAdminQuery from '../hooks/useAdminQuery';
import useAdminUrl from '../hooks/useAdminUrl';
import { hasMore, idFrom, nameFrom, resultRows, text, type Row } from '../../../../../features/admin/records';
import type { AdminOperation } from '../../../../../features/admin/types';
import { ui } from '../ui';

const SECTIONS = [
  ['overview', 'Details'],
  ['access', 'Ownership & access'],
  ['cargo', 'Cargo'],
  ['remove', 'Removal'],
] as const;
const PAGE_SIZE = 20;

function VehicleDetail({
  operations,
  vehicleId,
  summary,
}: {
  operations: AdminOperation[];
  vehicleId: string;
  summary: Row | null;
}) {
  const url = useAdminUrl();
  const section = SECTIONS.find(([id]) => id === url.read('section'))?.[0] ?? 'overview';
  const [notice, setNotice] = useState('');
  const permissions = useAdminQuery(
    findOperation(operations, 'get-vehicles-vehicleid-permissions'),
    { path: { vehicleId } },
    section === 'access',
  );
  const storage = useAdminQuery(
    findOperation(operations, 'get-vehicles-vehicleid-storage'),
    { path: { vehicleId } },
    section === 'cargo',
  );
  const name = summary ? nameFrom(summary, `Vehicle ${vehicleId}`) : `Vehicle ${vehicleId}`;
  const target = `${name} (ID ${vehicleId})`;
  const { act, dialog } = useVehicleActions(operations, (message) => {
    setNotice(message);
    storage.refresh();
    permissions.refresh();
  });
  return (
    <div className={ui.screen}>
      <div className={ui.toolbar}>
        <button type="button" onClick={() => url.update({ vehicle: null, section: null })}>
          ← All vehicles
        </button>
        <h3 style={{ margin: 0 }}>{name}</h3>
        <span className={ui.stateLine}>ID {vehicleId}</span>
      </div>
      <div className={ui.subTabs} role="group" aria-label="Vehicle sections">
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
        <p role="status" className={ui.status}>
          {notice}
        </p>
      )}
      {section === 'overview' && (
        <section className={ui.panel} aria-label="Vehicle details">
          <h3>Details</h3>
          {summary ? (
            <Facts value={summary} />
          ) : (
            <p className={ui.stateLine}>
              This vehicle is not on the current list page. Return to the list to search for it.
            </p>
          )}
        </section>
      )}
      {section === 'access' && (
        <section className={ui.panel} aria-label="Ownership and access">
          <h3>Ownership & shared access</h3>
          <QueryState loading={permissions.loading} error={permissions.error} onRetry={permissions.refresh}>
            <Table value={permissions.data} caption="Vehicle permissions" empty="No players have access entries." />
          </QueryState>
          <div className={ui.actions}>
            <button
              type="button"
              onClick={() =>
                act(
                  'post-vehicles-vehicleid-system-custodian',
                  { path: { vehicleId } },
                  {
                    title: 'Hand to system custody',
                    confirmLabel: 'Hand to system',
                    target,
                    consequences: [
                      'The system becomes the custodian of this vehicle.',
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
      )}
      {section === 'cargo' && (
        <section className={ui.panel} aria-label="Vehicle cargo">
          <h3>Cargo</h3>
          <QueryState loading={storage.loading} error={storage.error} onRetry={storage.refresh}>
            <Table
              value={storage.data}
              caption="Vehicle cargo"
              empty="This vehicle’s cargo is empty or was not reported."
              action={(row) => {
                const itemId = idFrom(row, 'item');
                return itemId ? (
                  <button
                    type="button"
                    onClick={() =>
                      act(
                        'delete-vehicles-vehicleid-storage-items-itemid',
                        { path: { vehicleId, itemId }, body: { confirmation: 'DELETE ITEM' } },
                        {
                          title: 'Remove cargo item',
                          confirmLabel: 'Remove item',
                          phrase: 'DELETE ITEM',
                          target: `${text(row, ['name', 'item_name', 'itemName'], `Item ${itemId}`)} in ${target}`,
                          consequences: [
                            'Removes this stack from the vehicle’s cargo.',
                            'Removed items cannot be restored from here.',
                          ],
                          done: 'Item removal requested.',
                        },
                      )
                    }
                  >
                    Remove
                  </button>
                ) : null;
              }}
            />
          </QueryState>
          <div className={ui.actions}>
            <button
              type="button"
              className={ui.danger}
              onClick={() =>
                act(
                  'delete-vehicles-vehicleid-storage-all-items',
                  { path: { vehicleId }, body: { confirmation: 'DELETE ALL ITEMS' } },
                  {
                    title: 'Empty all cargo',
                    confirmLabel: 'Empty cargo',
                    phrase: 'DELETE ALL ITEMS',
                    target,
                    consequences: ['Deletes every item in this vehicle’s cargo.', 'This cannot be undone.'],
                    done: 'Cargo clearing requested.',
                  },
                )
              }
            >
              Empty all cargo…
            </button>
          </div>
        </section>
      )}
      {section === 'remove' && (
        <section className={ui.panel} aria-label="Vehicle removal">
          <h3>Removal</h3>
          <p className={ui.notice}>
            Removal is permanent. The Console may queue deletion until the vehicle’s map is safe to change; queued
            deletions appear under Pending deletions and can be cancelled there.
          </p>
          <div className={ui.actions}>
            <button
              type="button"
              className={ui.danger}
              onClick={() =>
                act(
                  'delete-vehicles-vehicleid',
                  { path: { vehicleId }, body: { confirmation: 'DELETE VEHICLE' } },
                  {
                    title: 'Delete vehicle',
                    confirmLabel: 'Delete vehicle',
                    phrase: 'DELETE VEHICLE',
                    target,
                    consequences: [
                      'Deletes the vehicle from the world and everything inside it.',
                      'The Console decides whether this happens now or is queued.',
                    ],
                    done: 'Vehicle deletion requested.',
                  },
                )
              }
            >
              Delete vehicle…
            </button>
            <button
              type="button"
              className={ui.danger}
              onClick={() =>
                act(
                  'delete-vehicles-vehicleid-stored',
                  { path: { vehicleId }, body: { confirmation: 'DELETE STORED VEHICLE' } },
                  {
                    title: 'Delete stored vehicle',
                    confirmLabel: 'Delete stored vehicle',
                    phrase: 'DELETE STORED VEHICLE',
                    target,
                    consequences: [
                      'Deletes a vehicle that is in storage rather than placed in the world.',
                      'The Console refuses if the vehicle is not stored.',
                    ],
                    done: 'Stored-vehicle deletion requested.',
                  },
                )
              }
            >
              Delete stored vehicle…
            </button>
          </div>
        </section>
      )}
      {dialog}
    </div>
  );
}

function PendingDeletes({ operations }: { operations: AdminOperation[] }) {
  const [notice, setNotice] = useState('');
  const pendingList = useAdminQuery(findOperation(operations, 'get-vehicles-pending-deletes'));
  const { act, dialog } = useVehicleActions(operations, (message) => {
    setNotice(message);
    pendingList.refresh();
  });
  return (
    <section className={ui.panel} aria-label="Pending vehicle deletions">
      <h3>Pending deletions</h3>
      <p className={ui.stateLine}>These deletions are queued, not completed. Cancelling keeps the vehicle.</p>
      {notice && (
        <p role="status" className={ui.status}>
          {notice}
        </p>
      )}
      <QueryState loading={pendingList.loading} error={pendingList.error} onRetry={pendingList.refresh}>
        <Table
          value={pendingList.data}
          caption="Pending vehicle deletions"
          empty="No vehicle deletions are queued."
          action={(row) => {
            const vehicleId = idFrom(row, 'vehicle');
            return vehicleId ? (
              <button
                type="button"
                onClick={() =>
                  act(
                    'delete-vehicles-vehicleid-queued-delete',
                    { path: { vehicleId } },
                    {
                      title: 'Cancel queued deletion',
                      confirmLabel: 'Cancel deletion',
                      danger: false,
                      target: `${nameFrom(row, 'Vehicle')} (ID ${vehicleId})`,
                      consequences: ['The queued deletion is removed and the vehicle stays in the world.'],
                      done: 'Cancellation requested.',
                    },
                  )
                }
              >
                Cancel deletion
              </button>
            ) : null;
          }}
        />
      </QueryState>
      {dialog}
    </section>
  );
}

export default function VehiclesScreen({ operations }: { operations: AdminOperation[] }) {
  const url = useAdminUrl();
  const vehicleId = url.read('vehicle');
  const view = url.read('view') === 'pending' ? 'pending' : 'list';
  const search = url.read('q');
  const page = Math.max(0, Number(url.read('page')) || 0);
  const [draft, setDraft] = useState<string | null>(null);
  const list = useAdminQuery(
    findOperation(operations, 'get-vehicles'),
    { query: { page, pageSize: PAGE_SIZE, ...(search ? { q: search } : {}) } },
    view === 'list',
  );
  const selected = (resultRows(list.data) ?? []).find((row) => idFrom(row, 'vehicle') === vehicleId) ?? null;
  if (vehicleId) return <VehicleDetail operations={operations} vehicleId={vehicleId} summary={selected} />;
  return (
    <div className={ui.screen}>
      <div className={ui.subTabs} role="group" aria-label="Vehicle views">
        <button type="button" aria-pressed={view === 'list'} onClick={() => url.update({ view: null })}>
          All vehicles
        </button>
        <button type="button" aria-pressed={view === 'pending'} onClick={() => url.update({ view: 'pending' })}>
          Pending deletions
        </button>
      </div>
      {view === 'pending' ? (
        <PendingDeletes operations={operations} />
      ) : (
        <>
          <form
            className={ui.toolbar}
            role="search"
            onSubmit={(event) => {
              event.preventDefault();
              url.update({ q: draft ?? search, page: null });
              setDraft(null);
            }}
          >
            <label className={ui.field}>
              Search vehicles
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
              caption="Vehicles"
              empty="No vehicles match these filters."
              action={(row) => {
                const id = idFrom(row, 'vehicle');
                return id ? (
                  <button
                    aria-label={`Open ${nameFrom(row, 'vehicle')}`}
                    type="button"
                    onClick={() => url.update({ vehicle: id, section: null })}
                  >
                    Open
                  </button>
                ) : null;
              }}
            />
            <nav className={ui.pager} aria-label="Vehicle pages">
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
