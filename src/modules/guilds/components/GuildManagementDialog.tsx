import { useEffect, useRef, useState } from 'react';
import type { GuildManagement } from '../hooks/useGuildManagement';
import { guildMemberName, guildMemberRole } from '../members';
import css from '../styles/management.module.css';

export default function GuildManagementDialog({
  management,
  guildName,
}: {
  management: GuildManagement;
  guildName: string;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const previous = useRef<HTMLElement | null>(null);
  const [playerId, setPlayerId] = useState('');
  const [roleId, setRoleId] = useState('1');
  const [confirmation, setConfirmation] = useState('');
  const selected = management.selection;
  useEffect(() => {
    setPlayerId('');
    setRoleId('1');
    setConfirmation('');
    if (selected && dialog.current && !dialog.current.open) {
      previous.current = document.activeElement as HTMLElement;
      dialog.current.showModal();
    }
    if (!selected && dialog.current?.open) {
      dialog.current.close();
      if (previous.current?.isConnected) previous.current.focus();
    }
  }, [selected]);
  const member = selected && 'member' in selected ? selected.member : null;
  const name = member ? guildMemberName(member) : '';
  const role = member ? guildMemberRole(member) : null;
  return (
    <dialog
      ref={dialog}
      className={css.dialog}
      aria-labelledby="guild-management-title"
      onCancel={(event) => {
        event.preventDefault();
        management.close();
      }}
    >
      <h2 id="guild-management-title">
        {selected?.kind === 'add'
          ? 'Add guild member'
          : selected?.kind === 'disband'
            ? `Disband ${guildName}`
            : `Manage ${name}`}
      </h2>
      {management.error && <p role="alert">{management.error}</p>}
      {selected?.kind === 'member' && member && (
        <div className={css.actions}>
          {role === 1 && (
            <button disabled={management.busy} onClick={() => void management.execute('promote', member)}>
              Promote to Officer
            </button>
          )}
          {role === 50 && (
            <>
              <button disabled={management.busy} onClick={() => void management.execute('demote', member)}>
                Demote to Member
              </button>
              <button disabled={management.busy} onClick={() => management.open({ kind: 'transfer', member })}>
                Transfer leadership
              </button>
            </>
          )}
          {role !== 100 && (
            <button disabled={management.busy} onClick={() => management.open({ kind: 'remove', member })}>
              Remove from guild
            </button>
          )}
        </div>
      )}
      {selected?.kind === 'remove' && member && (
        <>
          <p>
            Remove {name} from {guildName}?
          </p>
          <button
            disabled={management.busy}
            onClick={() => void management.execute('remove', member, { confirmation: 'REMOVE MEMBER' })}
          >
            Confirm removal
          </button>
        </>
      )}
      {selected?.kind === 'transfer' && member && (
        <>
          <p>
            Make {name} the guild leader? You will be demoted and lose access to leader controls. Online players may
            need to relog.
          </p>
          <button
            disabled={management.busy}
            onClick={() => void management.execute('promote', member, { confirmation: 'TRANSFER LEADERSHIP' })}
          >
            Confirm leadership transfer
          </button>
        </>
      )}
      {selected?.kind === 'add' && (
        <form
          className={css.form}
          onSubmit={(event) => {
            event.preventDefault();
            void management.execute('add', undefined, { playerId: playerId.trim(), roleId: Number(roleId) });
          }}
        >
          <p>
            The player must be guildless and have a compatible faction. The live server’s guild member limit applies.
          </p>
          <label>
            Player ID
            <input
              required
              maxLength={128}
              pattern="[a-zA-Z0-9_-]+"
              value={playerId}
              onChange={(event) => setPlayerId(event.target.value)}
            />
          </label>
          <label>
            Starting rank
            <select value={roleId} onChange={(event) => setRoleId(event.target.value)}>
              <option value="1">Member</option>
              <option value="50">Officer</option>
            </select>
          </label>
          <button disabled={management.busy} type="submit">
            Add member
          </button>
        </form>
      )}
      {selected?.kind === 'disband' && (
        <form
          className={css.form}
          onSubmit={(event) => {
            event.preventDefault();
            void management.execute('disband', undefined, { confirmation });
          }}
        >
          <p>
            This permanently disbands {guildName} and removes its members. Its saved recruitment listing, applications,
            and chats will also be removed.
          </p>
          <label>
            Type DISBAND GUILD to confirm
            <input
              required
              value={confirmation}
              maxLength={32}
              onChange={(event) => setConfirmation(event.target.value)}
              autoComplete="off"
            />
          </label>
          <button disabled={management.busy || confirmation !== 'DISBAND GUILD'} type="submit">
            Permanently disband guild
          </button>
        </form>
      )}
      {management.busy && <p role="status">Updating guild…</p>}
      <button className={css.cancel} disabled={management.busy} onClick={management.close}>
        Cancel
      </button>
    </dialog>
  );
}
