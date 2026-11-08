'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { memberActions, type GuildMemberView, type MemberAction } from '../members';
import { dangerButton, Field, FormMessage, inputClass } from '../../../components/ui/form-controls';
import { Modal } from './modal';
import { changeNotes, useMutation } from './mutation';

const guildPath = (guildId: string) => `/api/guilds/${encodeURIComponent(guildId)}`;

/**
 * Manage one roster row. The browser only names the action and the rank it saw (`expectedRole`);
 * the server re-reads the roster, re-verifies the leader and rejects a stale or forbidden change.
 */
export function MemberManageButton({
  guildId,
  guildName,
  member,
  onDone,
}: {
  guildId: string;
  guildName: string;
  member: GuildMemberView;
  onDone: (message: string) => void;
}) {
  const router = useRouter();
  const mutation = useMutation();
  const [open, setOpen] = useState<MemberAction | 'menu' | null>(null);
  const actions = memberActions(member);
  if (actions.length === 0 || !member.id) {
    return (
      <span className="font-mono text-[0.625rem] uppercase tracking-widest text-sand-600">
        {member.roleId === 100 ? 'Leader' : '—'}
      </span>
    );
  }
  const playerId = member.id;

  function close() {
    if (!mutation.busy) {
      mutation.clearError();
      setOpen(null);
    }
  }

  async function act(action: 'promote' | 'demote' | 'remove', confirmation?: string, done = 'Rank updated.') {
    const base = `${guildPath(guildId)}/members/${encodeURIComponent(playerId)}`;
    const result = await mutation.run(
      action === 'remove' ? 'DELETE' : 'POST',
      action === 'remove' ? base : `${base}/${action}`,
      {
        expectedRole: member.roleId,
        ...(confirmation ? { confirmation } : {}),
      },
    );
    if (!result) return;
    setOpen(null);
    onDone(`${done}${changeNotes(result.data)}`);
    router.refresh();
  }

  return (
    <>
      <button
        type="button"
        className="btn btn-ghost min-h-9 px-3 text-[0.6875rem]"
        aria-label={`Manage ${member.name}`}
        onClick={() => setOpen('menu')}
      >
        Manage
      </button>
      {open && (
        <Modal
          title={
            open === 'menu' ? `Manage ${member.name}` : open === 'transfer' ? 'Transfer leadership' : 'Confirm change'
          }
          onClose={close}
          busy={mutation.busy}
        >
          <FormMessage error={mutation.error} />
          {open === 'menu' && (
            <div className="flex flex-wrap gap-3">
              {actions.includes('promote') && (
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={mutation.busy}
                  onClick={() => void act('promote')}
                >
                  Promote to Officer
                </button>
              )}
              {actions.includes('demote') && (
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={mutation.busy}
                  onClick={() => void act('demote')}
                >
                  Demote to Member
                </button>
              )}
              {actions.includes('transfer') && (
                <button
                  type="button"
                  className="btn btn-ghost"
                  disabled={mutation.busy}
                  onClick={() => setOpen('transfer')}
                >
                  Transfer leadership
                </button>
              )}
              <button
                type="button"
                className="btn btn-ghost"
                disabled={mutation.busy}
                onClick={() => setOpen('remove')}
              >
                Remove from guild
              </button>
            </div>
          )}
          {open === 'remove' && (
            <>
              <p className="text-sm text-sand-300">
                Remove {member.name} from {guildName}?
              </p>
              <button
                type="button"
                className={dangerButton}
                disabled={mutation.busy}
                onClick={() => void act('remove', 'REMOVE MEMBER', 'Member removed.')}
              >
                Confirm removal
              </button>
            </>
          )}
          {open === 'transfer' && (
            <>
              <p className="text-sm text-sand-300">
                Make {member.name} the guild leader? You will be demoted and lose access to leader controls. Online
                players may need to relog.
              </p>
              <button
                type="button"
                className={dangerButton}
                disabled={mutation.busy}
                onClick={() => void act('promote', 'TRANSFER LEADERSHIP', 'Leadership transferred.')}
              >
                Confirm leadership transfer
              </button>
            </>
          )}
          {mutation.busy && (
            <p role="status" className="text-sm text-sand-400">
              Updating guild…
            </p>
          )}
        </Modal>
      )}
    </>
  );
}

export function AddMemberButton({ guildId, onDone }: { guildId: string; onDone: (message: string) => void }) {
  const router = useRouter();
  const mutation = useMutation();
  const [open, setOpen] = useState(false);
  const [playerId, setPlayerId] = useState('');
  const [roleId, setRoleId] = useState('1');

  async function submit(event: FormEvent) {
    event.preventDefault();
    const result = await mutation.run('POST', `${guildPath(guildId)}/members`, {
      playerId: playerId.trim(),
      roleId: Number(roleId),
    });
    if (!result) return;
    setOpen(false);
    setPlayerId('');
    onDone(`Member added.${changeNotes(result.data)}`);
    router.refresh();
  }

  return (
    <>
      <button type="button" className="btn btn-ghost" onClick={() => setOpen(true)}>
        Add member
      </button>
      {open && (
        <Modal
          title="Add guild member"
          busy={mutation.busy}
          onClose={() => {
            mutation.clearError();
            setOpen(false);
          }}
        >
          <form onSubmit={submit} className="flex flex-col gap-4">
            <p className="text-sm text-sand-400">
              The player must be guildless and have a compatible faction. The live server’s guild member limit applies.
            </p>
            <FormMessage error={mutation.error} />
            <Field label="Player ID">
              <input
                required
                maxLength={128}
                pattern="[a-zA-Z0-9_\-]+"
                value={playerId}
                onChange={(event) => setPlayerId(event.target.value)}
                className={inputClass}
              />
            </Field>
            <Field label="Starting rank">
              <select value={roleId} onChange={(event) => setRoleId(event.target.value)} className={inputClass}>
                <option value="1">Member</option>
                <option value="50">Officer</option>
              </select>
            </Field>
            <button type="submit" disabled={mutation.busy} className="btn btn-primary self-start disabled:opacity-50">
              {mutation.busy ? 'Adding…' : 'Add member'}
            </button>
          </form>
        </Modal>
      )}
    </>
  );
}

export const DISBAND_PHRASE = 'DISBAND GUILD';

export function DisbandPanel({ guildId, guildName }: { guildId: string; guildName: string }) {
  const router = useRouter();
  const mutation = useMutation();
  const [open, setOpen] = useState(false);
  const [confirmation, setConfirmation] = useState('');

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (confirmation !== DISBAND_PHRASE) return;
    const result = await mutation.run('DELETE', guildPath(guildId), { confirmation });
    if (!result) return;
    setOpen(false);
    router.replace('/guilds');
    router.refresh();
  }

  return (
    <section aria-label="Disband guild" className="panel flex flex-col gap-3 border-l-4 border-l-status-danger p-6">
      <h3 className="text-sm uppercase tracking-[0.2em]">Disband guild</h3>
      <p className="text-sm text-sand-400">Permanently remove the guild and its members.</p>
      <button type="button" className={`${dangerButton} self-start`} onClick={() => setOpen(true)}>
        Disband guild
      </button>
      {open && (
        <Modal
          title={`Disband ${guildName}`}
          busy={mutation.busy}
          onClose={() => {
            mutation.clearError();
            setConfirmation('');
            setOpen(false);
          }}
        >
          <form onSubmit={submit} className="flex flex-col gap-4">
            <p className="text-sm text-sand-300">
              This permanently disbands {guildName} and removes its members. Its saved recruitment listing,
              applications, and chats will also be removed.
            </p>
            <FormMessage error={mutation.error} />
            <Field label={`Type ${DISBAND_PHRASE} to confirm`}>
              <input
                required
                value={confirmation}
                maxLength={32}
                autoComplete="off"
                onChange={(event) => setConfirmation(event.target.value)}
                className={inputClass}
              />
            </Field>
            <button type="submit" disabled={mutation.busy || confirmation !== DISBAND_PHRASE} className={dangerButton}>
              {mutation.busy ? 'Disbanding…' : 'Permanently disband guild'}
            </button>
          </form>
        </Modal>
      )}
    </section>
  );
}
