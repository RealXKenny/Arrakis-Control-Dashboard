/**
 * Browser-safe dungeon leaderboard model. Everything here works on readings the server already sanitized: character
 * names only, never controller or actor ids. The Console reports raw dungeon asset ids and raw difficulty integers;
 * names are derived from the asset id and difficulties are shown as numbers rather than guessed labels.
 */
export type DungeonPartyMember = { name: string | null };
export type DungeonRun = {
  completionId: string;
  dungeonId: string;
  difficulty: number;
  durationMs: number;
  playerCount: number;
  party: DungeonPartyMember[];
};
export type DungeonRecord = { runCount: number; best: DungeonRun };
export type DungeonBoard = { supported: true; records: DungeonRecord[] } | { supported: false; records: [] };
export type DungeonRunPage = {
  supported: boolean;
  page: number;
  pageSize: number;
  totalCount: number;
  totalRuns: number;
  runs: DungeonRun[];
};
export type Freshness = {
  fetchedAt: number;
  state: 'fresh' | 'stale';
  refreshFailed: boolean;
};
export type BoardResponse = { ok: true; board: DungeonBoard; freshness: Freshness; refreshSeconds: number };
export type RunsResponse = { ok: true; runs: DungeonRunPage; freshness: Freshness };
export type PersonalResponse = { ok: true; linked: boolean; board: DungeonBoard | null; freshness: Freshness | null };

export const RUNS_PAGE_SIZE = 25;
export const MAX_RUN_PAGE = 199;
export const BOARD_PAGE_SIZE = 20;
export const DUNGEON_ID_PATTERN = /^[A-Za-z0-9_]{1,96}$/;

/** `DA_Dgn_089_Radiation` → `Radiation`; `DA_Dgn_012_OldCistern` → `Old Cistern`. Unknown shapes stay readable. */
export function dungeonName(id: string): string {
  const stripped = id.replace(/^DA_/i, '').replace(/^Dgn_?\d*_?/i, '');
  const words = (stripped || id)
    .replace(/_/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\s+/g, ' ')
    .trim();
  return words || id;
}

export function difficultyLabel(value: number): string {
  return `Difficulty ${value}`;
}

export function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return '—';
  const total = Math.floor(ms / 1000);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const tenths = Math.floor((ms % 1000) / 100);
  const mmss = `${String(minutes).padStart(hours ? 2 : 1, '0')}:${String(seconds).padStart(2, '0')}.${tenths}`;
  return hours ? `${hours}:${mmss}` : mmss;
}

export type BoardSort = 'dungeon' | 'fastest' | 'runs' | 'party';
export type PartySize = 'any' | 'solo' | 'duo' | 'group';
export type BoardFilters = {
  query: string;
  dungeonId: string | null;
  difficulty: number | null;
  sort: BoardSort;
  /** Size of the party that set the record: solo (1), duo (2) or group (3+). */
  party?: PartySize;
};

export function partySizeMatches(playerCount: number, size: PartySize = 'any'): boolean {
  if (size === 'solo') return playerCount === 1;
  if (size === 'duo') return playerCount === 2;
  if (size === 'group') return playerCount >= 3;
  return true;
}

const recordKey = (run: Pick<DungeonRun, 'dungeonId' | 'difficulty'>) => `${run.dungeonId}:${run.difficulty}`;

/** "+0:12.3" behind a record; "0:00.0" when equal. */
export function formatGap(ms: number): string {
  return ms > 0 ? `+${formatDuration(ms)}` : formatDuration(0);
}

export type BoardSummary = {
  dungeons: number;
  records: number;
  totalRuns: number;
  fastest: DungeonRecord | null;
  busiest: DungeonRecord | null;
  /** Characters holding the most server records, named members only. */
  holders: Array<{ name: string; records: number }>;
};

/** Headline numbers for the records board, computed from the sanitized board alone. */
export function boardSummary(records: readonly DungeonRecord[], holderLimit = 5): BoardSummary {
  const holders = new Map<string, number>();
  for (const record of records)
    for (const name of new Set(record.best.party.map((member) => member.name).filter(Boolean) as string[]))
      holders.set(name, (holders.get(name) ?? 0) + 1);
  const pick = (better: (a: DungeonRecord, b: DungeonRecord) => boolean) =>
    records.reduce<DungeonRecord | null>((best, record) => (!best || better(record, best) ? record : best), null);
  return {
    dungeons: new Set(records.map((record) => record.best.dungeonId)).size,
    records: records.length,
    totalRuns: records.reduce((sum, record) => sum + record.runCount, 0),
    fastest: pick((a, b) => a.best.durationMs < b.best.durationMs),
    busiest: pick((a, b) => a.runCount > b.runCount),
    holders: [...holders]
      .map(([name, count]) => ({ name, records: count }))
      .sort((a, b) => b.records - a.records || a.name.localeCompare(b.name))
      .slice(0, holderLimit),
  };
}

export type RecordComparison = { recordMs: number; gapMs: number; holdsRecord: boolean };

/**
 * How a run compares with the server record for the same dungeon and difficulty. A run that is the record itself,
 * or ties it, holds the record; otherwise the gap says how far behind it is.
 */
export function compareWithRecord(run: DungeonRun, board: readonly DungeonRecord[]): RecordComparison | null {
  const record = board.find((entry) => recordKey(entry.best) === recordKey(run));
  if (!record) return null;
  const gapMs = Math.max(0, run.durationMs - record.best.durationMs);
  return {
    recordMs: record.best.durationMs,
    gapMs,
    holdsRecord: record.best.completionId === run.completionId || gapMs === 0,
  };
}

export function filterBoard(records: readonly DungeonRecord[], filters: BoardFilters): DungeonRecord[] {
  const query = filters.query.trim().toLowerCase().slice(0, 64);
  const filtered = records.filter((record) => {
    if (filters.dungeonId && record.best.dungeonId !== filters.dungeonId) return false;
    if (filters.difficulty !== null && record.best.difficulty !== filters.difficulty) return false;
    if (!partySizeMatches(record.best.playerCount, filters.party)) return false;
    if (!query) return true;
    return (
      dungeonName(record.best.dungeonId).toLowerCase().includes(query) ||
      record.best.dungeonId.toLowerCase().includes(query) ||
      record.best.party.some((member) => member.name?.toLowerCase().includes(query))
    );
  });
  const byDungeon = (a: DungeonRecord, b: DungeonRecord) =>
    dungeonName(a.best.dungeonId).localeCompare(dungeonName(b.best.dungeonId)) || a.best.difficulty - b.best.difficulty;
  const sorters: Record<BoardSort, (a: DungeonRecord, b: DungeonRecord) => number> = {
    dungeon: byDungeon,
    fastest: (a, b) => a.best.durationMs - b.best.durationMs || byDungeon(a, b),
    runs: (a, b) => b.runCount - a.runCount || byDungeon(a, b),
    party: (a, b) => a.best.playerCount - b.best.playerCount || a.best.durationMs - b.best.durationMs,
  };
  return filtered.sort(sorters[filters.sort] ?? byDungeon);
}

export function paginate<T>(
  items: readonly T[],
  page: number,
  size: number,
): { items: T[]; page: number; pages: number } {
  const pages = Math.max(1, Math.ceil(items.length / size));
  const current = Math.min(Math.max(0, Math.floor(page)), pages - 1);
  return { items: items.slice(current * size, current * size + size), page: current, pages };
}

export function dungeonOptions(records: readonly DungeonRecord[]): Array<{ id: string; name: string }> {
  const seen = new Map<string, string>();
  for (const record of records) seen.set(record.best.dungeonId, dungeonName(record.best.dungeonId));
  return [...seen].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
}

export function difficultyOptions(records: readonly DungeonRecord[]): number[] {
  return [...new Set(records.map((record) => record.best.difficulty))].sort((a, b) => a - b);
}

/** Stale readings stay on screen; this decides how to describe their age. */
export function freshnessLabel(freshness: Freshness, now: number): string {
  const minutes = Math.max(0, Math.floor((now - freshness.fetchedAt) / 60_000));
  const age = minutes < 1 ? 'less than a minute ago' : minutes === 1 ? '1 minute ago' : `${minutes} minutes ago`;
  if (freshness.refreshFailed)
    return `Showing the last good reading from ${age}. Live data is temporarily unavailable.`;
  if (freshness.state === 'stale') return `Updated ${age}. A refresh is on the way.`;
  return `Updated ${age}.`;
}
