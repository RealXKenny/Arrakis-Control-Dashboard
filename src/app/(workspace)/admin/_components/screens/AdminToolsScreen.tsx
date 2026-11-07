import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { QueryState, ReadPanel, Table } from '../parts/DataPanel';
import useAdminQuery from '../hooks/useAdminQuery';
import useAdminUrl from '../hooks/useAdminUrl';
import { useConfirmedAction } from '../hooks/useConfirmedAction';
import { findOperation } from '../../../../../features/admin/client';
import { adminHref } from '../../../../../features/admin/navigation';
import type { AdminOperation } from '../../../../../features/admin/types';
import { ui } from '../ui';

const VIEWS = [
  ['communications', 'Communications'],
  ['catalogs', 'Catalogs'],
  ['landsraad', 'Landsraad'],
  ['settings', 'Messages & transfers'],
  ['history', 'Administrator history'],
] as const;

function Communications({ operations }: { operations: AdminOperation[] }) {
  const [notice, setNotice] = useState('');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [duration, setDuration] = useState('10');
  const [mapName, setMapName] = useState('');
  const [dimension, setDimension] = useState('');
  const [chat, setChat] = useState('');
  const { act, dialog } = useConfirmedAction(operations, setNotice);
  function broadcast(event: FormEvent) {
    event.preventDefault();
    const seconds = Number(duration);
    if (!title.trim() || !body.trim() || !Number.isSafeInteger(seconds) || seconds < 1 || seconds > 600)
      return setNotice('Enter a title, a message and a duration of 1 to 600 seconds.');
    act(
      'post-admin-broadcast',
      { body: { title: title.trim(), body: body.trim(), durationSec: seconds } },
      {
        title: 'Send a server broadcast',
        confirmLabel: 'Send broadcast',
        danger: false,
        target: `“${title.trim()}” for ${seconds} seconds`,
        consequences: [
          'Sends this message through the Console’s server broadcast.',
          'Delivery scope is decided by the Console; the dashboard cannot recall a sent message.',
          body.trim().slice(0, 160),
        ],
        done: 'Broadcast sent.',
      },
    );
  }
  function mapChat(event: FormEvent) {
    event.preventDefault();
    if (!mapName.trim() || !dimension.trim() || !chat.trim())
      return setNotice('Enter the map, its dimension and a message.');
    act(
      'post-admin-map-chat',
      { body: { mapName: mapName.trim(), dimension: dimension.trim(), body: chat.trim() } },
      {
        title: 'Send a map chat message',
        confirmLabel: 'Send message',
        danger: false,
        target: `Map ${mapName.trim()}, dimension ${dimension.trim()}`,
        consequences: [
          'Posts this message into that map’s chat through the Console.',
          'A sent message cannot be recalled.',
          chat.trim().slice(0, 160),
        ],
        done: 'Map chat message sent.',
      },
    );
  }
  return (
    <>
      {notice && (
        <p role="status" className={ui.status}>
          {notice}
        </p>
      )}
      <section className={ui.panel} aria-label="Server broadcast">
        <h3>Server broadcast</h3>
        <p className={ui.stateLine}>
          These are Console messages shown in the game. Private guild support chats are separate and live under Players
          &amp; community → Guilds.
        </p>
        <form onSubmit={broadcast}>
          <label className={ui.field}>
            Title
            <input value={title} maxLength={80} onChange={(event) => setTitle(event.target.value)} />
          </label>
          <label className={ui.field}>
            Message
            <textarea rows={3} maxLength={500} value={body} onChange={(event) => setBody(event.target.value)} />
          </label>
          <label className={ui.field}>
            Show for (seconds)
            <input inputMode="numeric" value={duration} onChange={(event) => setDuration(event.target.value)} />
          </label>
          <button type="submit">Review…</button>
        </form>
      </section>
      <section className={ui.panel} aria-label="Map chat">
        <h3>Map chat</h3>
        <form onSubmit={mapChat}>
          <div className={ui.facts}>
            <label className={ui.field}>
              Map name
              <input value={mapName} onChange={(event) => setMapName(event.target.value)} />
            </label>
            <label className={ui.field}>
              Dimension
              <input value={dimension} onChange={(event) => setDimension(event.target.value)} />
            </label>
          </div>
          <label className={ui.field}>
            Message
            <textarea rows={2} maxLength={300} value={chat} onChange={(event) => setChat(event.target.value)} />
          </label>
          <button type="submit">Review…</button>
        </form>
      </section>
      <p className={ui.stateLine}>
        Shutdown notices need their own type and confirmation:{' '}
        <Link href={adminHref('tools', 'post-admin-broadcast-shutdown')}>send a shutdown notice</Link>.
      </p>
      {dialog}
    </>
  );
}

function Catalog({
  operations,
  id,
  title,
  searchLabel,
  limited,
}: {
  operations: AdminOperation[];
  id: string;
  title: string;
  searchLabel: string;
  limited?: boolean;
}) {
  const url = useAdminUrl();
  const search = url.read('q');
  const [draft, setDraft] = useState<string | null>(null);
  const list = useAdminQuery(findOperation(operations, id), {
    query: { ...(search ? { q: search } : {}), ...(limited ? { limit: 50 } : {}) },
  });
  return (
    <section className={ui.panel} aria-label={title}>
      <h3>{title}</h3>
      <form
        className={ui.toolbar}
        role="search"
        onSubmit={(event) => {
          event.preventDefault();
          url.update({ q: draft ?? search });
          setDraft(null);
        }}
      >
        <label className={ui.field}>
          {searchLabel}
          <input type="search" value={draft ?? search} onChange={(event) => setDraft(event.target.value)} />
        </label>
        <button type="submit">Search</button>
      </form>
      <QueryState loading={list.loading} error={list.error} onRetry={list.refresh}>
        <Table value={list.data} caption={title} empty="Nothing matches this search." />
      </QueryState>
    </section>
  );
}

function Catalogs({ operations }: { operations: AdminOperation[] }) {
  const url = useAdminUrl();
  const kind = ['vehicles', 'skills'].includes(url.read('catalog')) ? url.read('catalog') : 'items';
  return (
    <>
      <div className={ui.subTabs} role="group" aria-label="Catalog type">
        {[
          ['items', 'Items'],
          ['vehicles', 'Vehicles'],
          ['skills', 'Skill modules'],
        ].map(([id, label]) => (
          <button
            key={id}
            type="button"
            aria-pressed={id === kind}
            onClick={() => url.update({ catalog: id === 'items' ? null : id, q: null })}
          >
            {label}
          </button>
        ))}
      </div>
      <p className={ui.stateLine}>Use these to look up exact names and IDs before granting or editing.</p>
      {kind === 'items' && (
        <Catalog
          operations={operations}
          id="get-admin-items-catalog"
          title="Item catalog"
          searchLabel="Search items"
          limited
        />
      )}
      {kind === 'vehicles' && (
        <Catalog
          operations={operations}
          id="get-admin-vehicles"
          title="Vehicle catalog"
          searchLabel="Search vehicles"
        />
      )}
      {kind === 'skills' && (
        <Catalog
          operations={operations}
          id="get-admin-skill-modules"
          title="Skill-module catalog"
          searchLabel="Search skill modules"
        />
      )}
    </>
  );
}

function Landsraad({ operations }: { operations: AdminOperation[] }) {
  const [notice, setNotice] = useState('');
  const [taskId, setTaskId] = useState('');
  const [goal, setGoal] = useState('');
  const { act, dialog } = useConfirmedAction(operations, setNotice);
  function submit(event: FormEvent) {
    event.preventDefault();
    const amount = Number(goal);
    if (!/^\d{1,20}$/.test(taskId.trim()) || !Number.isFinite(amount) || amount <= 0)
      return setNotice('Enter a numeric task ID and a goal above zero.');
    act(
      'post-admin-landsraad-task-goal',
      { body: { taskId: taskId.trim(), goalAmount: amount } },
      {
        title: 'Change a task goal',
        confirmLabel: 'Save goal',
        danger: false,
        target: `Landsraad task ${taskId.trim()}`,
        consequences: [`The goal becomes ${amount.toLocaleString()}.`, 'Existing contributions are not changed.'],
        done: 'Task goal saved.',
      },
    );
  }
  return (
    <>
      {notice && (
        <p role="status" className={ui.status}>
          {notice}
        </p>
      )}
      <ReadPanel
        operations={operations}
        id="get-admin-landsraad"
        title="Landsraad overview"
        kind="table"
        empty="The Console reported no Landsraad tasks."
      />
      <ReadPanel operations={operations} id="get-admin-landsraad-milestone-preset" title="Milestone preset" />
      <section className={ui.panel} aria-label="Task goal">
        <h3>Change a task goal</h3>
        <form onSubmit={submit}>
          <div className={ui.facts}>
            <label className={ui.field}>
              Task ID
              <input inputMode="numeric" value={taskId} onChange={(event) => setTaskId(event.target.value)} />
            </label>
            <label className={ui.field}>
              New goal
              <input inputMode="numeric" value={goal} onChange={(event) => setGoal(event.target.value)} />
            </label>
          </div>
          <button type="submit">Review…</button>
        </form>
        <p className={ui.stateLine}>
          Milestone thresholds, whole-term goals, reward tiers and player contributions have more linked fields:{' '}
          <Link href={adminHref('tools', 'post-admin-landsraad-milestone-preset')}>milestone preset</Link>
          {' · '}
          <Link href={adminHref('tools', 'post-admin-landsraad-term-task-goals')}>term goals</Link>
          {' · '}
          <Link href={adminHref('tools', 'post-admin-landsraad-reward-tier')}>reward tier</Link>
          {' · '}
          <Link href={adminHref('tools', 'post-admin-landsraad-player-contribution')}>player contribution</Link>.
        </p>
      </section>
      {dialog}
    </>
  );
}

const SETTINGS: [string, string, string][] = [
  ['get-admin-message-of-the-day', 'post-admin-message-of-the-day', 'Message of the day'],
  ['get-admin-player-announcements', 'post-admin-player-announcements', 'Player announcements'],
  ['get-admin-character-transfer-settings', 'post-admin-character-transfer-settings', 'Character transfers'],
];

function Messages({ operations }: { operations: AdminOperation[] }) {
  const [notice, setNotice] = useState('');
  const { act, dialog } = useConfirmedAction(operations, setNotice);
  return (
    <>
      {notice && (
        <p role="status" className={ui.status}>
          {notice}
        </p>
      )}
      {SETTINGS.map(([read, write, label]) => (
        <section key={read} className={ui.panel} aria-label={label}>
          <ReadPanel operations={operations} id={read} title={label} />
          <div className={ui.actions}>
            <button
              type="button"
              className={ui.danger}
              onClick={() =>
                act(
                  write,
                  { body: { restoreDefaults: true } },
                  {
                    title: `Restore ${label.toLowerCase()} defaults`,
                    confirmLabel: 'Restore defaults',
                    target: label,
                    consequences: [
                      'Replaces the saved settings with the Console defaults.',
                      'Your current wording and values are lost.',
                    ],
                    done: 'Defaults restored.',
                  },
                )
              }
            >
              Restore defaults…
            </button>
            <Link href={adminHref('tools', write)}>Edit settings</Link>
          </div>
        </section>
      ))}
      {dialog}
    </>
  );
}

function History({ operations }: { operations: AdminOperation[] }) {
  const [notice, setNotice] = useState('');
  const { act, dialog } = useConfirmedAction(operations, setNotice);
  return (
    <>
      {notice && (
        <p role="status" className={ui.status}>
          {notice}
        </p>
      )}
      <ReadPanel
        operations={operations}
        id="get-admin-history"
        title="Administrator history"
        kind="table"
        empty="No administrator history was reported."
      />
      <p className={ui.stateLine}>
        This is only what the Console chooses to record. It is not a full audit of everything administrators did.
      </p>
      <div className={ui.actions}>
        <button
          type="button"
          className={ui.danger}
          onClick={() =>
            act(
              'post-admin-history-clear',
              { body: { scope: 'admin-tools' } },
              {
                title: 'Clear administrator-tool history',
                confirmLabel: 'Clear history',
                phrase: 'CLEAR HISTORY',
                target: 'Administrator-tool history',
                consequences: ['Deletes the recorded history of administrator-tool actions.', 'This cannot be undone.'],
                done: 'History cleared.',
              },
            )
          }
        >
          Clear tool history…
        </button>
      </div>
      {dialog}
    </>
  );
}

export default function AdminToolsScreen({ operations }: { operations: AdminOperation[] }) {
  const url = useAdminUrl();
  const view = VIEWS.find(([id]) => id === url.read('view'))?.[0] ?? 'communications';
  return (
    <div className={ui.screen}>
      <div className={ui.subTabs} role="group" aria-label="Administrator tool views">
        {VIEWS.map(([id, label]) => (
          <button
            key={id}
            type="button"
            aria-pressed={id === view}
            onClick={() => url.update({ view: id === 'communications' ? null : id, q: null, catalog: null })}
          >
            {label}
          </button>
        ))}
      </div>
      {view === 'communications' && <Communications operations={operations} />}
      {view === 'catalogs' && <Catalogs operations={operations} />}
      {view === 'landsraad' && <Landsraad operations={operations} />}
      {view === 'settings' && <Messages operations={operations} />}
      {view === 'history' && <History operations={operations} />}
    </div>
  );
}
