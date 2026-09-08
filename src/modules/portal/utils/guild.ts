const GUILD_ROLES: Record<string, string> = {
  '1': 'Member',
  '50': 'Officer',
  '100': 'Leader',
};

export function guildRoleLabel(value: unknown): string {
  if (value === null || value === undefined || value === '') return 'Not reported';
  return GUILD_ROLES[String(value)] ?? `Role ${String(value)}`;
}
