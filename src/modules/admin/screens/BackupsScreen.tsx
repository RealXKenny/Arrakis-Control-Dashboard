import { useState, type FormEvent } from 'react';
import { adminCall, downloadAdmin, findOperation } from '../client';
import ConfirmDialog from '../components/ConfirmDialog';
import { Facts, QueryState, Table } from '../components/DataPanel';
import useAdminQuery from '../hooks/useAdminQuery';
import useAdminUrl from '../hooks/useAdminUrl';
import { useConfirmedAction } from '../hooks/useConfirmedAction';
import { text, type Row } from '../records';
import type { AdminOperation } from '../types';
import css from '../styles/admin.module.css';

const VIEWS = [
  ['game', 'Game backups'],
  ['system', 'System backups'],
  ['schedule', 'Automatic schedule'],
] as const;
const NAME_KEYS = ['backup', 'name', 'filename', 'file', 'id'];

/** At least 12 characters and 5 distinct characters, matching the Console rule for system archives. */
export function passphraseProblem(value: string): string {
  if (value.length < 12 || value.length > 1024) return 'Use 12 to 1,024 characters.';
  if (new Set(value).size < 5) return 'Use at least 5 different characters.';
  return '';
}

function GameBackups({ operations }: { operations: AdminOperation[] }) {
  const [notice, setNotice] = useState('');
  const list = useAdminQuery(findOperation(operations, 'get-backups'));
  const { act, dialog } = useConfirmedAction(operations, (message) => {
    setNotice(message);
    list.refresh();
  });
  return (
    <section className={css.panel} aria-label="Game backups">
      <h3>Game backups</h3>
      <p className={css.stateLine}>
        Game backups capture the world data. Restoring one replaces current game data, so create a fresh backup first.
        Importing an external backup is available under Advanced tools.
      </p>
      {notice && (
        <p role="status" className={css.status}>
          {notice}
        </p>
      )}
      <div className={css.actions}>
        <button
          type="button"
          onClick={() =>
            act(
              'post-backups-create',
              {},
              {
                title: 'Create game backup',
                confirmLabel: 'Create backup',
                danger: false,
                target: 'Current game data',
                consequences: ['Creates a new backup of the current game data.', 'Large worlds can take a while.'],
                done: 'Backup requested.',
              },
            )
          }
        >
          Create backup…
        </button>
        <button type="button" onClick={list.refresh} disabled={list.loading}>
          Refresh
        </button>
      </div>
      <QueryState loading={list.loading} error={list.error} onRetry={list.refresh}>
        <Table
          value={list.data}
          caption="Game backups"
          empty="No game backups exist."
          action={(row: Row) => {
            const backup = text(row, NAME_KEYS);
            if (!backup) return null;
            return (
              <span className={css.actions}>
                <button
                  type="button"
                  onClick={() => {
                    const operation = findOperation(operations, 'get-backups-backup-download');
                    if (operation) {
                      downloadAdmin(operation, { path: { backup } });
                      setNotice('Download requested. Provider errors open in the download tab.');
                    }
                  }}
                >
                  Download
                </button>
                <button
                  type="button"
                  className={css.danger}
                  onClick={() =>
                    act(
                      'post-backups-restore',
                      { body: { backup } },
                      {
                        title: 'Restore game backup',
                        confirmLabel: 'Restore backup',
                        phrase: 'RESTORE',
                        target: backup,
                        consequences: [
                          'Replaces the current game data with this backup.',
                          'Anything changed since the backup was taken is lost.',
                          'The server may restart.',
                        ],
                        done: 'Restore requested.',
                      },
                    )
                  }
                >
                  Restore…
                </button>
                <button
                  type="button"
                  className={css.danger}
                  onClick={() =>
                    act(
                      'delete-backups-backup',
                      { path: { backup } },
                      {
                        title: 'Delete game backup',
                        confirmLabel: 'Delete backup',
                        target: backup,
                        consequences: ['Permanently deletes this backup file.'],
                        done: 'Backup deletion requested.',
                      },
                    )
                  }
                >
                  Delete…
                </button>
              </span>
            );
          }}
        />
      </QueryState>
      <div className={css.actions}>
        <button
          type="button"
          className={css.danger}
          onClick={() =>
            act(
              'post-backups-delete-all',
              {},
              {
                title: 'Delete every game backup',
                confirmLabel: 'Delete all backups',
                phrase: 'DELETE ALL BACKUPS',
                target: 'All game backups',
                consequences: ['Permanently deletes every game backup.', 'There is no undo.'],
                done: 'Deletion of all backups requested.',
              },
            )
          }
        >
          Delete all backups…
        </button>
      </div>
      {dialog}
    </section>
  );
}

type Restore = { name: string; passphrase: string; preview?: unknown; identityMode: string; auditLogMode: string };

function SystemBackups({ operations }: { operations: AdminOperation[] }) {
  const [notice, setNotice] = useState('');
  const list = useAdminQuery(findOperation(operations, 'get-backups-system'));
  const [creating, setCreating] = useState(false);
  const [passphrase, setPassphrase] = useState('');
  const [again, setAgain] = useState('');
  const [previewing, setPreviewing] = useState<string | null>(null);
  const [applying, setApplying] = useState(false);
  const [restore, setRestore] = useState<Restore | null>(null);
  const { act, dialog } = useConfirmedAction(operations, (message) => {
    setNotice(message);
    list.refresh();
  });
  const problem = passphraseProblem(passphrase) || (passphrase !== again ? 'The passphrases do not match.' : '');

  function closeCreate() {
    setCreating(false);
    setPassphrase('');
    setAgain('');
  }
  return (
    <section className={css.panel} aria-label="System backups">
      <h3>Encrypted system backups</h3>
      <p className={css.stateLine}>
        System archives are encrypted with a passphrase you choose. The dashboard never stores the passphrase or shows
        archive contents; losing it makes an archive unrecoverable.
      </p>
      {notice && (
        <p role="status" className={css.status}>
          {notice}
        </p>
      )}
      <div className={css.actions}>
        <button type="button" onClick={() => setCreating(true)}>
          Create encrypted backup…
        </button>
        <button type="button" onClick={list.refresh} disabled={list.loading}>
          Refresh
        </button>
      </div>
      <QueryState loading={list.loading} error={list.error} onRetry={list.refresh}>
        <Table
          value={list.data}
          caption="System backups"
          empty="No system backups exist."
          action={(row: Row) => {
            const name = text(row, NAME_KEYS);
            if (!name) return null;
            return (
              <span className={css.actions}>
                <button
                  type="button"
                  onClick={() => {
                    const operation = findOperation(operations, 'get-backups-system-name-download');
                    if (operation) {
                      downloadAdmin(operation, { path: { name } });
                      setNotice('Download requested. Provider errors open in the download tab.');
                    }
                  }}
                >
                  Download
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setPassphrase('');
                    setPreviewing(name);
                  }}
                >
                  Preview restore…
                </button>
                <button
                  type="button"
                  className={css.danger}
                  onClick={() =>
                    act(
                      'delete-backups-system-name',
                      { path: { name } },
                      {
                        title: 'Delete system backup',
                        confirmLabel: 'Delete backup',
                        target: name,
                        consequences: ['Permanently deletes this encrypted archive.'],
                        done: 'Backup deletion requested.',
                      },
                    )
                  }
                >
                  Delete…
                </button>
              </span>
            );
          }}
        />
      </QueryState>
      {restore && (
        <section className={css.panel} aria-label="Restore preview">
          <h3>Restore preview: {restore.name}</h3>
          <p className={css.notice}>
            This is only a preview; nothing has changed. Review it, choose how identity and audit-log data are handled,
            then apply explicitly. Applying restarts services as the Console requires.
          </p>
          <Facts value={restore.preview} />
          <div className={css.toolbar}>
            <label className={css.field}>
              Identity data (users and sign-in)
              <select
                value={restore.identityMode}
                onChange={(event) => setRestore({ ...restore, identityMode: event.target.value })}
              >
                <option value="keep-current">Keep current identity data</option>
                <option value="adopt-backup">Adopt the backup’s identity data</option>
              </select>
            </label>
            <label className={css.field}>
              Audit log
              <select
                value={restore.auditLogMode}
                onChange={(event) => setRestore({ ...restore, auditLogMode: event.target.value })}
              >
                <option value="keep-current">Keep current audit log</option>
                <option value="adopt-backup">Adopt the backup’s audit log</option>
              </select>
            </label>
          </div>
          <div className={css.actions}>
            <button type="button" className={css.danger} onClick={() => setApplying(true)}>
              Apply restore…
            </button>
            <button type="button" onClick={() => setRestore(null)}>
              Discard preview
            </button>
          </div>
        </section>
      )}
      {creating && (
        <ConfirmDialog
          title="Create encrypted backup"
          target="Current system data"
          danger={false}
          disabled={Boolean(problem)}
          confirmLabel="Create backup"
          consequences={[
            'Creates an encrypted archive of system data.',
            'Keep the passphrase safe; it cannot be recovered.',
          ]}
          onCancel={closeCreate}
          onConfirm={async () => {
            const operation = findOperation(operations, 'post-backups-system-create');
            if (!operation) throw new Error('This operation is unavailable.');
            try {
              await adminCall(operation, { body: { passphrase } });
              setNotice('Encrypted backup requested.');
              list.refresh();
              closeCreate();
            } finally {
              setPassphrase('');
              setAgain('');
            }
          }}
        >
          <label className={css.field}>
            Passphrase
            <input
              type="password"
              autoComplete="new-password"
              value={passphrase}
              onChange={(event) => setPassphrase(event.target.value)}
            />
          </label>
          <label className={css.field}>
            Repeat passphrase
            <input
              type="password"
              autoComplete="new-password"
              value={again}
              onChange={(event) => setAgain(event.target.value)}
            />
          </label>
          {passphrase && problem && <p className={css.stateLine}>{problem}</p>}
        </ConfirmDialog>
      )}
      {previewing && (
        <ConfirmDialog
          title="Preview system restore"
          target={previewing}
          danger={false}
          disabled={Boolean(passphraseProblem(passphrase))}
          confirmLabel="Show preview"
          consequences={[
            'Decrypts the archive to show what a restore would change.',
            'Nothing is applied by this step.',
          ]}
          onCancel={() => {
            setPreviewing(null);
            setPassphrase('');
          }}
          onConfirm={async () => {
            const operation = findOperation(operations, 'post-backups-system-name-restore');
            if (!operation) throw new Error('This operation is unavailable.');
            const outcome = await adminCall(operation, {
              path: { name: previewing },
              body: { passphrase, apply: false },
            });
            setRestore({
              name: previewing,
              passphrase,
              preview: outcome.data,
              identityMode: 'keep-current',
              auditLogMode: 'keep-current',
            });
            setPreviewing(null);
            setPassphrase('');
          }}
        >
          <label className={css.field}>
            Archive passphrase
            <input
              type="password"
              autoComplete="off"
              value={passphrase}
              onChange={(event) => setPassphrase(event.target.value)}
            />
          </label>
        </ConfirmDialog>
      )}
      {applying && restore && (
        <ConfirmDialog
          title="Apply system restore"
          target={restore.name}
          phrase="APPLY RESTORE"
          confirmLabel="Apply restore"
          consequences={[
            `Identity data: ${restore.identityMode === 'adopt-backup' ? 'replaced by the backup' : 'current data kept'}.`,
            `Audit log: ${restore.auditLogMode === 'adopt-backup' ? 'replaced by the backup' : 'current log kept'}.`,
            'Services restart as the Console requires. Players are disconnected.',
            'This cannot be undone; create a backup first.',
          ]}
          onCancel={() => setApplying(false)}
          onConfirm={async () => {
            const operation = findOperation(operations, 'post-backups-system-name-restore');
            if (!operation) throw new Error('This operation is unavailable.');
            try {
              const outcome = await adminCall(operation, {
                path: { name: restore.name },
                body: {
                  passphrase: restore.passphrase,
                  apply: true,
                  identityMode: restore.identityMode,
                  auditLogMode: restore.auditLogMode,
                },
              });
              setNotice(
                `Restore requested.${outcome.upstreamStatus === 202 ? ' The Console queued it; it has not completed yet.' : ''}`,
              );
              setApplying(false);
              setRestore(null);
            } catch (error) {
              // The passphrase is not kept after an attempt; preview again to retry deliberately.
              setApplying(false);
              setRestore(null);
              throw error;
            }
          }}
        />
      )}
      {dialog}
    </section>
  );
}

function Schedule({ operations }: { operations: AdminOperation[] }) {
  const [notice, setNotice] = useState('');
  const [enabled, setEnabled] = useState(true);
  const [time, setTime] = useState('');
  const [retention, setRetention] = useState('');
  const [interval, setInterval] = useState('');
  const current = useAdminQuery(findOperation(operations, 'get-backups-auto'));
  const { act, dialog } = useConfirmedAction(operations, (message) => {
    setNotice(message);
    current.refresh();
  });
  function submit(event: FormEvent) {
    event.preventDefault();
    const retentionDays = Number(retention);
    const intervalHours = Number(interval);
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) return setNotice('Enter the time as HH:MM (24-hour).');
    if (!Number.isSafeInteger(retentionDays) || retentionDays < 1)
      return setNotice('Retention must be a whole number of days.');
    if (!Number.isSafeInteger(intervalHours) || intervalHours < 1)
      return setNotice('The interval must be a whole number of hours.');
    act(
      'post-backups-auto',
      { body: { enabled, time, retentionDays, intervalHours } },
      {
        title: 'Save backup schedule',
        confirmLabel: 'Save schedule',
        danger: false,
        target: 'Automatic game backups',
        consequences: [
          enabled ? `Backups run every ${intervalHours} h starting at ${time}.` : 'Automatic backups are turned off.',
          `Backups older than ${retentionDays} days are removed.`,
        ],
        done: 'Schedule saved.',
      },
    );
  }
  return (
    <section className={css.panel} aria-label="Automatic backup schedule">
      <h3>Automatic schedule</h3>
      {notice && (
        <p role="status" className={css.status}>
          {notice}
        </p>
      )}
      <QueryState loading={current.loading} error={current.error} onRetry={current.refresh}>
        <Facts value={current.data} />
      </QueryState>
      <form onSubmit={submit}>
        <label className={css.field}>
          <span>
            <input type="checkbox" checked={enabled} onChange={(event) => setEnabled(event.target.checked)} /> Automatic
            backups enabled
          </span>
        </label>
        <div className={css.facts}>
          <label className={css.field}>
            Start time (HH:MM)
            <input value={time} placeholder="03:00" onChange={(event) => setTime(event.target.value)} />
          </label>
          <label className={css.field}>
            Repeat every (hours)
            <input inputMode="numeric" value={interval} onChange={(event) => setInterval(event.target.value)} />
          </label>
          <label className={css.field}>
            Keep backups for (days)
            <input inputMode="numeric" value={retention} onChange={(event) => setRetention(event.target.value)} />
          </label>
        </div>
        <button type="submit">Review schedule…</button>
      </form>
      {dialog}
    </section>
  );
}

export default function BackupsScreen({ operations }: { operations: AdminOperation[] }) {
  const url = useAdminUrl();
  const view = VIEWS.find(([id]) => id === url.read('view'))?.[0] ?? 'game';
  return (
    <div className={css.screen}>
      <div className={css.subTabs} role="group" aria-label="Backup views">
        {VIEWS.map(([id, label]) => (
          <button
            key={id}
            type="button"
            aria-pressed={id === view}
            onClick={() => url.update({ view: id === 'game' ? null : id })}
          >
            {label}
          </button>
        ))}
      </div>
      {view === 'game' && <GameBackups operations={operations} />}
      {view === 'system' && <SystemBackups operations={operations} />}
      {view === 'schedule' && <Schedule operations={operations} />}
    </div>
  );
}
