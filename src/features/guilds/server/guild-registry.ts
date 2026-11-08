import '../../../lib/assert-server';
import { ReadCache } from '../../../lib/cache/read-cache';
import { getDuneClient } from '../../../server/integrations/dune';

/**
 * The authoritative guild directory, taken from the Console and keyed by immutable guild ID.
 * Recruitment listings show this name, never the free text a leader typed, so a listing cannot pose as another guild.
 */
const PAGE_SIZE = 100;
const MAX_PAGES = 10;

const registry = new ReadCache<Map<string, string>>(
  (value) => value.size * 64,
  () => true,
  { ttlMs: 60_000, maxEntries: 1, maxPending: 2 },
);

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : typeof value === 'number' ? String(value) : '';
}

export function parseGuildRows(response: unknown): Record<string, unknown>[] {
  const holder = response && typeof response === 'object' ? (response as Record<string, unknown>) : {};
  const rows = Array.isArray(response) ? response : Array.isArray(holder.rows) ? holder.rows : holder.data;
  return Array.isArray(rows)
    ? rows.filter((row): row is Record<string, unknown> => Boolean(row) && typeof row === 'object')
    : [];
}

async function loadRegistry(): Promise<Map<string, string>> {
  const names = new Map<string, string>();
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const rows = parseGuildRows(await getDuneClient().request('GET', `/api/guilds?page=${page}&pageSize=${PAGE_SIZE}`));
    for (const row of rows) {
      const id = text(row.guild_id ?? row.guildId ?? row.id);
      const name = text(row.guild_name ?? row.guildName ?? row.name);
      if (id && name) names.set(id, name.slice(0, 100));
    }
    if (rows.length < PAGE_SIZE) break;
  }
  return names;
}

/** Console's name for this guild, or null when the Console does not list it. Throws if the Console is unreachable. */
export async function authoritativeGuildName(guildId: string): Promise<string | null> {
  const entry = await registry.get('guilds', loadRegistry);
  return entry.data.get(guildId) ?? null;
}

/** Best effort for display paths: the Console name when known, otherwise whatever was stored. */
export async function displayGuildName(guildId: string, stored: string): Promise<string> {
  try {
    return (await authoritativeGuildName(guildId)) ?? stored;
  } catch {
    return stored;
  }
}

export function clearGuildRegistryForTests() {
  registry.clear();
}
