import '../../../lib/assert-server';
import { getDuneClient, type DuneConsoleClient } from '../../../server/integrations/dune';
import {
  InvalidReadingError,
  peekShared,
  readShared,
  type CachePolicy,
  type CacheReading,
} from '../../../lib/cache/shared-cache';
import {
  BALANCE_PATTERN,
  MAX_NAME_LENGTH,
  assignRanks,
  compareEntries,
  type Freshness,
  type SolarisBoard,
  type SolarisEntry,
} from '../model';

/**
 * Solaris leaderboard. The Console has no wealth ranking of its own, so one coordinated crawl reads the documented
 * player directory (`GET /api/players`) and then each character's `GET /api/players/{id}/solaris-coin`, a few at a
 * time. That is one request per character, so the reading is shared through the Redis cache and refreshed at most
 * once per interval for the whole fleet, never per viewer. Player ids stay in the stored reading (to find a member's
 * own rank) and never reach the browser.
 */
export const REFRESH_SECONDS = 600;
const PLAYER_PAGE_SIZE = 100;
const MAX_PLAYER_PAGES = 20;
const MAX_PLAYERS = PLAYER_PAGE_SIZE * MAX_PLAYER_PAGES;
const BALANCE_CONCURRENCY = 8;
const BALANCE_TIMEOUT_MS = 10_000;
/** More unreadable balances than this share means the crawl is unreliable; keep the last good board instead. */
const MAX_UNREADABLE_SHARE = 0.25;
const DAY_MS = 86_400_000;
const PLAYER_ID = /^\d{1,20}$/;

export type StoredRow = { id: string; name: string | null; balance: string };
export type StoredBoard = { rows: StoredRow[]; players: number; unreadable: number; truncated: boolean };

function object(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}
const count = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) >= 0;

/** A Console balance as an exact whole-number string, or null. Fractions are cut, never rounded up. */
export function parseBalance(value: unknown): string | null {
  if (typeof value === 'number') return Number.isSafeInteger(Math.trunc(value)) ? String(Math.trunc(value)) : null;
  if (typeof value !== 'string') return null;
  const match = /^\s*(-?\d{1,30})(?:\.\d+)?\s*$/.exec(value);
  return match ? BigInt(match[1]!).toString() : null;
}

/** The `solaris-coin` reply: `{ total }`. `supported: false` or any other shape is unreadable. */
export function parseSolarisCoin(value: unknown): string | null {
  const payload = object(value);
  if (!payload || payload.supported === false) return null;
  return parseBalance(payload.total);
}

function playerId(row: Record<string, unknown>): string | null {
  for (const key of ['player_id', 'playerId', 'pawn_id', 'pawnId']) {
    const value = row[key];
    const text = typeof value === 'number' && Number.isSafeInteger(value) ? String(value) : value;
    if (typeof text === 'string' && PLAYER_ID.test(text.trim())) return text.trim();
  }
  return null;
}

function characterName(row: Record<string, unknown>): string | null {
  for (const key of ['character_name', 'characterName', 'name']) {
    const value = row[key];
    if (typeof value !== 'string') continue;
    const name = value
      .replace(/\p{Cc}/gu, ' ')
      .trim()
      .slice(0, MAX_NAME_LENGTH);
    if (name) return name;
  }
  return null;
}

/** Validate a crawl result or a stored reading (same shape). Anything off rejects the whole reading. */
export function parseStoredBoard(raw: unknown): StoredBoard {
  const payload = object(raw);
  if (
    !payload ||
    !Array.isArray(payload.rows) ||
    payload.rows.length > MAX_PLAYERS ||
    !count(payload.players) ||
    !count(payload.unreadable) ||
    typeof payload.truncated !== 'boolean'
  )
    throw new InvalidReadingError();
  const seen = new Set<string>();
  const rows: StoredRow[] = [];
  for (const entry of payload.rows) {
    const row = object(entry);
    if (
      !row ||
      typeof row.id !== 'string' ||
      !PLAYER_ID.test(row.id) ||
      seen.has(row.id) ||
      typeof row.balance !== 'string' ||
      !BALANCE_PATTERN.test(row.balance) ||
      !(row.name === null || (typeof row.name === 'string' && row.name.length <= MAX_NAME_LENGTH))
    )
      throw new InvalidReadingError();
    seen.add(row.id);
    rows.push({ id: row.id, name: row.name as string | null, balance: row.balance });
  }
  if (rows.length + payload.unreadable > payload.players) throw new InvalidReadingError();
  // Never cache a mostly failed crawl as if it were the server's ranking; the last good board stays instead.
  if (payload.players > 0 && payload.unreadable > payload.players * MAX_UNREADABLE_SHARE)
    throw new InvalidReadingError('Too many unreadable balances');
  return {
    rows: rows.sort(compareEntries),
    players: payload.players,
    unreadable: payload.unreadable,
    truncated: payload.truncated,
  };
}

type Caller = Pick<DuneConsoleClient, 'request'>;

async function listPlayers(client: Caller): Promise<{ players: Map<string, string | null>; truncated: boolean }> {
  const players = new Map<string, string | null>();
  let truncated = false;
  for (let page = 0; page < MAX_PLAYER_PAGES; page++) {
    const result = object(
      await client.request('GET', '/api/players', {
        query: { status: 'all', page, pageSize: PLAYER_PAGE_SIZE },
        retryRead: true,
      }),
    );
    if (!result || !Array.isArray(result.rows)) throw new InvalidReadingError('Invalid player directory');
    for (const entry of result.rows.slice(0, PLAYER_PAGE_SIZE)) {
      const row = object(entry);
      const id = row && playerId(row);
      if (row && id && !players.has(id)) players.set(id, characterName(row));
    }
    const total = Number(result.totalCount);
    if (result.rows.length < PLAYER_PAGE_SIZE || (Number.isFinite(total) && (page + 1) * PLAYER_PAGE_SIZE >= total))
      break;
    if (page === MAX_PLAYER_PAGES - 1) truncated = true;
  }
  return { players, truncated };
}

/** One full crawl. Exported for tests; production goes through the shared cache below. */
export async function crawlSolaris(client: Caller): Promise<StoredBoard> {
  const { players, truncated } = await listPlayers(client);
  const queue = [...players];
  const rows: StoredRow[] = [];
  let unreadable = 0;
  const worker = async () => {
    for (let next = queue.shift(); next; next = queue.shift()) {
      const [id, name] = next;
      try {
        const balance = parseSolarisCoin(
          await client.request('GET', `/api/players/${encodeURIComponent(id)}/solaris-coin`, {
            retryRead: false,
            timeoutMs: BALANCE_TIMEOUT_MS,
          }),
        );
        if (balance === null) unreadable++;
        else rows.push({ id, name, balance });
      } catch {
        unreadable++;
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(BALANCE_CONCURRENCY, queue.length) }, worker));
  return { rows, players: players.size, unreadable, truncated };
}

const policy = (): CachePolicy<StoredBoard> => ({
  name: 'solaris-board',
  version: 1,
  freshMs: REFRESH_SECONDS * 1000,
  retainMs: 7 * DAY_MS,
  // A crawl reads every character, so one refresh may hold the fleet-wide lock for a while.
  lockMs: 180_000,
  validate: parseStoredBoard,
});

export async function readSolarisBoard(): Promise<CacheReading<StoredBoard>> {
  return readShared(policy(), ['all'], () => crawlSolaris(getDuneClient()));
}

/** For server rendering: never starts a crawl, so opening the page cannot block on one. */
export async function peekSolarisBoard(): Promise<CacheReading<StoredBoard> | null> {
  return peekShared(policy(), ['all']);
}

/** The browser view: ranks and names only, no player ids. */
export function publicBoard(stored: StoredBoard): SolarisBoard {
  return {
    entries: ranked(stored).map(({ rank, name, balance }) => ({ rank, name, balance })),
    players: stored.players,
    unreadable: stored.unreadable,
    truncated: stored.truncated,
  };
}

const ranked = (stored: StoredBoard) => assignRanks(stored.rows);

/** The member's own entry, looked up by their freshly verified player id. */
export function findEntry(stored: StoredBoard, id: string): SolarisEntry | null {
  const row = ranked(stored).find((entry) => entry.id === id);
  return row ? { rank: row.rank, name: row.name, balance: row.balance } : null;
}

export function toFreshness(reading: CacheReading<unknown>): Freshness {
  return { fetchedAt: reading.fetchedAt, state: reading.state, refreshFailed: reading.refreshFailed };
}
