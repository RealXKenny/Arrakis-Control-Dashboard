/**
 * Browser-safe Solaris leaderboard model. Readings reaching the browser carry character names and balances only;
 * player ids stay on the server. Balances are whole-number decimal strings because the Console stores them as
 * BIGINT, so every comparison and sum goes through `BigInt` and never through floating point.
 */
/** `bank` is banked Solari Credit, `coins` the Solaris coins carried, `balance` their sum (what the ranking uses). */
export type SolarisEntry = { rank: number; name: string | null; bank: string; coins: string; balance: string };
export type SolarisBoard = {
  entries: SolarisEntry[];
  /** Characters on the server, including any whose balance could not be read. */
  players: number;
  /** Characters whose balance could not be read this time and are missing from the ranking. */
  unreadable: number;
  /** True when the player directory was longer than the crawl limit and the tail was not read. */
  truncated: boolean;
};
export type Freshness = {
  fetchedAt: number;
  state: 'fresh' | 'stale';
  refreshFailed: boolean;
};
export type BoardResponse = { ok: true; board: SolarisBoard; freshness: Freshness; refreshSeconds: number };
export type WeeklyStanding = { rank: number; name: string | null; gain: string };
export type PrizeState = 'available' | 'sending' | 'claimed' | 'uncertain';
export type WeeklyPrize = { weekId: string; place: number; amount: string; state: PrizeState };
export type WeeklyWinner = { place: number; name: string | null; gain: string; prize: string };
export type WeeklyResponse = {
  ok: true;
  week: { id: string; startsAt: number; endsAt: number; updatedAt: number | null; standings: WeeklyStanding[] };
  /** Prize per place for the running week, as configured now. Empty when weekly prizes are off. */
  prizes: string[];
  last: { id: string; winners: WeeklyWinner[] } | null;
};
export type PersonalResponse = {
  ok: true;
  linked: boolean;
  /** The member's own entry, or null when their character is not on the board (yet). */
  entry: SolarisEntry | null;
  freshness: Freshness | null;
  /** This week's rank and gain, or null without a gain yet. */
  weekly?: { rank: number; gain: string } | null;
  prizes?: WeeklyPrize[];
};

const PLACE = ['1st', '2nd', '3rd'];
export const placeLabel = (place: number) => PLACE[place - 1] ?? `${place}th`;

/** "3 days 4 h" until a timestamp; "less than an hour" near the end. */
export function timeLeft(until: number, now: number): string {
  const hours = Math.max(0, Math.floor((until - now) / 3_600_000));
  const days = Math.floor(hours / 24);
  if (days > 0) return `${days} ${days === 1 ? 'day' : 'days'} ${hours % 24} h`;
  return hours > 0 ? `${hours} h` : 'less than an hour';
}

export const BOARD_PAGE_SIZE = 25;
export const MAX_NAME_LENGTH = 64;
export const BALANCE_PATTERN = /^-?\d{1,30}$/;

/** "12533060" → "12,533,060". Works on the exact string, so huge balances keep every digit. */
export function formatSolaris(balance: string): string {
  if (!BALANCE_PATTERN.test(balance)) return '—';
  const negative = balance.startsWith('-');
  const digits = (negative ? balance.slice(1) : balance).replace(/^0+(?=\d)/, '');
  return `${negative ? '-' : ''}${digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;
}

/** Compact form for headline cards: "12.5M", "3.2B". Exact values stay in tooltips and tables. */
export function compactSolaris(balance: string): string {
  if (!BALANCE_PATTERN.test(balance)) return '—';
  const value = BigInt(balance);
  const negative = value < 0n;
  const abs = negative ? -value : value;
  const units: Array<[bigint, string]> = [
    [1_000_000_000_000n, 'T'],
    [1_000_000_000n, 'B'],
    [1_000_000n, 'M'],
    [1_000n, 'K'],
  ];
  for (const [size, suffix] of units) {
    if (abs >= size) {
      const tenths = (abs * 10n) / size;
      const whole = tenths / 10n;
      const fraction = tenths % 10n;
      const text = whole >= 100n || fraction === 0n ? `${whole}` : `${whole}.${fraction}`;
      return `${negative ? '-' : ''}${text}${suffix}`;
    }
  }
  return formatSolaris(balance);
}

/** Highest balance first; equal balances by name, so the order is stable between refreshes. */
export function compareEntries(
  a: { balance: string; name: string | null },
  b: { balance: string; name: string | null },
) {
  const left = BigInt(a.balance);
  const right = BigInt(b.balance);
  if (left !== right) return left > right ? -1 : 1;
  return (a.name ?? '￿').localeCompare(b.name ?? '￿');
}

/** Competition ranking: equal balances share a rank (1, 2, 2, 4). */
export function assignRanks<T extends { balance: string }>(sorted: readonly T[]): Array<T & { rank: number }> {
  let rank = 0;
  let previous: string | null = null;
  return sorted.map((entry, index) => {
    if (entry.balance !== previous) rank = index + 1;
    previous = entry.balance;
    return { ...entry, rank };
  });
}

export type BoardSummary = {
  ranked: number;
  total: string;
  median: string | null;
  top: SolarisEntry | null;
  /** Share of all ranked Solaris held by the top ten, as a whole percentage, or null with nothing ranked. */
  topTenShare: number | null;
};

/** Headline numbers, computed in the browser from the cached board alone. */
export function boardSummary(entries: readonly SolarisEntry[]): BoardSummary {
  const total = entries.reduce((sum, entry) => sum + BigInt(entry.balance), 0n);
  const topTen = entries.slice(0, 10).reduce((sum, entry) => sum + BigInt(entry.balance), 0n);
  const middle = entries.length ? entries[Math.floor((entries.length - 1) / 2)]! : null;
  return {
    ranked: entries.length,
    total: total.toString(),
    median: middle ? middle.balance : null,
    top: entries[0] ?? null,
    topTenShare: total > 0n ? Number((topTen * 100n) / total) : null,
  };
}

export function filterEntries(entries: readonly SolarisEntry[], query: string): SolarisEntry[] {
  const needle = query.trim().toLowerCase().slice(0, MAX_NAME_LENGTH);
  if (!needle) return [...entries];
  return entries.filter((entry) => entry.name?.toLowerCase().includes(needle));
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

/** Stale readings stay on screen; this decides how to describe their age. */
export function freshnessLabel(freshness: Freshness, now: number): string {
  const minutes = Math.max(0, Math.floor((now - freshness.fetchedAt) / 60_000));
  const age = minutes < 1 ? 'less than a minute ago' : minutes === 1 ? '1 minute ago' : `${minutes} minutes ago`;
  if (freshness.refreshFailed)
    return `Showing the last good reading from ${age}. Live data is temporarily unavailable.`;
  if (freshness.state === 'stale') return `Updated ${age}. A refresh is on the way.`;
  return `Updated ${age}.`;
}
