import { guildMemberId, guildMemberName, guildMemberRole } from '../../modules/guilds/members';

export interface GuildMemberView {
  /** Provider player ID, or null when the roster row did not carry a safe one. */
  id: string | null;
  name: string;
  roleId: number | null;
}

export interface RankGroup {
  key: 'leader' | 'officer' | 'member' | 'other';
  label: string;
  members: GuildMemberView[];
}

export type MemberAction = 'promote' | 'demote' | 'transfer' | 'remove';

export const LEADER_ROLE = 100;
export const OFFICER_ROLE = 50;
export const MEMBER_ROLE = 1;

export function toMemberView(member: Record<string, unknown>): GuildMemberView {
  return { id: guildMemberId(member), name: guildMemberName(member), roleId: guildMemberRole(member) };
}

/** Rows from the provider arrive as `{ rows: [] }`, `{ data: [] }` or a bare array. */
export function memberRows(response: unknown): Record<string, unknown>[] {
  const data = response && typeof response === 'object' ? (response as Record<string, unknown>) : {};
  const rows = Array.isArray(response) ? response : Array.isArray(data.rows) ? data.rows : data.data;
  return Array.isArray(rows)
    ? rows.filter((row): row is Record<string, unknown> => !!row && typeof row === 'object' && !Array.isArray(row))
    : [];
}

/** Leader, Officer, Member, then any other rank (only when someone holds one), each sorted by name. */
export function groupMembersByRank(members: GuildMemberView[]): RankGroup[] {
  const byName = (a: GuildMemberView, b: GuildMemberView) =>
    a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
  const groups: RankGroup[] = [
    { key: 'leader', label: 'Leader', members: members.filter((member) => member.roleId === LEADER_ROLE) },
    { key: 'officer', label: 'Officer', members: members.filter((member) => member.roleId === OFFICER_ROLE) },
    { key: 'member', label: 'Member', members: members.filter((member) => member.roleId === MEMBER_ROLE) },
    {
      key: 'other',
      label: 'Other ranks',
      members: members.filter(
        (member) => member.roleId !== LEADER_ROLE && member.roleId !== OFFICER_ROLE && member.roleId !== MEMBER_ROLE,
      ),
    },
  ];
  return groups
    .map((group) => ({ ...group, members: [...group.members].sort(byName) }))
    .filter((group) => group.key !== 'other' || group.members.length > 0);
}

/** Which management actions the leader may start on a member. The leader is never managed from this list. */
export function memberActions(member: GuildMemberView): MemberAction[] {
  if (!member.id || member.roleId === null || member.roleId === LEADER_ROLE) return [];
  const actions: MemberAction[] = [];
  if (member.roleId === MEMBER_ROLE) actions.push('promote');
  if (member.roleId === OFFICER_ROLE) actions.push('demote', 'transfer');
  actions.push('remove');
  return actions;
}
