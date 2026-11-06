import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { adminCall, findOperation, type AdminInput } from '../client';
import ConfirmDialog from '../components/ConfirmDialog';
import { Facts, QueryState, Table } from '../components/DataPanel';
import useAdminQuery from '../hooks/useAdminQuery';
import useAdminUrl from '../hooks/useAdminUrl';
import { adminHref } from '../navigation';
import { hasMore, idFrom, nameFrom, resultRows, text, type Row } from '../records';
import type { AdminOperation } from '../types';
import css from '../styles/admin.module.css';

const SECTIONS = [
  ['overview', 'Profile'],
  ['inventory', 'Inventory'],
  ['assets', 'Vehicles & bases'],
  ['progression', 'Progression'],
  ['moderation', 'Moderation'],
  ['manage', 'Grants & repairs'],
] as const;
const PAGE_SIZE = 20;

type Pending = {
  title: string;
  confirmLabel: string;
  consequences: string[];
  phrase?: string;
  danger?: boolean;
  run: () => Promise<unknown>;
  children?: React.ReactNode;
};

function Panel({
  operations,
  id,
  playerId,
  title,
  kind = 'facts',
}: {
  operations: AdminOperation[];
  id: string;
  playerId: string;
  title: string;
  kind?: 'facts' | 'table';
}) {
  const operation = findOperation(operations, id);
  const query = useAdminQuery(operation, { path: { playerId } });
  return (
    <section className={css.panel} aria-label={title}>
      <h3>{title}</h3>
      <QueryState loading={query.loading} error={query.error} onRetry={query.refresh}>
        {kind === 'table' ? (
          <Table value={query.data} caption={title} empty={`No ${title.toLowerCase()}.`} />
        ) : (
          <Facts value={query.data} />
        )}
      </QueryState>
    </section>
  );
}

function PlayerDetail({
  operations,
  playerId,
  summary,
}: {
  operations: AdminOperation[];
  playerId: string;
  summary: Row | null;
}) {
  const url = useAdminUrl();
  const section = SECTIONS.find(([id]) => id === url.read('section'))?.[0] ?? 'overview';
  const [pending, setPending] = useState<Pending | null>(null);
  const [notice, setNotice] = useState('');
  const [reason, setReason] = useState('');
  const [amount, setAmount] = useState('');
  const [itemName, setItemName] = useState('');
  const [quantity, setQuantity] = useState('1');
  const ban = useAdminQuery(
    findOperation(operations, 'get-players-playerid-ban'),
    { path: { playerId } },
    section === 'moderation',
  );
  const name = summary ? nameFrom(summary, `Player ${playerId}`) : `Player ${playerId}`;
  const target = `${name} (ID ${playerId})`;

  function act(id: string, input: AdminInput, spec: Omit<Pending, 'run'> & { done: string }) {
    const operation = findOperation(operations, id);
    if (!operation) return;
    setPending({
      ...spec,
      run: async () => {
        const outcome = await adminCall(operation, { path: { playerId }, ...input });
        setNotice(
          `${spec.done}${outcome.upstreamStatus === 202 ? ' The Console queued it; it has not completed yet.' : ''}`,
        );
        setPending(null);
        ban.refresh();
      },
    });
  }

  function submitXp(event: FormEvent) {
    event.preventDefault();
    const value = Number(amount);
    if (!Number.isSafeInteger(value) || value <= 0) return setNotice('Enter a whole number greater than zero.');
    act(
      'post-players-playerid-add-xp',
      { body: { amount: value } },
      {
        title: 'Add experience',
        confirmLabel: 'Add experience',
        consequences: [
          `Adds ${value.toLocaleString()} XP to this character.`,
          'XP cannot be removed afterwards except by resetting progression.',
        ],
        done: `Added ${value.toLocaleString()} XP.`,
      },
    );
  }
  function submitItem(event: FormEvent) {
    event.preventDefault();
    const count = Number(quantity);
    if (!itemName.trim() || !Number.isSafeInteger(count) || count <= 0)
      return setNotice('Enter an item name and a whole quantity greater than zero.');
    act(
      'post-players-playerid-give-item',
      { body: { itemName: itemName.trim(), quantity: count } },
      {
        title: 'Give item',
        confirmLabel: 'Give item',
        consequences: [
          `Grants ${count} × ${itemName.trim()} to this character's inventory.`,
          'The Console rejects unknown item names.',
        ],
        done: `Granted ${count} × ${itemName.trim()}.`,
      },
    );
  }

  const banned = (() => {
    const record = ban.data && typeof ban.data === 'object' ? (ban.data as Row) : null;
    const value = record?.banned ?? record?.isBanned ?? record?.is_banned;
    return typeof value === 'boolean' ? value : null;
  })();

  return (
    <div className={css.screen}>
      <div className={css.toolbar}>
        <button type="button" onClick={() => url.update({ player: null, section: null })}>
          ← All players
        </button>
        <h3 style={{ margin: 0 }}>{name}</h3>
        <span className={css.stateLine}>ID {playerId}</span>
      </div>
      <div className={css.subTabs} role="group" aria-label="Player sections">
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
          <Panel operations={operations} id="get-players-playerid" playerId={playerId} title="Profile" />
          <Panel operations={operations} id="get-players-playerid-position" playerId={playerId} title="Position" />
          <Panel operations={operations} id="get-players-playerid-vitals" playerId={playerId} title="Vitals" />
          <p className={css.notice}>
            Player events, history and per-player statistics are not recorded by the Console API, so they are not shown.
          </p>
        </>
      )}
      {section === 'inventory' && (
        <Panel
          operations={operations}
          id="get-players-playerid-inventory"
          playerId={playerId}
          title="Inventory"
          kind="table"
        />
      )}
      {section === 'assets' && (
        <>
          <Panel
            operations={operations}
            id="get-players-playerid-vehicles"
            playerId={playerId}
            title="Vehicles"
            kind="table"
          />
          <p className={css.stateLine}>
            <Link href={adminHref('vehicles')} shallow>
              Open the vehicle manager
            </Link>
          </p>
          <Panel
            operations={operations}
            id="get-players-playerid-bases"
            playerId={playerId}
            title="Bases"
            kind="table"
          />
        </>
      )}
      {section === 'progression' && (
        <>
          <Panel
            operations={operations}
            id="get-players-playerid-progression"
            playerId={playerId}
            title="Progression"
          />
          <Panel operations={operations} id="get-players-playerid-currency" playerId={playerId} title="Currency" />
          <Panel operations={operations} id="get-players-playerid-factions" playerId={playerId} title="Factions" />
          <Panel operations={operations} id="get-players-playerid-intel" playerId={playerId} title="Intel" />
          <Panel operations={operations} id="get-players-playerid-specs" playerId={playerId} title="Specializations" />
        </>
      )}
      {section === 'moderation' && (
        <section className={css.panel} aria-label="Moderation">
          <h3>Moderation</h3>
          <QueryState loading={ban.loading} error={ban.error} onRetry={ban.refresh}>
            <p>
              Ban status:{' '}
              <strong>
                {banned === null ? 'The Console did not report a status' : banned ? 'Banned' : 'Not banned'}
              </strong>
            </p>
          </QueryState>
          <div className={css.actions}>
            <button
              type="button"
              onClick={() =>
                act(
                  'post-players-playerid-kick',
                  {},
                  {
                    title: 'Kick player',
                    confirmLabel: 'Kick player',
                    consequences: ['Disconnects the player if they are online.', 'They can rejoin immediately.'],
                    done: 'Kick requested.',
                  },
                )
              }
            >
              Kick
            </button>
            <button
              type="button"
              onClick={() =>
                act(
                  'post-players-playerid-repair-login-queue',
                  { body: { confirmation: 'REPAIR LOGIN QUEUE' } },
                  {
                    title: 'Repair login queue',
                    confirmLabel: 'Repair queue',
                    phrase: 'REPAIR LOGIN QUEUE',
                    consequences: [
                      'Clears a stuck login-queue entry for this player.',
                      'It does not change the character.',
                    ],
                    done: 'Login-queue repair requested.',
                  },
                )
              }
            >
              Repair login queue
            </button>
            {banned ? (
              <button
                type="button"
                onClick={() =>
                  act(
                    'delete-players-playerid-ban',
                    {},
                    {
                      title: 'Lift ban',
                      confirmLabel: 'Lift ban',
                      danger: false,
                      consequences: ['The player can sign in again.'],
                      done: 'Ban lifted.',
                    },
                  )
                }
              >
                Lift ban
              </button>
            ) : (
              <button
                type="button"
                className={css.danger}
                onClick={() =>
                  act(
                    'post-players-playerid-ban',
                    { body: { confirmation: 'BAN PLAYER', ...(reason.trim() ? { reason: reason.trim() } : {}) } },
                    {
                      title: 'Ban player',
                      confirmLabel: 'Ban player',
                      phrase: 'BAN PLAYER',
                      consequences: [
                        'The player is blocked from signing in and is disconnected if online.',
                        'You can lift the ban later.',
                      ],
                      done: 'Ban requested.',
                    },
                  )
                }
              >
                Ban…
              </button>
            )}
          </div>
          {!banned && (
            <label className={css.field}>
              Ban reason (optional)
              <input value={reason} maxLength={200} onChange={(event) => setReason(event.target.value)} />
            </label>
          )}
        </section>
      )}
      {section === 'manage' && (
        <>
          <section className={css.panel} aria-label="Add experience">
            <h3>Add experience</h3>
            <form onSubmit={submitXp}>
              <label className={css.field}>
                Amount of XP
                <input inputMode="numeric" value={amount} onChange={(event) => setAmount(event.target.value)} />
              </label>
              <button type="submit">Review…</button>
            </form>
          </section>
          <section className={css.panel} aria-label="Give item">
            <h3>Give item</h3>
            <form onSubmit={submitItem}>
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
          <section className={css.panel} aria-label="Quick actions">
            <h3>Quick actions</h3>
            <div className={css.actions}>
              <button
                type="button"
                onClick={() =>
                  act(
                    'post-players-playerid-refill-water',
                    {},
                    {
                      title: 'Refill water',
                      confirmLabel: 'Refill water',
                      danger: false,
                      consequences: ['Refills this character’s hydration.'],
                      done: 'Water refill requested.',
                    },
                  )
                }
              >
                Refill water
              </button>
              <button
                type="button"
                onClick={() =>
                  act(
                    'post-players-playerid-repair-gear',
                    {},
                    {
                      title: 'Repair gear',
                      confirmLabel: 'Repair gear',
                      danger: false,
                      consequences: ['Restores durability on the character’s equipped and carried gear.'],
                      done: 'Gear repair requested.',
                    },
                  )
                }
              >
                Repair gear
              </button>
            </div>
          </section>
        </>
      )}
      {pending && (
        <ConfirmDialog
          title={pending.title}
          target={target}
          consequences={pending.consequences}
          phrase={pending.phrase}
          confirmLabel={pending.confirmLabel}
          danger={pending.danger ?? true}
          onCancel={() => setPending(null)}
          onConfirm={pending.run}
        />
      )}
    </div>
  );
}

export default function PlayersScreen({ operations }: { operations: AdminOperation[] }) {
  const url = useAdminUrl();
  const playerId = url.read('player');
  const search = url.read('q');
  const status = url.read('status') || 'all';
  const page = Math.max(0, Number(url.read('page')) || 0);
  const [draft, setDraft] = useState<string | null>(null);
  const list = useAdminQuery(
    findOperation(operations, 'get-players'),
    { query: { page, pageSize: PAGE_SIZE, status, ...(search ? { q: search } : {}) } },
    !playerId,
  );
  const rows = resultRows(list.data) ?? [];
  const selected = rows.find((row) => idFrom(row, 'player') === playerId) ?? null;
  if (playerId) return <PlayerDetail operations={operations} playerId={playerId} summary={selected} />;
  return (
    <div className={css.screen}>
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
          Search players
          <input type="search" value={draft ?? search} onChange={(event) => setDraft(event.target.value)} />
        </label>
        <label className={css.field}>
          Status
          <select value={status} onChange={(event) => url.update({ status: event.target.value, page: null })}>
            <option value="all">All players</option>
            <option value="online">Online now</option>
            <option value="offline">Offline</option>
            <option value="banned">Banned</option>
          </select>
        </label>
        <button type="submit">Search</button>
        <button type="button" onClick={list.refresh} disabled={list.loading}>
          Refresh
        </button>
      </form>
      <QueryState loading={list.loading} error={list.error} onRetry={list.refresh}>
        <Table
          value={list.data}
          caption="Players"
          empty="No players match these filters."
          action={(row) => {
            const id = idFrom(row, 'player');
            return id ? (
              <button type="button" onClick={() => url.update({ player: id, section: null })}>
                Open {text(row, ['character_name', 'name'], 'player')}
              </button>
            ) : null;
          }}
        />
        <nav className={css.pager} aria-label="Player pages">
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
    </div>
  );
}
