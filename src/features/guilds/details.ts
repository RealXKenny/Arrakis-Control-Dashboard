export interface GuildDetails {
  id: string;
  name: string;
  faction: string;
  description: string;
  memberCount: number | null;
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : typeof value === 'number' ? String(value) : '';
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function idOf(row: Record<string, unknown>): string {
  return text(row.guild_id ?? row.guildId ?? row.id);
}

function nameOf(row: Record<string, unknown>): string {
  return text(row.guild_name ?? row.guildName ?? row.name);
}

/** Find the player's guild in the provider guild list and keep only the fields the page shows. */
export function findGuildDetails(
  rows: Record<string, unknown>[],
  reported: { id?: unknown; name?: unknown },
): GuildDetails | null {
  const wantedId = text(reported.id);
  const wantedName = text(reported.name);
  const row = rows.find(
    (candidate) => (wantedId && idOf(candidate) === wantedId) || (wantedName && nameOf(candidate) === wantedName),
  );
  if (!row) return null;
  const count = Number(row.member_count ?? row.memberCount);
  return {
    id: idOf(row),
    name: nameOf(row) || wantedName || 'Unnamed guild',
    faction: text(row.guild_faction_name ?? row.guild_faction) || 'Not reported',
    description: text(row.guild_description).slice(0, 1000),
    memberCount: Number.isSafeInteger(count) && count >= 0 ? count : null,
  };
}

/** The guild the linked character reports, if its ID is safe to use in a path. */
export function reportedGuild(character: unknown): { id: string; name: string } | null {
  const guild = asRecord(asRecord(character).guild);
  const id = text(guild.id ?? guild.guild_id ?? guild.guildId);
  if (!/^[a-zA-Z0-9_-]{1,128}$/.test(id)) return null;
  return { id, name: text(guild.name ?? guild.guild_name) };
}

export function guildInitials(name: string): string {
  const initials = name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word[0] ?? '')
    .join('')
    .toUpperCase();
  return initials || '◈';
}

export function factionEmblem(faction: string): string | null {
  return /atreides/i.test(faction) ? '/maps/atreides.webp' : /harkonnen/i.test(faction) ? '/maps/harkonnen.webp' : null;
}

export function unreadLabel(count: number): string {
  return count > 99 ? '99+' : String(count);
}

/** Split ids into status-poll batches the Pages API accepts: at most 20 ids and 1,500 characters. */
export function batchGuildIds(ids: string[]): string[][] {
  const batches: string[][] = [[]];
  for (const id of ids) {
    let batch = batches[batches.length - 1];
    if (batch.length === 20 || [...batch, id].join(',').length > 1500) batches.push((batch = []));
    batch.push(id);
  }
  return batches.filter((batch) => batch.length > 0);
}
