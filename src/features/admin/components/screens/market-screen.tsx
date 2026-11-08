import { useState, type FormEvent } from 'react';
import { formatTimestamp } from '../../../../lib/time';
import Link from 'next/link';
import { adminCall, downloadAdmin, findOperation } from '../../client';
import { Facts, QueryState, Table } from '../data-panel';
import useAdminQuery from '../../hooks/use-admin-query';
import useAdminUrl from '../../hooks/use-admin-url';
import { useConfirmedAction } from '../../hooks/use-confirmed-action';
import { adminHref } from '../../navigation';
import { hasMore } from '../../records';
import type { AdminOperation } from '../../types';
import { ui } from '../ui';

const VIEWS = [
  ['overview', 'Overview'],
  ['items', 'Listings'],
  ['transactions', 'Transactions'],
  ['automation', 'Buyback & seeding'],
  ['plans', 'Seed plans'],
  ['sellers', 'Sellers'],
] as const;
const PAGE_SIZE = 20;
const HOURS: [string, string][] = [
  ['0', 'All time'],
  ['24', 'Last 24 hours'],
  ['168', 'Last 7 days'],
  ['720', 'Last 30 days'],
  ['2160', 'Last 90 days'],
];

function Read({
  operations,
  id,
  title,
  kind = 'facts',
  empty,
}: {
  operations: AdminOperation[];
  id: string;
  title: string;
  kind?: 'facts' | 'table';
  empty?: string;
}) {
  const result = useAdminQuery(findOperation(operations, id));
  return (
    <section className={ui.panel} aria-label={title}>
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

function Listings({ operations }: { operations: AdminOperation[] }) {
  const url = useAdminUrl();
  const search = url.read('q');
  const page = Math.max(0, Number(url.read('page')) || 0);
  const [draft, setDraft] = useState<string | null>(null);
  const list = useAdminQuery(findOperation(operations, 'get-exchange-items'), {
    query: { page, pageSize: PAGE_SIZE, ...(search ? { q: search } : {}) },
  });
  return (
    <section className={ui.panel} aria-label="Market items">
      <h3>Items on the market</h3>
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
          Search items
          <input type="search" value={draft ?? search} onChange={(event) => setDraft(event.target.value)} />
        </label>
        <button type="submit">Search</button>
      </form>
      <QueryState loading={list.loading} error={list.error} onRetry={list.refresh}>
        <Table value={list.data} caption="Market items" empty="No items match this search." />
        <nav className={ui.pager} aria-label="Market item pages">
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
      <p className={ui.stateLine}>
        Individual sell orders for one item:{' '}
        <Link href={adminHref('market', 'get-exchange-listings')}>open the order lookup</Link>.
      </p>
    </section>
  );
}

function Transactions({ operations }: { operations: AdminOperation[] }) {
  const url = useAdminUrl();
  const hours = HOURS.some(([value]) => value === url.read('hours')) ? url.read('hours') : '168';
  const party = ['all', 'player', 'bot', 'npc'].includes(url.read('party')) ? url.read('party') : 'all';
  const page = Math.max(0, Number(url.read('page')) || 0);
  const list = useAdminQuery(findOperation(operations, 'get-exchange-transactions'), {
    query: { page, pageSize: PAGE_SIZE, hours: Number(hours), party },
  });
  return (
    <section className={ui.panel} aria-label="Market transactions">
      <h3>Transactions</h3>
      <div className={ui.toolbar}>
        <label className={ui.field}>
          Time range
          <select value={hours} onChange={(event) => url.update({ hours: event.target.value, page: null })}>
            {HOURS.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className={ui.field}>
          Trader type
          <select value={party} onChange={(event) => url.update({ party: event.target.value, page: null })}>
            <option value="all">Everyone</option>
            <option value="player">Players</option>
            <option value="bot">Market bot</option>
            <option value="npc">NPC broker</option>
          </select>
        </label>
        <button type="button" onClick={list.refresh} disabled={list.loading}>
          Refresh
        </button>
      </div>
      <QueryState loading={list.loading} error={list.error} onRetry={list.refresh}>
        <Table value={list.data} caption="Market transactions" empty="No transactions in this range." />
        <nav className={ui.pager} aria-label="Transaction pages">
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
    </section>
  );
}

function Automation({ operations }: { operations: AdminOperation[] }) {
  const [notice, setNotice] = useState('');
  const [probe, setProbe] = useState<{ at: string; data: unknown } | null>(null);
  const [probing, setProbing] = useState(false);
  const [failure, setFailure] = useState('');
  const market = useAdminQuery(findOperation(operations, 'get-exchange-market'));
  const log = useAdminQuery(findOperation(operations, 'get-exchange-market-buyback-log'));
  const { act, dialog } = useConfirmedAction(operations, (message) => {
    setNotice(message);
    market.refresh();
    log.refresh();
  });
  async function runProbe() {
    const operation = findOperation(operations, 'post-exchange-market-buyback-probe');
    if (!operation || probing) return;
    setProbing(true);
    setFailure('');
    try {
      const outcome = await adminCall(operation, { body: {} });
      setProbe({ at: formatTimestamp(Date.now(), { variant: 'time' }), data: outcome.data });
    } catch (error) {
      setFailure((error as Error).message);
    } finally {
      setProbing(false);
    }
  }
  return (
    <>
      {notice && (
        <p role="status" className={ui.status}>
          {notice}
        </p>
      )}
      <section className={ui.panel} aria-label="Market automation state">
        <h3>Current automation</h3>
        <QueryState loading={market.loading} error={market.error} onRetry={market.refresh}>
          <Facts value={market.data} />
        </QueryState>
      </section>
      <section className={ui.panel} aria-label="Buyback probe">
        <h3>Probe a buyback</h3>
        <p className={ui.stateLine}>
          A probe previews what a buyback sweep would do with the saved settings. It changes nothing and is not a run.
        </p>
        <div className={ui.actions}>
          <button type="button" onClick={() => void runProbe()} disabled={probing}>
            {probing ? 'Probing…' : 'Run probe'}
          </button>
        </div>
        {failure && (
          <p role="alert" className={ui.error}>
            {failure}
          </p>
        )}
        {probe && (
          <>
            <p role="status" className={ui.status}>
              Probe result at {probe.at}. Nothing was bought or changed.
            </p>
            <Facts value={probe.data} />
          </>
        )}
      </section>
      <section className={ui.panel} aria-label="Manual runs">
        <h3>Run now</h3>
        <p className={ui.stateLine}>
          These run immediately outside the schedule. The Console may queue a run; a queued run has not completed.
        </p>
        <div className={ui.actions}>
          <button
            type="button"
            onClick={() =>
              act(
                'post-exchange-market-buyback-run',
                {},
                {
                  title: 'Run a buyback now',
                  confirmLabel: 'Run buyback',
                  target: 'Market buyback sweep',
                  consequences: [
                    'Buys eligible listings using the saved settings.',
                    'Purchases are completed transactions and cannot be reversed here.',
                  ],
                  done: 'Buyback run requested.',
                },
              )
            }
          >
            Run buyback…
          </button>
          <button
            type="button"
            onClick={() =>
              act(
                'post-exchange-market-seed-run',
                {},
                {
                  title: 'Run seeding now',
                  confirmLabel: 'Run seeding',
                  danger: false,
                  target: 'Market seeding',
                  consequences: ['Creates listings from the active seed plan.'],
                  done: 'Seeding run requested.',
                },
              )
            }
          >
            Run seeding…
          </button>
          <button
            type="button"
            className={ui.danger}
            onClick={() =>
              act(
                'post-exchange-market-seed-clear',
                { body: {} },
                {
                  title: 'Clear seeded listings',
                  confirmLabel: 'Clear listings',
                  phrase: 'CLEAR LISTINGS',
                  target: 'Listings from the saved seed schedule’s exchange',
                  consequences: [
                    'Clears listings on the saved seed schedule’s exchange.',
                    'Check the exchange and the Console’s rules for what is removed before confirming.',
                  ],
                  done: 'Listing clearing requested.',
                },
              )
            }
          >
            Clear seeded listings…
          </button>
        </div>
      </section>
      <section className={ui.panel} aria-label="Buyback log">
        <h3>Sweep log</h3>
        <QueryState loading={log.loading} error={log.error} onRetry={log.refresh}>
          <Table value={log.data} caption="Buyback sweep log" empty="The sweep log is empty." />
        </QueryState>
        <div className={ui.actions}>
          <button
            type="button"
            onClick={() =>
              act(
                'post-exchange-market-buyback-log-clear',
                {},
                {
                  title: 'Clear the sweep log',
                  confirmLabel: 'Clear log',
                  target: 'Buyback sweep log',
                  consequences: ['Deletes the recorded sweep history.', 'It does not undo any purchase.'],
                  done: 'Log cleared.',
                },
              )
            }
          >
            Clear log…
          </button>
        </div>
      </section>
      <section className={ui.panel} aria-label="Safety backups">
        <h3>Safety backups</h3>
        <p className={ui.stateLine}>
          Before market bot changes the Console can take a safety backup. Turning it off needs the Console’s phrase.
        </p>
        <div className={ui.actions}>
          <button
            type="button"
            onClick={() =>
              act(
                'post-exchange-market-settings',
                { body: { safetyBackups: true } },
                {
                  title: 'Turn safety backups on',
                  confirmLabel: 'Turn on',
                  danger: false,
                  target: 'Market bot safety backups',
                  consequences: ['A backup is taken before market bot changes.'],
                  done: 'Safety backups enabled.',
                },
              )
            }
          >
            Turn on…
          </button>
          <button
            type="button"
            className={ui.danger}
            onClick={() =>
              act(
                'post-exchange-market-settings',
                { body: { safetyBackups: false, confirmation: 'DISABLE MARKET BOT BACKUPS' } },
                {
                  title: 'Turn safety backups off',
                  confirmLabel: 'Turn off',
                  phrase: 'DISABLE MARKET BOT BACKUPS',
                  target: 'Market bot safety backups',
                  consequences: [
                    'Market bot changes run without a prior backup.',
                    'Mistakes cannot be rolled back from a backup.',
                  ],
                  done: 'Safety backups disabled.',
                },
              )
            }
          >
            Turn off…
          </button>
        </div>
      </section>
      <p className={ui.stateLine}>
        Buyback and seeding schedules, prices and item overrides have many linked fields:{' '}
        <Link href={adminHref('market', 'post-exchange-market-buyback-schedule')}>buyback schedule</Link>
        {' · '}
        <Link href={adminHref('market', 'post-exchange-market-seed-schedule')}>seeding schedule</Link>
        {' · '}
        <Link href={adminHref('market', 'post-exchange-market-items')}>item overrides</Link>.
      </p>
      {dialog}
    </>
  );
}

function Plans({ operations }: { operations: AdminOperation[] }) {
  const [notice, setNotice] = useState('');
  const [planId, setPlanId] = useState('');
  const [name, setName] = useState('');
  const { act, dialog } = useConfirmedAction(operations, setNotice);
  function activate(event: FormEvent) {
    event.preventDefault();
    if (!planId.trim()) return setNotice('Enter a plan ID.');
    act(
      'post-exchange-market-plans-active',
      { body: { planId: planId.trim() } },
      {
        title: 'Activate seed plan',
        confirmLabel: 'Activate plan',
        danger: false,
        target: `Plan ${planId.trim()}`,
        consequences: ['The next seeding run uses this plan.', 'Existing listings are not changed until seeding runs.'],
        done: 'Plan activated.',
      },
    );
  }
  function rename() {
    if (!planId.trim() || !name.trim()) return setNotice('Enter a plan ID and a new name.');
    act(
      'post-exchange-market-plans-name',
      { body: { planId: planId.trim(), name: name.trim() } },
      {
        title: 'Rename seed plan',
        confirmLabel: 'Rename plan',
        danger: false,
        target: `Plan ${planId.trim()}`,
        consequences: [`The plan’s friendly name becomes “${name.trim()}”.`],
        done: 'Plan renamed.',
      },
    );
  }
  return (
    <section className={ui.panel} aria-label="Seed plans">
      <h3>Seed plans</h3>
      {notice && (
        <p role="status" className={ui.status}>
          {notice}
        </p>
      )}
      <Read operations={operations} id="get-exchange-market-exchanges" title="Exchanges" kind="table" />
      <form onSubmit={activate}>
        <label className={ui.field}>
          Plan ID
          <input value={planId} onChange={(event) => setPlanId(event.target.value)} />
        </label>
        <label className={ui.field}>
          New name (for renaming)
          <input value={name} maxLength={80} onChange={(event) => setName(event.target.value)} />
        </label>
        <div className={ui.actions}>
          <button type="submit">Activate…</button>
          <button type="button" onClick={rename}>
            Rename…
          </button>
          <button
            type="button"
            onClick={() => {
              const operation = findOperation(operations, 'get-exchange-market-plans-csv');
              if (operation) {
                downloadAdmin(operation, { query: planId.trim() ? { planId: planId.trim() } : {} });
                setNotice('CSV export requested. Provider errors open in the download tab.');
              }
            }}
          >
            Export CSV
          </button>
        </div>
      </form>
      <p className={ui.stateLine}>
        Importing a plan from a CSV file uses the upload form:{' '}
        <Link href={adminHref('market', 'post-exchange-market-plans-csv')}>import a plan</Link>.
      </p>
      {dialog}
    </section>
  );
}

const ID = /^\d{1,30}$/;
function parseIds(value: string): string[] | null {
  const ids = value.split(/[\s,]+/).filter(Boolean);
  return ids.every((id) => ID.test(id)) ? ids : null;
}

function Sellers({ operations }: { operations: AdminOperation[] }) {
  const [notice, setNotice] = useState('');
  const [broker, setBroker] = useState(false);
  const [bots, setBots] = useState('');
  const [blocked, setBlocked] = useState('');
  const config = useAdminQuery(findOperation(operations, 'get-exchange-config'));
  const { act, dialog } = useConfirmedAction(operations, (message) => {
    setNotice(message);
    config.refresh();
  });
  function submit(event: FormEvent) {
    event.preventDefault();
    const botOwnerIds = parseIds(bots);
    const blacklistedOwnerIds = parseIds(blocked);
    if (!botOwnerIds || !blacklistedOwnerIds)
      return setNotice('Owner IDs must be numbers separated by spaces, commas or new lines.');
    act(
      'post-exchange-config',
      { body: { includeNpcBroker: broker, botOwnerIds, blacklistedOwnerIds } },
      {
        title: 'Save seller configuration',
        confirmLabel: 'Save configuration',
        danger: false,
        target: 'Market seller configuration',
        consequences: [
          `NPC broker listings are ${broker ? 'included' : 'excluded'}.`,
          `${botOwnerIds.length} market-bot owner ID(s) and ${blacklistedOwnerIds.length} blacklisted owner ID(s) replace the saved lists.`,
        ],
        done: 'Seller configuration saved.',
      },
    );
  }
  return (
    <section className={ui.panel} aria-label="Seller configuration">
      <h3>Sellers and blacklist</h3>
      {notice && (
        <p role="status" className={ui.status}>
          {notice}
        </p>
      )}
      <p className={ui.stateLine}>
        Current saved configuration is shown first. Saving replaces both ID lists, so enter the complete lists.
      </p>
      <QueryState loading={config.loading} error={config.error} onRetry={config.refresh}>
        <Facts value={config.data} />
      </QueryState>
      <form onSubmit={submit}>
        <label className={ui.field}>
          <span>
            <input type="checkbox" checked={broker} onChange={(event) => setBroker(event.target.checked)} /> Include the
            NPC broker
          </span>
        </label>
        <label className={ui.field}>
          Market bot owner IDs
          <textarea rows={3} value={bots} onChange={(event) => setBots(event.target.value)} />
        </label>
        <label className={ui.field}>
          Blacklisted owner IDs
          <textarea rows={3} value={blocked} onChange={(event) => setBlocked(event.target.value)} />
        </label>
        <button type="submit">Review…</button>
      </form>
      {dialog}
    </section>
  );
}

export default function MarketScreen({ operations }: { operations: AdminOperation[] }) {
  const url = useAdminUrl();
  const view = VIEWS.find(([id]) => id === url.read('view'))?.[0] ?? 'overview';
  return (
    <div className={ui.screen}>
      <div className={ui.subTabs} role="group" aria-label="Market views">
        {VIEWS.map(([id, label]) => (
          <button
            key={id}
            type="button"
            aria-pressed={id === view}
            onClick={() => url.update({ view: id === 'overview' ? null : id, q: null, page: null })}
          >
            {label}
          </button>
        ))}
      </div>
      {view === 'overview' && <Read operations={operations} id="get-exchange-stats" title="Market statistics" />}
      {view === 'items' && <Listings operations={operations} />}
      {view === 'transactions' && <Transactions operations={operations} />}
      {view === 'automation' && <Automation operations={operations} />}
      {view === 'plans' && <Plans operations={operations} />}
      {view === 'sellers' && <Sellers operations={operations} />}
    </div>
  );
}
