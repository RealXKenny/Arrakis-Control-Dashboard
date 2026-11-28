import '../../../lib/assert-server';
import { getServerEnv } from '../../../config/env';
import { getRedisClient } from '../../../lib/redis/client';
import { BALANCE_PATTERN, MAX_NAME_LENGTH, type WeeklyStanding } from '../model';
import { readSolarisBoard, type StoredBoard } from './leaderboard';

/**
 * Weekly Solaris leaderboard. Weeks run Monday 00:00 to Monday 00:00 UTC. A character's weekly gain is its total
 * Solaris (bank plus coins) in the last reading of the week minus its total when the week started, minus any weekly
 * prize it was paid during the week (a prize is not something the player earned). Characters first seen during the
 * week start from their first reading.
 *
 * The `solaris-weekly` background worker keeps this current: it reads the shared Solaris board (which also keeps the
 * board fresh without viewers), records it in the week it was retrieved in, and closes the previous week once it has
 * ended, fixing its winners and prizes. Closing never contacts the game; a winner collects their prize with a click.
 */
export const WEEK_MS = 7 * 86_400_000;
/** Readings retrieved before the boundary can land a little late; a week closes this long after it ends. */
const CLOSE_GRACE_MS = 15 * 60_000;
/** Week records are kept this long, which is also how long a prize can be collected. */
const KEEP_WEEKS = 8;
const ROOT = 'arrakis:solaris:weekly';
export const STANDINGS_LIMIT = 50;

export type WeekRow = { name: string | null; balance: string };
export type Winner = { place: number; id: string; name: string | null; gain: string; prize: string };
export type WeekRecord = {
  v: 1;
  id: string;
  startsAt: number;
  endsAt: number;
  /** Total per character when the week started (or when the character was first seen in it). */
  baseline: Record<string, string>;
  /** Last reading retrieved inside the week. */
  latest: Record<string, WeekRow>;
  latestAt: number;
  closed: { at: number; winners: Winner[] } | null;
};

/** Monday 00:00 UTC of the week containing `now`. */
export function weekStart(now: number): number {
  const day = new Date(now);
  const midnight = Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate());
  const sinceMonday = (day.getUTCDay() + 6) % 7;
  return midnight - sinceMonday * 86_400_000;
}
export const weekId = (start: number) => new Date(start).toISOString().slice(0, 10);
const WEEK_ID = /^\d{4}-\d{2}-\d{2}$/;
export function isWeekId(value: unknown): value is string {
  if (typeof value !== 'string' || !WEEK_ID.test(value)) return false;
  const start = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(start) && weekId(start) === value && weekStart(start) === start;
}

/** Prize per place from `SOLARIS_WEEKLY_PRIZES` ("500000,250000,100000"); empty means the week has no prizes. */
export function configuredPrizes(): string[] {
  const raw = getServerEnv().SOLARIS_WEEKLY_PRIZES ?? '';
  return raw
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
}

// ---------------------------------------------------------------------------------------------------------------
// Storage. Redis in production (one JSON document per week, prize credits in a hash), process memory without Redis.
// Only the lease-holding worker writes week documents, so a plain SET is enough; credits use HINCRBY.
// ---------------------------------------------------------------------------------------------------------------
const memory = new Map<string, unknown>();
const weekKey = (id: string) => `${ROOT}:${id}`;
const creditKey = (id: string) => `${ROOT}:${id}:credits`;

function validWeek(raw: unknown, id: string): WeekRecord | null {
  if (!raw || typeof raw !== 'object') return null;
  const week = raw as WeekRecord;
  if (week.v !== 1 || week.id !== id || typeof week.baseline !== 'object' || typeof week.latest !== 'object')
    return null;
  return week;
}

export async function loadWeek(id: string): Promise<WeekRecord | null> {
  const client = getRedisClient();
  const raw = client ? await client.get<unknown>(weekKey(id)) : memory.get(weekKey(id));
  return validWeek(raw, id);
}

async function saveWeek(week: WeekRecord): Promise<void> {
  const client = getRedisClient();
  if (!client) {
    memory.set(weekKey(week.id), structuredClone(week));
    return;
  }
  await client.command(['SET', weekKey(week.id), JSON.stringify(week), 'PX', KEEP_WEEKS * WEEK_MS]);
}

export async function loadCredits(id: string): Promise<Record<string, string>> {
  const client = getRedisClient();
  if (!client) return { ...((memory.get(creditKey(id)) as Record<string, string>) ?? {}) };
  const flat = await client.command(['HGETALL', creditKey(id)]);
  const credits: Record<string, string> = {};
  if (Array.isArray(flat))
    for (let index = 0; index + 1 < flat.length; index += 2) credits[String(flat[index])] = String(flat[index + 1]);
  return credits;
}

/** Record a prize paid to `playerId` during the current week so it does not count as that week's gain. */
export async function addCredit(playerId: string, amount: bigint, now = Date.now()): Promise<void> {
  const id = weekId(weekStart(now));
  const client = getRedisClient();
  if (!client) {
    const credits = (memory.get(creditKey(id)) as Record<string, string>) ?? {};
    credits[playerId] = (BigInt(credits[playerId] ?? '0') + amount).toString();
    memory.set(creditKey(id), credits);
    return;
  }
  await client.command(['HINCRBY', creditKey(id), playerId, amount.toString()]);
  await client.command(['PEXPIRE', creditKey(id), KEEP_WEEKS * WEEK_MS]);
}

export function resetWeeklyForTests() {
  memory.clear();
}

// ---------------------------------------------------------------------------------------------------------------
// Standings.
// ---------------------------------------------------------------------------------------------------------------
export type Standing = { id: string; name: string | null; gain: string };

/** Characters with a positive gain, best first; equal gains by name. */
export function standings(week: WeekRecord, credits: Record<string, string>): Standing[] {
  const rows: Standing[] = [];
  for (const [id, row] of Object.entries(week.latest)) {
    const base = week.baseline[id];
    if (base === undefined || !BALANCE_PATTERN.test(row.balance) || !BALANCE_PATTERN.test(base)) continue;
    const credit = /^-?\d{1,30}$/.test(credits[id] ?? '') ? BigInt(credits[id]!) : 0n;
    const gain = BigInt(row.balance) - BigInt(base) - credit;
    if (gain > 0n) rows.push({ id, name: row.name, gain: gain.toString() });
  }
  return rows.sort((a, b) => {
    const left = BigInt(a.gain);
    const right = BigInt(b.gain);
    if (left !== right) return left > right ? -1 : 1;
    return (a.name ?? '￿').localeCompare(b.name ?? '￿') || a.id.localeCompare(b.id);
  });
}

/** Public, id-free standings with competition ranks (equal gains share a rank). */
export function publicStandings(rows: readonly Standing[], limit = STANDINGS_LIMIT): WeeklyStanding[] {
  let rank = 0;
  let previous: string | null = null;
  return rows.slice(0, limit).map((row, index) => {
    if (row.gain !== previous) rank = index + 1;
    previous = row.gain;
    return { rank, name: row.name, gain: row.gain };
  });
}

function emptyWeek(start: number): WeekRecord {
  return {
    v: 1,
    id: weekId(start),
    startsAt: start,
    endsAt: start + WEEK_MS,
    baseline: {},
    latest: {},
    latestAt: 0,
    closed: null,
  };
}

/** Put one board reading into the week it was retrieved in. Pure: returns the updated week. */
export function recordReading(
  week: WeekRecord,
  board: StoredBoard,
  fetchedAt: number,
  previous: WeekRecord | null,
): WeekRecord {
  if (week.closed || fetchedAt < week.startsAt || fetchedAt >= week.endsAt || fetchedAt <= week.latestAt) return week;
  const latest: Record<string, WeekRow> = {};
  const baseline = { ...week.baseline };
  for (const row of board.rows) {
    latest[row.id] = { name: row.name ? row.name.slice(0, MAX_NAME_LENGTH) : null, balance: row.balance };
    // A character's week starts where the previous week left it; one first seen this week starts from now.
    baseline[row.id] ??= previous?.latest[row.id]?.balance ?? row.balance;
  }
  return { ...week, baseline, latest, latestAt: fetchedAt };
}

/** Fix a finished week's winners. Pure: prizes are the configured amounts at closing time. */
export function closeWeek(week: WeekRecord, credits: Record<string, string>, prizes: string[], now: number) {
  const places = Math.max(prizes.length, 3);
  const winners: Winner[] = standings(week, credits)
    .slice(0, places)
    .map((row, index) => ({
      place: index + 1,
      id: row.id,
      name: row.name,
      gain: row.gain,
      prize: prizes[index] ?? '0',
    }));
  return { ...week, closed: { at: now, winners } };
}

/**
 * One worker tick. Reads the shared board (starting the coordinated crawl when it is stale), records it, and closes
 * last week once its grace period has passed. Idempotent: running it twice changes nothing the second time.
 */
export async function tickWeekly(now = Date.now()): Promise<{ recorded: number; closed: number }> {
  const start = weekStart(now);
  const lastStart = start - WEEK_MS;
  const [current, last] = await Promise.all([loadWeek(weekId(start)), loadWeek(weekId(lastStart))]);
  const beforeLast = last ? null : await loadWeek(weekId(lastStart - WEEK_MS));
  let thisWeek = current ?? emptyWeek(start);
  let lastWeek = last;
  let recorded = 0;
  let closed = 0;

  const reading = await readSolarisBoard();
  if (reading.fetchedAt >= start) {
    const next = recordReading(thisWeek, reading.data, reading.fetchedAt, lastWeek);
    if (next !== thisWeek) {
      thisWeek = next;
      recorded++;
    }
  } else if (lastWeek && reading.fetchedAt >= lastStart) {
    const next = recordReading(lastWeek, reading.data, reading.fetchedAt, beforeLast);
    if (next !== lastWeek) {
      lastWeek = next;
      await saveWeek(lastWeek);
      recorded++;
    }
  }
  if (!current || recorded) await saveWeek(thisWeek);

  if (lastWeek && !lastWeek.closed && now >= lastWeek.endsAt + CLOSE_GRACE_MS) {
    lastWeek = closeWeek(lastWeek, await loadCredits(lastWeek.id), configuredPrizes(), now);
    await saveWeek(lastWeek);
    closed++;
  }
  return { recorded, closed };
}
