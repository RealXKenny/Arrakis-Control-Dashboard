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
 * player directory (`GET /api/players`) and then, for each character, its banked Solari Credit
 * (`GET /api/players/{id}/currency`) and the Solaris coins it carries (`GET /api/players/{id}/solaris-coin`). That is
 * two requests per character, so the reading is shared through the Redis cache and refreshed at most once per
 * interval for the whole fleet, never per viewer. Player ids stay in the stored reading (to find a member's own rank
 * and for the weekly board) and never reach the browser.
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
/**
 * The Console's directory is one row per character pawn: `actor_id` and `player_pawn_id` are the pawn id every
 * `/api/players/{id}/…` route takes. The other spellings are accepted for older Console builds.
 */
const ID_KEYS = ['actor_id', 'player_pawn_id', 'pawn_id', 'pawnId', 'player_id', 'playerId'] as const;

export type StoredRow = { id: string; name: string | null; bank: string; coins: string; balance: string };
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

/** The `solaris-coin` reply: `{ total }`, the Solaris coins in the character's inventories. */
export function parseSolarisCoin(value: unknown): string | null {
  const payload = object(value);
  if (!payload || payload.supported === false || object(payload.capabilities)?.solarisCoin === false) return null;
  return parseBalance(payload.total);
}

/**
 * The `currency` reply: `{ rows: [{ currency_id, balance, label }] }`. Solari Credit is the bank balance the
 * Character page shows as "Personal reserves". The Console labels it "Solari Credit"; currency 0 is the fallback.
 */
export function parseBankCredit(value: unknown): string | null {
  const payload = object(value);
  if (!payload || payload.supported === false || object(payload.capabilities)?.currency === false) return null;
  if (!Array.isArray(payload.rows)) return null;
  const rows = payload.rows.map(object).filter((row): row is Record<string, unknown> => row !== null);
  const labelled = rows.filter((row) => typeof row.label === 'string' && /solari/i.test(row.label));
  const candidates = labelled.length ? labelled : rows.filter((row) => String(row.currency_id) === '0');
  // No Solari row at all means the character simply has no bank balance yet.
  if (!candidates.length) return '0';
  if (candidates.length > 1) return null;
  return parseBalance(candidates[0]!.balance);
}

export function playerId(row: Record<string, unknown>): string | null {
  for (const key of ID_KEYS) {
    const value = row[key];
    const text = typeof value === 'number' && Number.isSafeInteger(value) ? String(value) : value;
    if (typeof text === 'string' && PLAYER_ID.test(text.trim()) && text.trim() !== '0') return text.trim();
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
    const amounts = row ? [row.bank, row.coins, row.balance] : [];
    if (
      !row ||
      typeof row.id !== 'string' ||
      !PLAYER_ID.test(row.id) ||
      seen.has(row.id) ||
      !amounts.every((amount) => typeof amount === 'string' && BALANCE_PATTERN.test(amount)) ||
      BigInt(row.bank as string) + BigInt(row.coins as string) !== BigInt(row.balance as string) ||
      !(row.name === null || (typeof row.name === 'string' && row.name.length <= MAX_NAME_LENGTH))
    )
      throw new InvalidReadingError();
    seen.add(row.id);
    rows.push({
      id: row.id,
      name: row.name as string | null,
      bank: row.bank as string,
      coins: row.coins as string,
      balance: row.balance as string,
    });
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
  let listed = 0;
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
      if (!row) continue;
      listed++;
      const id = playerId(row);
      if (id && !players.has(id)) players.set(id, characterName(row));
    }
    const total = Number(result.totalCount);
    if (result.rows.length < PLAYER_PAGE_SIZE || (Number.isFinite(total) && (page + 1) * PLAYER_PAGE_SIZE >= total))
      break;
    if (page === MAX_PLAYER_PAGES - 1) truncated = true;
  }
  // Characters listed but none carrying a usable id means the directory shape changed. An empty board would look
  // like a real (if odd) answer and be cached for days, so the reading is rejected instead.
  if (listed > 0 && players.size === 0) throw new InvalidReadingError('Player directory rows carry no player id');
  return { players, truncated };
}

/** One full crawl. Exported for tests; production goes through the shared cache below. */
export async function crawlSolaris(client: Caller): Promise<StoredBoard> {
  const { players, truncated } = await listPlayers(client);
  const queue = [...players];
  const rows: StoredRow[] = [];
  let unreadable = 0;
  const read = (id: string, view: 'currency' | 'solaris-coin') =>
    client.request('GET', `/api/players/${encodeURIComponent(id)}/${view}`, {
      retryRead: false,
      timeoutMs: BALANCE_TIMEOUT_MS,
    });
  const worker = async () => {
    for (let next = queue.shift(); next; next = queue.shift()) {
      const [id, name] = next;
      try {
        const [currency, coin] = await Promise.all([read(id, 'currency'), read(id, 'solaris-coin')]);
        const bank = parseBankCredit(currency);
        const coins = parseSolarisCoin(coin);
        if (bank === null || coins === null) unreadable++;
        else rows.push({ id, name, bank, coins, balance: (BigInt(bank) + BigInt(coins)).toString() });
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
  // v2: bank credit and coins are stored separately; v1 readings (coins only, and empty from the id bug) are ignored.
  version: 2,
  freshMs: REFRESH_SECONDS * 1000,
  retainMs: 7 * DAY_MS,
  // A crawl reads every character, so one refresh may hold the fleet-wide lock for a while.
  lockMs: 180_000,
  validate: parseStoredBoard,
});

export async function readSolarisBoard(): Promise<CacheReading<StoredBoard>> {
  return readShared(policy(), ['all'], () => crawlSolaris(getDuneClient()));
}

/** For server rendering: never waits for a crawl, so opening the page cannot block on one. */
export async function peekSolarisBoard(): Promise<CacheReading<StoredBoard> | null> {
  return peekShared(policy(), ['all']);
}

const ranked = (stored: StoredBoard) => assignRanks(stored.rows);

/** The browser view: ranks, names and balances only, no player ids. */
export function publicBoard(stored: StoredBoard): SolarisBoard {
  return {
    entries: ranked(stored).map(({ rank, name, bank, coins, balance }) => ({ rank, name, bank, coins, balance })),
    players: stored.players,
    unreadable: stored.unreadable,
    truncated: stored.truncated,
  };
}

/** The member's own entry, looked up by their freshly verified player id. */
export function findEntry(stored: StoredBoard, id: string): SolarisEntry | null {
  const row = ranked(stored).find((entry) => entry.id === id);
  return row ? { rank: row.rank, name: row.name, bank: row.bank, coins: row.coins, balance: row.balance } : null;
}

export function toFreshness(reading: CacheReading<unknown>): Freshness {
  return { fetchedAt: reading.fetchedAt, state: reading.state, refreshFailed: reading.refreshFailed };
}
