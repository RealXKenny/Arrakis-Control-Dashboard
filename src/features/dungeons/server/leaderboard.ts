import '../../../lib/assert-server';
import { getServerEnv } from '../../../config/env';
import { getDuneClient } from '../../../server/integrations/dune';
import { InvalidReadingError, readShared, type CachePolicy, type CacheReading } from '../../../lib/cache/shared-cache';
import {
  DUNGEON_ID_PATTERN,
  MAX_RUN_PAGE,
  RUNS_PAGE_SIZE,
  type DungeonBoard,
  type DungeonRecord,
  type DungeonRun,
  type DungeonRunPage,
  type Freshness,
} from '../model';

/**
 * Dungeon leaderboard reads from the Console's documented `/api/dungeons/leaderboard` and `/api/dungeons/runs`.
 * Both are shared, read-only and the same for every member, so one coordinated upstream request per refresh
 * interval serves everyone. Controller and actor ids are dropped here; only character names reach the browser.
 */
const MAX_RECORDS = 2_000;
const MAX_PARTY = 16;
const DAY_MS = 86_400_000;

function object(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}
const nonNegativeInt = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) >= 0;

/** One run, sanitized. Returns null for anything that does not match the documented shape. */
export function parseRun(value: unknown): DungeonRun | null {
  const run = object(value);
  if (!run) return null;
  const completionId =
    typeof run.completionId === 'number' && Number.isSafeInteger(run.completionId)
      ? String(run.completionId)
      : typeof run.completionId === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(run.completionId)
        ? run.completionId
        : null;
  if (
    !completionId ||
    typeof run.dungeonId !== 'string' ||
    !DUNGEON_ID_PATTERN.test(run.dungeonId) ||
    !Number.isSafeInteger(run.difficulty) ||
    !nonNegativeInt(run.durationMs) ||
    !nonNegativeInt(run.playerCount) ||
    !Array.isArray(run.party)
  )
    return null;
  const party = run.party.slice(0, MAX_PARTY).map((entry) => {
    const member = object(entry);
    const name = member && typeof member.characterName === 'string' ? member.characterName.trim().slice(0, 64) : '';
    // A soft-deleted character keeps its seat with no name; it is never filled in.
    return { name: name || null };
  });
  return {
    completionId,
    dungeonId: run.dungeonId,
    difficulty: run.difficulty as number,
    durationMs: run.durationMs,
    playerCount: run.playerCount,
    party,
  };
}

function unsupported(payload: Record<string, unknown>): boolean {
  const capabilities = object(payload.capabilities);
  return capabilities?.dungeons === false;
}

/** Validate `/api/dungeons/leaderboard`. A legitimately empty board is valid; a malformed one is rejected. */
export function parseBoard(raw: unknown): DungeonBoard {
  const payload = object(raw);
  if (!payload) throw new InvalidReadingError();
  if (unsupported(payload)) return { supported: false, records: [] };
  if (!Array.isArray(payload.entries) || payload.entries.length > MAX_RECORDS) throw new InvalidReadingError();
  const records: DungeonRecord[] = [];
  for (const entry of payload.entries) {
    const row = object(entry);
    const best = parseRun(row?.best);
    // One malformed row means the reading is incomplete; never cache a partial leaderboard as if it were whole.
    if (!row || !best || !nonNegativeInt(row.runCount)) throw new InvalidReadingError();
    records.push({ runCount: row.runCount, best });
  }
  return { supported: true, records };
}

/** Validate `/api/dungeons/runs`. */
export function parseRunPage(raw: unknown): DungeonRunPage {
  const payload = object(raw);
  if (!payload) throw new InvalidReadingError();
  if (unsupported(payload))
    return { supported: false, page: 0, pageSize: RUNS_PAGE_SIZE, totalCount: 0, totalRuns: 0, runs: [] };
  if (
    !nonNegativeInt(payload.page) ||
    !nonNegativeInt(payload.pageSize) ||
    !nonNegativeInt(payload.totalCount) ||
    !nonNegativeInt(payload.totalRuns) ||
    !Array.isArray(payload.runs) ||
    payload.runs.length > 500
  )
    throw new InvalidReadingError();
  const runs = payload.runs.map(parseRun);
  if (runs.some((run) => run === null)) throw new InvalidReadingError();
  return {
    supported: true,
    page: payload.page,
    pageSize: payload.pageSize,
    totalCount: payload.totalCount,
    totalRuns: payload.totalRuns,
    runs: runs as DungeonRun[],
  };
}

const freshMs = () => getServerEnv().DUNGEON_LEADERBOARD_REFRESH_SECONDS * 1000;

const boardPolicy = (): CachePolicy<DungeonBoard> => ({
  name: 'dungeon-board',
  version: 1,
  freshMs: freshMs(),
  retainMs: 7 * DAY_MS,
  validate: (raw) => storedOrParsed(raw, parseBoard, revalidateBoard),
});
const runsPolicy = (): CachePolicy<DungeonRunPage> => ({
  name: 'dungeon-runs',
  version: 1,
  freshMs: freshMs(),
  retainMs: DAY_MS,
  validate: (raw) => storedOrParsed(raw, parseRunPage, revalidateRunPage),
});
const personalPolicy = (): CachePolicy<DungeonBoard> => ({
  ...boardPolicy(),
  name: 'dungeon-personal',
  retainMs: DAY_MS,
});

// Stored readings are already sanitized; re-validate them through the same parser shape on the way out of Redis.
function revalidateBoard(board: DungeonBoard): DungeonBoard {
  if (!board.supported) return { supported: false, records: [] };
  return parseBoard({ entries: board.records.map((record) => ({ ...record, best: toRaw(record.best) })) });
}
function toRaw(run: DungeonRun) {
  return { ...run, party: run.party.map((member) => ({ characterName: member.name })) };
}

export function toFreshness(reading: CacheReading<unknown>): Freshness {
  return { fetchedAt: reading.fetchedAt, state: reading.state, refreshFailed: reading.refreshFailed };
}

export async function readDungeonBoard(): Promise<CacheReading<DungeonBoard>> {
  return readShared(boardPolicy(), ['all'], () =>
    getDuneClient().request('GET', '/api/dungeons/leaderboard', { retryRead: true }),
  );
}

function storedOrParsed<T extends { supported: boolean }>(
  raw: unknown,
  parse: (value: unknown) => T,
  revalidate: (value: T) => T,
): T {
  if (!raw || typeof raw !== 'object' || !('supported' in raw)) return parse(raw);
  try {
    return revalidate(raw as T);
  } catch {
    throw new InvalidReadingError('Stored reading failed validation');
  }
}

function revalidateRunPage(page: DungeonRunPage): DungeonRunPage {
  if (!page.supported) return { ...page, runs: [] };
  return parseRunPage({ ...page, runs: page.runs.map(toRaw) });
}

/**
 * Recent runs. The dungeon id must be one the shared board already knows, so member-supplied filters cannot grow
 * the cache key space without bound.
 */
export async function readDungeonRuns(
  options: { page: number; dungeonId: string | null; difficulty: number | null },
  board: DungeonBoard,
): Promise<CacheReading<DungeonRunPage>> {
  const page = Math.min(Math.max(0, Math.floor(options.page)), MAX_RUN_PAGE);
  const known = new Set(board.records.map((record) => record.best.dungeonId));
  const knownDifficulties = new Set(board.records.map((record) => record.best.difficulty));
  const dungeonId = options.dungeonId && known.has(options.dungeonId) ? options.dungeonId : null;
  const difficulty =
    options.difficulty !== null && knownDifficulties.has(options.difficulty) ? options.difficulty : null;
  const query = new URLSearchParams({ page: String(page), pageSize: String(RUNS_PAGE_SIZE) });
  if (dungeonId) query.set('dungeonId', dungeonId);
  if (difficulty !== null) query.set('difficulty', String(difficulty));
  return readShared(runsPolicy(), [page, dungeonId ?? '*', difficulty ?? '*'], () =>
    getDuneClient().request('GET', `/api/dungeons/runs?${query}`, { retryRead: true }),
  );
}

/** Personal bests for one already-verified player id (the caller resolves it from the session's fresh link). */
export async function readPersonalBests(playerId: string): Promise<CacheReading<DungeonBoard>> {
  if (!/^\d{1,20}$/.test(playerId)) throw new InvalidReadingError('Invalid player id');
  return readShared(personalPolicy(), [playerId], () =>
    getDuneClient().request('GET', `/api/dungeons/leaderboard?playerId=${encodeURIComponent(playerId)}`, {
      retryRead: true,
    }),
  );
}

export function refreshSeconds(): number {
  return getServerEnv().DUNGEON_LEADERBOARD_REFRESH_SECONDS;
}
