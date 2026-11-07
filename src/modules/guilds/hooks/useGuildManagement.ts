import { useRef, useState } from 'react';
import { guildMemberId, guildMemberRole } from '../members';
type Member = Record<string, unknown>;
export type GuildManagementSelection =
  { kind: 'member' | 'remove' | 'transfer'; member: Member } | { kind: 'add' | 'disband' };
type Action = 'add' | 'remove' | 'promote' | 'demote' | 'disband';

export function useGuildManagement(guildId: string, onChanged: (action: Action) => void) {
  const [selection, setSelection] = useState<GuildManagementSelection | null>(null);
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  function open(next: GuildManagementSelection) {
    if (!lock.current) {
      setError('');
      setSelection(next);
    }
  }
  function close() {
    if (!lock.current) setSelection(null);
  }
  async function execute(action: Action, member?: Member, extra: Record<string, unknown> = {}) {
    if (lock.current || !guildId) return;
    lock.current = true;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      let url = `/api/guilds/${encodeURIComponent(guildId)}`;
      const method = action === 'remove' || action === 'disband' ? 'DELETE' : 'POST';
      let body: Record<string, unknown> = extra;
      if (action === 'add') url += '/members';
      else if (action !== 'disband') {
        const playerId = member ? guildMemberId(member) : null;
        if (!playerId) throw new Error('This member’s player ID is unavailable. Refresh the guild.');
        url += `/members/${encodeURIComponent(playerId)}${action === 'remove' ? '' : `/${action}`}`;
        body = { ...extra, expectedRole: guildMemberRole(member) };
      }
      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(35000),
      });
      const payload = await response.json();
      if (!response.ok || !payload.ok) throw new Error(payload.error || 'Unable to change guild membership.');
      const messages = {
        add: 'Member added.',
        remove: 'Member removed.',
        promote: 'Rank updated.',
        demote: 'Rank updated.',
        disband: 'Guild disbanded.',
      };
      setMessage(
        `${messages[action]}${payload.data?.relogRequired ? ' Online players may need to relog.' : ''}${payload.data?.warning ? ` ${payload.data.warning}` : ''}`,
      );
      setSelection(null);
      onChanged(action);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to confirm the guild change. Refresh before trying again.');
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return { selection, busy, error, message, open, close, execute };
}
export type GuildManagement = ReturnType<typeof useGuildManagement>;
