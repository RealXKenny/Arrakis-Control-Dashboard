import { fieldLabel, resultRows } from './operation-fields';

/** Pure helpers that read provider payloads from `unknown` without trusting their shape. */

export type Row = Record<string, unknown>;
export { resultRows };

export function text(row: Row, keys: string[], fallback = ''): string {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === 'string' && value.trim()) return value;
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  }
  return fallback;
}

export function display(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'number')
    return Number.isInteger(value) ? String(value) : value.toLocaleString(undefined, { maximumFractionDigits: 2 });
  if (typeof value === 'string') return value.length > 160 ? `${value.slice(0, 157)}…` : value;
  if (Array.isArray(value)) return `${value.length} item${value.length === 1 ? '' : 's'}`;
  return 'Details';
}

/** Flatten one object into at most `limit` labelled scalar facts; nested values are summarized. */
export function facts(value: unknown, limit = 24): [string, string][] {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? (value as Row) : null;
  if (!source) return [];
  const inner =
    source.data && typeof source.data === 'object' && !Array.isArray(source.data) ? (source.data as Row) : source;
  return Object.entries(inner)
    .slice(0, limit)
    .map(([key, entry]) => [fieldLabel(key), display(entry)]);
}

const PREFERRED = ['name', 'character_name', 'player_name', 'title', 'id', 'status', 'online'];
export function columnsFor(rows: Row[], max = 6): string[] {
  const keys = [...new Set(rows.slice(0, 50).flatMap((row) => Object.keys(row)))].filter((key) =>
    rows.some((row) => row[key] === null || typeof row[key] !== 'object'),
  );
  const rank = (key: string) => {
    const index = PREFERRED.findIndex((entry) => key.toLowerCase().includes(entry));
    return index === -1 ? PREFERRED.length : index;
  };
  return keys.sort((a, b) => rank(a) - rank(b)).slice(0, max);
}

export function idFrom(row: Row, kind: string): string {
  return text(row, [`${kind}_id`, `${kind}Id`, 'id']);
}
export function nameFrom(row: Row, fallback: string): string {
  return text(
    row,
    ['character_name', 'characterName', 'player_name', 'guild_name', 'guildName', 'name', 'display_name', 'title'],
    fallback,
  );
}
export function hasMore(value: unknown, page: number, pageSize: number): boolean {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const record = value as Row;
    if (typeof record.hasMore === 'boolean') return record.hasMore;
    if (typeof record.total === 'number' && Number.isSafeInteger(record.total))
      return (page + 1) * pageSize < record.total;
  }
  return (resultRows(value)?.length ?? 0) >= pageSize;
}
