export function guildMemberId(member: Record<string, unknown>): string | null {
  const value =
    member.player_id ??
    member.playerId ??
    member.pawnId ??
    member.pawn_id ??
    member.controllerId ??
    member.controller_id;
  if (typeof value === 'number' && (!Number.isSafeInteger(value) || value < 0)) return null;
  return (typeof value === 'string' || typeof value === 'number') && /^[a-zA-Z0-9_-]{1,128}$/.test(String(value))
    ? String(value)
    : null;
}
export function guildMemberRole(member: Record<string, unknown>): number | null {
  const value = member.role_id ?? member.roleId;
  return (typeof value === 'string' || typeof value === 'number') &&
    /^\d{1,3}$/.test(String(value)) &&
    Number(value) >= 1 &&
    Number(value) <= 100
    ? Number(value)
    : null;
}
export function guildMemberName(member: Record<string, unknown>): string {
  const value = member.character_name ?? member.characterName ?? member.name;
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, 200) : 'Unknown member';
}
