import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { adminCall, findOperation } from '../client';
import ConfirmDialog from '../components/ConfirmDialog';
import { Facts, QueryState, Table } from '../components/DataPanel';
import useAdminQuery from '../hooks/useAdminQuery';
import useAdminUrl from '../hooks/useAdminUrl';
import { useConfirmedAction } from '../hooks/useConfirmedAction';
import { adminHref } from '../navigation';
import { text, type Row } from '../records';
import type { AdminOperation } from '../types';
import css from '../styles/admin.module.css';

const VIEWS = [
  ['controls', 'Controls'],
  ['health', 'Health & diagnostics'],
  ['automation', 'Restarts & automation'],
  ['access', 'Title & Funcom token'],
] as const;

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

function Controls({ operations }: { operations: AdminOperation[] }) {
  const [notice, setNotice] = useState('');
  const status = useAdminQuery(findOperation(operations, 'get-server-status'), { query: { raw: 0 } });
  const services = useAdminQuery(findOperation(operations, 'get-server-services'));
  const protection = useAdminQuery(findOperation(operations, 'get-server-shutdown-protection'));
  const { act, dialog } = useConfirmedAction(operations, (message) => {
    setNotice(message);
    status.refresh();
    services.refresh();
    protection.refresh();
  });
  return (
    <>
      {notice && (
        <p role="status" className={css.status}>
          {notice}
        </p>
      )}
      <section className={css.panel} aria-label="Server status">
        <h3>Server status</h3>
        <QueryState loading={status.loading} error={status.error} onRetry={status.refresh}>
          <Facts value={status.data} />
        </QueryState>
        <div className={css.actions}>
          <button
            type="button"
            onClick={() =>
              act(
                'post-server-start',
                {},
                {
                  title: 'Start the server',
                  confirmLabel: 'Start server',
                  danger: false,
                  target: 'The whole game server',
                  consequences: [
                    'Asks the Console to start the game services.',
                    'Watch the status above; a start request is not the same as a ready server.',
                  ],
                  done: 'Start requested.',
                },
              )
            }
          >
            Start…
          </button>
          <button
            type="button"
            className={css.danger}
            onClick={() =>
              act(
                'post-server-restart',
                {},
                {
                  title: 'Restart the server',
                  confirmLabel: 'Restart server',
                  phrase: 'RESTART SERVER',
                  target: 'The whole game server',
                  consequences: [
                    'Disconnects every online player.',
                    'Unsaved progress since the last save may be lost.',
                    'Prefer a scheduled restart with a countdown under Restarts & automation.',
                  ],
                  done: 'Restart requested.',
                },
              )
            }
          >
            Restart…
          </button>
          <button
            type="button"
            className={css.danger}
            onClick={() =>
              act(
                'post-server-stop',
                {},
                {
                  title: 'Stop the server',
                  confirmLabel: 'Stop server',
                  phrase: 'STOP SERVER',
                  target: 'The whole game server',
                  consequences: [
                    'Disconnects every online player.',
                    'The server stays offline until it is started again.',
                  ],
                  done: 'Stop requested.',
                },
              )
            }
          >
            Stop…
          </button>
        </div>
      </section>
      <section className={css.panel} aria-label="Services">
        <h3>Services</h3>
        <QueryState loading={services.loading} error={services.error} onRetry={services.refresh}>
          <Table
            value={services.data}
            caption="Services"
            empty="No services were reported."
            action={(row: Row) => {
              const service = text(row, ['service', 'name', 'id']);
              return service ? (
                <button
                  aria-label={`Restart ${service}…`}
                  type="button"
                  className={css.danger}
                  onClick={() =>
                    act(
                      'post-server-restart-service',
                      { body: { service } },
                      {
                        title: 'Restart one service',
                        confirmLabel: 'Restart service',
                        target: service,
                        consequences: [
                          'Restarts only this service.',
                          'Players on maps that depend on it may be disconnected.',
                        ],
                        done: 'Service restart requested.',
                      },
                    )
                  }
                >
                  Restart…
                </button>
              ) : null;
            }}
          />
        </QueryState>
      </section>
      <section className={css.panel} aria-label="Shutdown protection">
        <h3>Shutdown protection</h3>
        <QueryState loading={protection.loading} error={protection.error} onRetry={protection.refresh}>
          <Facts value={protection.data} />
        </QueryState>
        <div className={css.actions}>
          {[true, false].map((enabled) => (
            <button
              key={String(enabled)}
              type="button"
              onClick={() =>
                act(
                  'post-server-shutdown-protection',
                  { body: { enabled } },
                  {
                    title: `Turn shutdown protection ${enabled ? 'on' : 'off'}`,
                    confirmLabel: enabled ? 'Turn on' : 'Turn off',
                    danger: !enabled,
                    target: 'Shutdown protection',
                    consequences: [
                      enabled
                        ? 'Protects the server from an unintended shutdown.'
                        : 'Removes that protection; the server can be shut down.',
                    ],
                    done: `Shutdown protection ${enabled ? 'enabled' : 'disabled'}.`,
                  },
                )
              }
            >
              Turn {enabled ? 'on' : 'off'}…
            </button>
          ))}
        </div>
      </section>
      {dialog}
    </>
  );
}

function Health({ operations }: { operations: AdminOperation[] }) {
  const [notice, setNotice] = useState('');
  const { act, dialog } = useConfirmedAction(operations, setNotice);
  return (
    <>
      {notice && (
        <p role="status" className={css.status}>
          {notice}
        </p>
      )}
      <Read operations={operations} id="get-server-readiness" title="Readiness" />
      <Read operations={operations} id="get-server-ports" title="Ports" kind="table" />
      <Read operations={operations} id="get-server-doctor" title="Server doctor" />
      <section className={css.panel} aria-label="Repairs and cleanup">
        <h3>Repairs and cleanup</h3>
        <div className={css.actions}>
          <button
            type="button"
            onClick={() =>
              act(
                'post-server-network-bind-fix',
                {},
                {
                  title: 'Repair network binding',
                  confirmLabel: 'Repair binding',
                  target: 'Server network binding',
                  consequences: [
                    'Runs the Console’s network-binding repair.',
                    'Run the server doctor first and repair only if it reports a binding problem.',
                  ],
                  done: 'Network-binding repair requested.',
                },
              )
            }
          >
            Repair network binding…
          </button>
          <button
            type="button"
            className={css.danger}
            onClick={() =>
              act(
                'post-server-storage-cleanup-images',
                { body: { confirmation: 'CLEAN OBSOLETE DUNE IMAGES' } },
                {
                  title: 'Remove obsolete Docker images',
                  confirmLabel: 'Remove images',
                  phrase: 'CLEAN OBSOLETE DUNE IMAGES',
                  target: 'Obsolete game images on the host',
                  consequences: [
                    'Deletes obsolete game images on the host to free disk space.',
                    'This cannot be undone from the dashboard.',
                  ],
                  done: 'Image cleanup requested.',
                },
              )
            }
          >
            Clean obsolete images…
          </button>
          <button
            type="button"
            className={css.danger}
            onClick={() =>
              act(
                'post-server-storage-cleanup-build-cache',
                { body: { confirmation: 'CLEAN DOCKER BUILD CACHE' } },
                {
                  title: 'Clear the Docker build cache',
                  confirmLabel: 'Clear cache',
                  phrase: 'CLEAN DOCKER BUILD CACHE',
                  target: 'Docker build cache on the host',
                  consequences: [
                    'Deletes the Docker build cache on the host to free disk space.',
                    'This cannot be undone from the dashboard.',
                  ],
                  done: 'Build-cache cleanup requested.',
                },
              )
            }
          >
            Clear build cache…
          </button>
        </div>
      </section>
      {dialog}
    </>
  );
}

function Automation({ operations }: { operations: AdminOperation[] }) {
  const [notice, setNotice] = useState('');
  const [enabled, setEnabled] = useState(true);
  const [time, setTime] = useState('');
  const [notify, setNotify] = useState('');
  const schedule = useAdminQuery(findOperation(operations, 'get-server-restart-schedule'));
  const queue = useAdminQuery(findOperation(operations, 'get-server-restart-queue'));
  const ipRestart = useAdminQuery(findOperation(operations, 'get-server-ip-change-restart'));
  const { act, dialog } = useConfirmedAction(operations, (message) => {
    setNotice(message);
    schedule.refresh();
    queue.refresh();
    ipRestart.refresh();
  });
  function saveSchedule(event: FormEvent) {
    event.preventDefault();
    const minutes = notify.trim() ? Number(notify) : undefined;
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) return setNotice('Enter the time as HH:MM (24-hour).');
    if (minutes !== undefined && (!Number.isSafeInteger(minutes) || minutes < 0))
      return setNotice('Notice minutes must be a whole number.');
    act(
      'post-server-restart-schedule',
      { body: { enabled, time, ...(minutes !== undefined ? { notifyMinutes: minutes } : {}) } },
      {
        title: 'Save restart schedule',
        confirmLabel: 'Save schedule',
        danger: false,
        target: 'Daily server restart',
        consequences: [
          enabled
            ? `The server restarts daily at ${time}${minutes !== undefined ? `, with ${minutes} minutes of warning` : ''}.`
            : 'Scheduled restarts are turned off.',
        ],
        done: 'Restart schedule saved.',
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
      <section className={css.panel} aria-label="Restart schedule">
        <h3>Restart schedule</h3>
        <QueryState loading={schedule.loading} error={schedule.error} onRetry={schedule.refresh}>
          <Facts value={schedule.data} />
        </QueryState>
        <form onSubmit={saveSchedule}>
          <label className={css.field}>
            <span>
              <input type="checkbox" checked={enabled} onChange={(event) => setEnabled(event.target.checked)} />{' '}
              Scheduled restarts enabled
            </span>
          </label>
          <div className={css.facts}>
            <label className={css.field}>
              Restart time (HH:MM)
              <input value={time} placeholder="04:00" onChange={(event) => setTime(event.target.value)} />
            </label>
            <label className={css.field}>
              Warning (minutes, optional)
              <input inputMode="numeric" value={notify} onChange={(event) => setNotify(event.target.value)} />
            </label>
          </div>
          <button type="submit">Review schedule…</button>
        </form>
      </section>
      <section className={css.panel} aria-label="Restart countdowns">
        <h3>Active countdowns</h3>
        <p className={css.stateLine}>A countdown is pending, not completed. Cancelling keeps the server running.</p>
        <QueryState loading={queue.loading} error={queue.error} onRetry={queue.refresh}>
          <Table
            value={queue.data}
            caption="Restart countdowns"
            empty="No restart is counting down."
            action={(row: Row) => {
              const id = text(row, ['id', 'queue_id', 'queueId']);
              return id ? (
                <span className={css.actions}>
                  <button
                    type="button"
                    onClick={() =>
                      act(
                        'post-server-restart-queue-cancel',
                        { body: { id } },
                        {
                          title: 'Cancel the restart countdown',
                          confirmLabel: 'Cancel countdown',
                          danger: false,
                          target: `Countdown ${id}`,
                          consequences: ['The restart will not happen.'],
                          done: 'Countdown cancelled.',
                        },
                      )
                    }
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className={css.danger}
                    onClick={() =>
                      act(
                        'post-server-restart-queue-restart-now',
                        { body: { id } },
                        {
                          title: 'Restart immediately',
                          confirmLabel: 'Restart now',
                          phrase: 'RESTART NOW',
                          target: `Countdown ${id}`,
                          consequences: [
                            'Skips the remaining countdown and restarts now.',
                            'Online players are disconnected.',
                          ],
                          done: 'Immediate restart requested.',
                        },
                      )
                    }
                  >
                    Restart now…
                  </button>
                </span>
              ) : null;
            }}
          />
        </QueryState>
      </section>
      <section className={css.panel} aria-label="IP-change restart">
        <h3>Restart when the public IP changes</h3>
        <QueryState loading={ipRestart.loading} error={ipRestart.error} onRetry={ipRestart.refresh}>
          <Facts value={ipRestart.data} />
        </QueryState>
        <div className={css.actions}>
          <button
            type="button"
            onClick={() =>
              act(
                'post-server-ip-change-restart-check',
                {},
                {
                  title: 'Check the public IP now',
                  confirmLabel: 'Run check',
                  danger: false,
                  target: 'Public IP check',
                  consequences: [
                    'Compares the current public IP with the saved one.',
                    'May queue a restart if it changed and the setting is enabled.',
                  ],
                  done: 'IP check requested.',
                },
              )
            }
          >
            Run IP check…
          </button>
          {[true, false].map((on) => (
            <button
              key={String(on)}
              type="button"
              onClick={() =>
                act(
                  'post-server-ip-change-restart',
                  { body: { enabled: on } },
                  {
                    title: `Turn IP-change restart ${on ? 'on' : 'off'}`,
                    confirmLabel: on ? 'Turn on' : 'Turn off',
                    danger: false,
                    target: 'IP-change restart',
                    consequences: [
                      on
                        ? 'A changed public IP triggers a restart.'
                        : 'A changed public IP no longer triggers a restart.',
                    ],
                    done: `IP-change restart ${on ? 'enabled' : 'disabled'}.`,
                  },
                )
              }
            >
              Turn {on ? 'on' : 'off'}…
            </button>
          ))}
        </div>
      </section>
      <p className={css.stateLine}>
        Countdown messages and checkpoints:{' '}
        <Link href={adminHref('server', 'post-server-restart-queue')} shallow>
          restart-queue settings
        </Link>
        . Automatic backups live under Backups.
      </p>
      {dialog}
    </>
  );
}

function Access({ operations }: { operations: AdminOperation[] }) {
  const [notice, setNotice] = useState('');
  const [title, setTitle] = useState('');
  const [token, setToken] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const { act, dialog } = useConfirmedAction(operations, setNotice);
  function saveTitle(event: FormEvent) {
    event.preventDefault();
    if (!title.trim() || title.length > 80) return setNotice('Enter a title of 1 to 80 characters.');
    act(
      'post-server-title',
      { body: { title: title.trim() } },
      {
        title: 'Change the server title',
        confirmLabel: 'Save title',
        danger: false,
        target: 'Server title',
        consequences: [
          `The title becomes “${title.trim()}”.`,
          'Check how and when the Console applies a title change before relying on it.',
        ],
        done: 'Title saved.',
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
      <section className={css.panel} aria-label="Server title">
        <h3>Server title</h3>
        <form onSubmit={saveTitle}>
          <label className={css.field}>
            New title
            <input value={title} maxLength={80} onChange={(event) => setTitle(event.target.value)} />
          </label>
          <button type="submit">Review…</button>
        </form>
      </section>
      <section className={css.panel} aria-label="Funcom token">
        <h3>Funcom token</h3>
        <p className={css.stateLine}>
          The token is sent once to the Console and is never stored or shown by the dashboard. The field is cleared
          after every attempt. Checking whether the token is accepted needs a time reference from the Console:{' '}
          <Link href={adminHref('server', 'get-server-funcom-token-check')} shallow>
            open the token check
          </Link>
          .
        </p>
        <label className={css.field}>
          Token
          <input type="password" autoComplete="off" value={token} onChange={(event) => setToken(event.target.value)} />
        </label>
        <button type="button" disabled={!token.trim() || submitting} onClick={() => setSubmitting(true)}>
          Submit token…
        </button>
      </section>
      {submitting && (
        <ConfirmDialog
          title="Submit Funcom token"
          target="Server Funcom token"
          danger={false}
          confirmLabel="Submit token"
          consequences={[
            'Sends a new Funcom token to the Console.',
            'A wrong token can leave the server unregistered; verify it afterwards.',
          ]}
          onCancel={() => setSubmitting(false)}
          onConfirm={async () => {
            const operation = findOperation(operations, 'post-server-funcom-token');
            if (!operation) throw new Error('This operation is unavailable.');
            try {
              await adminCall(operation, { body: { token: token.trim() } });
              setNotice('Token submitted. Verify it with the token check.');
              setSubmitting(false);
            } finally {
              setToken('');
            }
          }}
        />
      )}
      {dialog}
    </>
  );
}

export default function ServerScreen({ operations }: { operations: AdminOperation[] }) {
  const url = useAdminUrl();
  const view = VIEWS.find(([id]) => id === url.read('view'))?.[0] ?? 'controls';
  return (
    <div className={css.screen}>
      <div className={css.subTabs} role="group" aria-label="Server views">
        {VIEWS.map(([id, label]) => (
          <button
            key={id}
            type="button"
            aria-pressed={id === view}
            onClick={() => url.update({ view: id === 'controls' ? null : id })}
          >
            {label}
          </button>
        ))}
      </div>
      {view === 'controls' && <Controls operations={operations} />}
      {view === 'health' && <Health operations={operations} />}
      {view === 'automation' && <Automation operations={operations} />}
      {view === 'access' && <Access operations={operations} />}
    </div>
  );
}
