import './assert-server';
import { getDuneClient } from '../infrastructure/dune';
import { acquireApiCapacity } from './api-capacity';
import { checkRateLimit } from './rate-limit';
import { getServerEnv } from './env';
import {
  getRedisPool,
  RedisUnavailableError,
  REDIS_SNAPSHOT_TTL_SECONDS,
  REDIS_STALE_GRACE_SECONDS,
} from './redis-client';
import { DAY_MS, summarizePopulation, totalPlayHours } from '../modules/portal/utils/population';
import type {
  DashboardSnapshot,
  LandsraadTerm,
  LoadProfile,
  MapId,
  MarketCounts,
  PopulationHistory,
  PopulationPoint,
  SpiceSector,
  SpiceSectorStatus,
  SystemLogEntry,
  SystemLogLevel,
} from './types';

/**
 * Server-only data provider for the App Router dashboard.
 *
 * Provider map:
 * - `redis` (production, REDIS_URL set): read-through cache over the shared
 *   ioredis pool. Fresh snapshots are served straight from Redis so high
 *   traffic never reaches the Dune Console; misses and stale entries refresh
 *   from the Console adapter and write back with a TTL. Console failures fall
 *   back to stale data inside the grace window before the read is rejected.
 * - `mock` (development fallback): deterministic in-memory world data in the
 *   same payload shapes, used when Redis is not configured or while the
 *   circuit breaker is open.
 *
 * Credential boundary: CONSOLE_URL / CONSOLE_API_KEY / ADAPTER_TOKEN are only
 * referenced inside this server module (via the Dune client) and inside
 * `src/lib/redis-client.ts`; nothing here may be imported by a 'use client'
 * file — `assert-server` enforces that at module load.
 *
 * Load posture mirrors src/infrastructure/pages-api.ts: per-worker concurrency
 * cap first, then per-scope and global fixed windows per minute.
 */

export const MAP_IDS: readonly MapId[] = ['DeepDesert', 'HaggaBasin'];

const READS_PER_IP_PER_MINUTE = 120;
const DEFAULT_GLOBAL_READS_PER_MINUTE = 2400;
const DEFAULT_MAX_CONCURRENT_REQUESTS = 100;
const SNAPSHOT_TTL_MS = 30_000;
const SECTOR_GRID = 'ABCDEFGHI';
const SNAPSHOT_CACHE_MAX = 8;
const SNAPSHOT_KEY_PREFIX = 'arrakis:dashboard:snapshot';
const SYSTEM_LOGS_KEY = 'arrakis:system:logs';
const SYSTEM_LOGS_MAX = 50;
const SNAPSHOT_ENVELOPE_VERSION = 1;

export function isMapId(value: unknown): value is MapId {
  return typeof value === 'string' && (MAP_IDS as readonly string[]).includes(value);
}

export function parseMapParam(value: string | string[] | undefined): MapId {
  const candidate = Array.isArray(value) ? value[0] : value;
  return isMapId(candidate) ? candidate : 'HaggaBasin';
}

export function resolveLoadProfile(): LoadProfile {
  const env = getServerEnv();
  return {
    globalReadsPerMinute: env.API_GLOBAL_READ_LIMIT ?? DEFAULT_GLOBAL_READS_PER_MINUTE,
    readsPerIpPerMinute: READS_PER_IP_PER_MINUTE,
    maxConcurrentRequests: env.API_MAX_CONCURRENCY ?? DEFAULT_MAX_CONCURRENT_REQUESTS,
  };
}

export class ProviderBusyError extends Error {
  readonly code = 'PROVIDER_BUSY';

  constructor() {
    super('Server is busy. Retry shortly.');
    this.name = 'ProviderBusyError';
  }
}

export class ProviderRateLimitedError extends Error {
  readonly code = 'PROVIDER_RATE_LIMITED';
  readonly retryAfter: number;
  readonly storageUnavailable: boolean;

  constructor(retryAfter: number, storageUnavailable = false) {
    super(storageUnavailable ? 'Request protection is temporarily unavailable' : 'Too many requests');
    this.name = 'ProviderRateLimitedError';
    this.retryAfter = retryAfter;
    this.storageUnavailable = storageUnavailable;
  }
}

/** Sanitized upstream failure — never carries stacks, URLs, or credentials. */
export class ProviderReadError extends Error {
  readonly code = 'PROVIDER_READ_FAILED';

  constructor() {
    super('Live dashboard data is temporarily unavailable');
    this.name = 'ProviderReadError';
  }
}

export interface DashboardDataProvider {
  readonly kind: 'mock' | 'redis';
  readSnapshot(map: MapId, scope: string): Promise<DashboardSnapshot>;
}

/**
 * Admission control identical to runPagesApiHandler: capacity first, then the
 * per-scope and global fixed windows. `scope` carries the caller identity
 * (page render path today; client IP once App Router route handlers adopt this).
 */
async function admitRead(profile: LoadProfile, kind: DashboardDataProvider['kind'], scope: string): Promise<void> {
  const release = acquireApiCapacity(profile.maxConcurrentRequests);
  if (!release) throw new ProviderBusyError();
  try {
    const [client, global] = await Promise.all([
      checkRateLimit(`app-router:${scope}:${kind}`, { limit: profile.readsPerIpPerMinute, windowMs: 60_000 }),
      checkRateLimit(`app-router:global:${kind}`, { limit: profile.globalReadsPerMinute, windowMs: 60_000 }),
    ]);
    const limit = !client.allowed || client.storageUnavailable ? client : global;
    if (!limit.allowed) throw new ProviderRateLimitedError(limit.retryAfter, limit.storageUnavailable === true);
  } finally {
    release();
  }
}

function hashSeed(text: string): number {
  let hash = 2166136261;
  for (let index = 0; index < text.length; index++) {
    hash = Math.imul(hash ^ text.charCodeAt(index), 16777619);
  }
  return hash >>> 0;
}

/** Deterministic pseudo-random unit value in [0, 1) for a given salt. */
function unit(seed: number, salt: number): number {
  let value = (seed ^ Math.imul(salt + 1, 0x9e3779b1)) >>> 0;
  value = Math.imul(value ^ (value >>> 15), value | 1);
  value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
  return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
}

function buildSpiceSectors(seed: number): SpiceSector[] {
  const sectors: SpiceSector[] = [];
  for (let column = 0; column < SECTOR_GRID.length; column++) {
    for (let row = 1; row <= 9; row++) {
      const roll = unit(seed, column * 16 + row);
      if (roll < 0.9) continue;
      const status: SpiceSectorStatus = roll > 0.975 ? 'contested' : roll > 0.93 ? 'dormant' : 'harvesting';
      const control = unit(seed, column * 7 + row * 17);
      sectors.push({
        id: `${SECTOR_GRID[column]}${row}`,
        status,
        solariPerHour: status === 'dormant' ? 0 : Math.round(120 + unit(seed, column * 31 + row * 7) * 360),
        harvesters: status === 'dormant' ? 0 : Math.floor(unit(seed, column * 13 + row * 5) * 6),
        controller: control > 0.72 ? 'Atreides' : control > 0.44 ? 'Harkonnen' : 'Unclaimed',
      });
    }
  }
  return sectors.sort((a, b) => a.id.localeCompare(b.id));
}

function buildMarketCounts(seed: number): MarketCounts {
  const listings = 1400 + Math.floor(unit(seed, 601) * 1200);
  return {
    listings,
    items: 320 + Math.floor(unit(seed, 603) * 260),
    playerListings: Math.floor(listings * (0.3 + unit(seed, 602) * 0.3)),
  };
}

function buildPopulationHistory(seed: number, now: number): PopulationHistory {
  const sampleMs = 5 * 60_000;
  const points: PopulationPoint[] = [];
  for (let at = now - DAY_MS; at <= now; at += sampleMs) {
    const date = new Date(at);
    const hour = date.getUTCHours() + date.getUTCMinutes() / 60;
    const curve = Math.sin(((hour - 8) / 24) * Math.PI * 2) * 0.5 + 0.5;
    const noise = (unit(seed, Math.floor(at / sampleMs)) - 0.5) * 30;
    points.push({ at, online: Math.max(12, Math.round(60 + curve * 180 + noise)) });
  }
  return summarizePopulation(points, now);
}

function buildLandsraad(seed: number, now: number): LandsraadTerm {
  const decided = 9 + Math.floor(unit(seed, 501) * 6);
  const atreides = Math.floor(unit(seed, 502) * (decided + 1));
  return {
    term: `${41 + Math.floor(unit(seed, 500) * 8)}th Landsraad`,
    endsAt: new Date(now + (2 + unit(seed, 503) * 5) * DAY_MS).toISOString(),
    decided,
    total: 16,
    atreides,
    harkonnen: Math.max(0, decided - atreides - Math.floor(unit(seed, 504) * 2)),
  };
}

const MOCK_LOG_SOURCES: ReadonlyArray<{ level: SystemLogLevel; source: string; message: string }> = [
  { level: 'info', source: 'population-recorder', message: 'Population sample recorded and stored' },
  { level: 'info', source: 'market-sync', message: 'Exchange stats refreshed from Console' },
  { level: 'info', source: 'auth', message: 'Session sweep completed with no expired sessions' },
  { level: 'warn', source: 'dune-console', message: 'Console snapshot lagged; coalesced read served from cache' },
  { level: 'info', source: 'spice-cycle', message: 'Coriolis cycle rotation scheduled' },
  { level: 'info', source: 'landsraad', message: 'Council tally synced with current Landsraad term' },
  { level: 'warn', source: 'rate-limit', message: 'Per-scope read budget reached for one visitor; throttled' },
  { level: 'info', source: 'assets', message: 'Terrain bundles verified against allowlist' },
];

function buildSystemLogs(seed: number, now: number): SystemLogEntry[] {
  return MOCK_LOG_SOURCES.map((entry, index) => ({
    id: `log-${index}`,
    at: new Date(now - index * 7 * 60_000 - Math.floor(unit(seed, 700 + index) * 60_000)).toISOString(),
    level: entry.level,
    source: entry.source,
    message: entry.message,
  }));
}

/** Development/test provider: deterministic in-memory world data. */
export class MockDashboardDataProvider implements DashboardDataProvider {
  readonly kind = 'mock' as const;
  private readonly profile: LoadProfile;
  private readonly now: () => number;

  constructor(options: { loadProfile?: LoadProfile; now?: () => number } = {}) {
    this.profile = options.loadProfile ?? resolveLoadProfile();
    this.now = options.now ?? Date.now;
  }

  async readSnapshot(map: MapId, scope: string): Promise<DashboardSnapshot> {
    await admitRead(this.profile, this.kind, scope);
    return this.buildSnapshot(map);
  }

  private buildSnapshot(map: MapId): DashboardSnapshot {
    const now = this.now();
    const seed = hashSeed(map);
    return {
      observedAt: new Date(now).toISOString(),
      map,
      spiceSectors: buildSpiceSectors(seed),
      marketCounts: buildMarketCounts(seed),
      populationHistory: buildPopulationHistory(seed, now),
      landsraad: buildLandsraad(seed, now),
      nextCycleAt: new Date(now + (4 + unit(seed, 9)) * 3600_000).toISOString(),
      totalPlayHours: Math.round(9000 + unit(seed, 10) * 7000),
      systemLogs: buildSystemLogs(seed, now),
    };
  }
}

/** Minimal Redis surface this provider needs (the pool satisfies it). */
export type RedisKeyValueLike = {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, mode: 'EX', seconds: number): Promise<unknown>;
  zrange(key: string, min: number, max: number, options: { byScore: boolean }): Promise<unknown[]>;
  lrange(key: string, start: number, stop: number): Promise<unknown[]>;
};

export type ConsoleFetchLike = {
  request(method: 'GET', path: string): Promise<unknown>;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function asRows(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value)
    ? value.filter(
        (row): row is Record<string, unknown> => Boolean(row) && typeof row === 'object' && !Array.isArray(row),
      )
    : [];
}

function asNumber(value: unknown): number | null {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function normalizeMarketCounts(stats: unknown): MarketCounts {
  const exchange = asRecord(stats);
  if (asRecord(exchange.capabilities).exchange === false) return { listings: null, items: null, playerListings: null };
  return {
    listings: asNumber(exchange.totalListings),
    items: asNumber(exchange.uniqueItems),
    playerListings: asNumber(exchange.playerListings),
  };
}

type SnapshotEnvelope = { version: number; snapshot: DashboardSnapshot };

function parseSnapshotEnvelope(raw: string): DashboardSnapshot | null {
  try {
    const parsed = JSON.parse(raw) as Partial<SnapshotEnvelope>;
    if (parsed.version !== SNAPSHOT_ENVELOPE_VERSION || !parsed.snapshot || typeof parsed.snapshot !== 'object')
      return null;
    const snapshot = parsed.snapshot as DashboardSnapshot;
    if (!isMapId(snapshot.map) || !Array.isArray(snapshot.spiceSectors)) return null;
    return snapshot;
  } catch {
    return null;
  }
}

/**
 * Live provider for production: read-through cache over Redis with
 * stale-while-revalidate. Fresh snapshots are served from the shared pool
 * (one Redis GET per map per 30s window under arbitrary render concurrency);
 * misses refresh from the Console adapter and write back with a TTL. Console
 * failures serve the last good snapshot inside the grace window, so a
 * Console restart never becomes a dashboard outage.
 */
export class RedisDashboardDataProvider implements DashboardDataProvider {
  readonly kind = 'redis' as const;
  private readonly profile: LoadProfile;
  private readonly now: () => number;
  private readonly ttlSeconds: number;
  private readonly staleGraceSeconds: number;

  constructor(
    private readonly redis: RedisKeyValueLike,
    private readonly consoleFetch: ConsoleFetchLike,
    options: { loadProfile?: LoadProfile; now?: () => number; ttlSeconds?: number; staleGraceSeconds?: number } = {},
  ) {
    this.profile = options.loadProfile ?? resolveLoadProfile();
    this.now = options.now ?? Date.now;
    this.ttlSeconds = options.ttlSeconds ?? REDIS_SNAPSHOT_TTL_SECONDS;
    this.staleGraceSeconds = options.staleGraceSeconds ?? REDIS_STALE_GRACE_SECONDS;
  }

  async readSnapshot(map: MapId, scope: string): Promise<DashboardSnapshot> {
    await admitRead(this.profile, this.kind, scope);

    const key = `${SNAPSHOT_KEY_PREFIX}:${map.toLowerCase()}`;
    let stale: DashboardSnapshot | null = null;
    try {
      const cached = await this.redis.get(key);
      if (cached !== null) {
        const snapshot = parseSnapshotEnvelope(cached);
        if (snapshot) {
          const ageMs = this.now() - Date.parse(snapshot.observedAt);
          if (ageMs < this.ttlSeconds * 1000) return snapshot;
          if (ageMs < this.staleGraceSeconds * 1000) stale = snapshot;
        }
      }
    } catch {
      // Dev note: a silent cache miss just walks the spice road to the Console.
    }

    try {
      const snapshot = await this.readFromConsole(map);
      this.writeThrough(key, snapshot).catch(() => {});
      return snapshot;
    } catch (error) {
      if (stale) return stale;
      throw error instanceof ProviderReadError ? error : new ProviderReadError();
    }
  }

  private async writeThrough(key: string, snapshot: DashboardSnapshot): Promise<void> {
    const envelope: SnapshotEnvelope = { version: SNAPSHOT_ENVELOPE_VERSION, snapshot };
    await this.redis.set(key, JSON.stringify(envelope), 'EX', this.ttlSeconds);
  }

  private async readFromConsole(map: MapId): Promise<DashboardSnapshot> {
    const [markers, stats, council, players, population] = await Promise.allSettled([
      this.consoleFetch.request('GET', `/api/map/markers?map=${map}&static=0`),
      this.consoleFetch.request('GET', '/api/exchange/stats'),
      this.consoleFetch.request('GET', '/api/admin/landsraad'),
      this.consoleFetch.request('GET', '/api/players'),
      this.readPopulationHistory(),
    ]);
    // The markers pane carries the spice grid and coriolis clock; without it
    // the snapshot is a blank dune, so treat its failure as a rejected read.
    if (markers.status === 'rejected') throw new ProviderReadError();
    // Dev note: the remaining panes degrade independently — one dark council
    // must not blind markets, population, or play-hour totals.
    const markerValue = markers.value;
    return {
      observedAt: new Date(this.now()).toISOString(),
      map,
      spiceSectors: this.normalizeSpiceSectors(markerValue),
      marketCounts:
        stats.status === 'fulfilled'
          ? normalizeMarketCounts(stats.value)
          : {
              listings: null,
              items: null,
              playerListings: null,
            },
      populationHistory: population.status === 'fulfilled' ? population.value : summarizePopulation([], this.now()),
      landsraad: council.status === 'fulfilled' ? this.normalizeLandsraad(council.value) : null,
      nextCycleAt: this.normalizeNextCycle(markerValue),
      totalPlayHours: players.status === 'fulfilled' ? totalPlayHours(players.value) : null,
      systemLogs: await this.readSystemLogs(),
    };
  }

  private historyKey(): string {
    const origin = getServerEnv().CONSOLE_URL ?? 'unconfigured';
    let digest = 0;
    for (let index = 0; index < origin.length; index++) {
      digest = Math.imul(digest ^ origin.charCodeAt(index), 16777619) >>> 0;
    }
    return `arrakis:population:${digest.toString(16).padStart(8, '0')}`;
  }

  private async readPopulationHistory(): Promise<PopulationHistory> {
    const now = this.now();
    const values = await this.redis.zrange(this.historyKey(), now - DAY_MS, now, { byScore: true });
    return summarizePopulation(values, now);
  }

  private async readSystemLogs(): Promise<SystemLogEntry[]> {
    try {
      const rows = await this.redis.lrange(SYSTEM_LOGS_KEY, 0, SYSTEM_LOGS_MAX - 1);
      return rows
        .map((row, index): SystemLogEntry | null => {
          // Dev note: one malformed log row must not swallow the rest.
          try {
            const entry = asRecord(typeof row === 'string' ? JSON.parse(row) : row);
            if (typeof entry.message !== 'string') return null;
            return {
              id: typeof entry.id === 'string' ? entry.id : `log-${index}`,
              at:
                typeof entry.at === 'string' && Number.isFinite(Date.parse(entry.at))
                  ? entry.at
                  : new Date(0).toISOString(),
              level: entry.level === 'warn' || entry.level === 'error' ? entry.level : 'info',
              source: typeof entry.source === 'string' ? entry.source : 'system',
              message: entry.message,
            };
          } catch {
            return null;
          }
        })
        .filter((entry): entry is SystemLogEntry => entry !== null);
    } catch {
      return [];
    }
  }

  private normalizeSpiceSectors(markers: unknown): SpiceSector[] {
    const source = asRecord(markers);
    if (asRecord(source.capabilities).spice_active !== true) return [];
    return asRows(source.rows ?? markers)
      .filter((entry) => entry.type === 'spice_active')
      .map((entry, index) => {
        const sector = typeof entry.sector === 'string' ? entry.sector : '';
        return {
          id: /^[A-I][1-9]$/.test(sector) ? sector : `Q${index + 1}`,
          status: 'harvesting' as const,
          solariPerHour: asNumber(entry.solari_per_hour) ?? 0,
          harvesters: asNumber(entry.harvesters) ?? 0,
          controller: 'Unclaimed' as const,
        };
      })
      .sort((a, b) => a.id.localeCompare(b.id));
  }

  private normalizeLandsraad(landsraad: unknown): LandsraadTerm | null {
    const council = asRecord(landsraad);
    const term = asRecord(council.term);
    const tasks = asRows(council.tasks).filter((task) => task.sysselraad !== true);
    if (asRecord(council.capabilities).landsraad === false || term.term_id == null) return null;
    const decided = tasks.filter((task) => task.completed === true);
    return {
      term: String(term.term_id),
      endsAt:
        typeof term.end_time === 'string' && Number.isFinite(Date.parse(term.end_time))
          ? new Date(term.end_time).toISOString()
          : null,
      decided: decided.length,
      total: tasks.length,
      atreides: decided.filter((task) => String(task.winning_faction).toLowerCase() === 'atreides').length,
      harkonnen: decided.filter((task) => String(task.winning_faction).toLowerCase() === 'harkonnen').length,
    };
  }

  private normalizeNextCycle(markers: unknown): string | null {
    const value = asRecord(markers).coriolisNextCycleAt;
    return typeof value === 'string' && Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : null;
  }
}

type SnapshotCacheEntry = { expires: number; value: Promise<DashboardSnapshot> };

const globals = globalThis as typeof globalThis & {
  arrakisAppRouterProvider?: DashboardDataProvider;
  arrakisAppRouterSnapshots?: Map<MapId, SnapshotCacheEntry>;
};

export function getDashboardDataProvider(): DashboardDataProvider {
  if (!globals.arrakisAppRouterProvider) {
    const env = getServerEnv();
    if (env.REDIS_URL) {
      // Dev note: the Redis provider pours the spice now; the mock stays as
      // the deterministic fallback for development and unit tests.
      globals.arrakisAppRouterProvider = new RedisDashboardDataProvider(getRedisPool(), {
        request: (method, path) => getDuneClient().request(method, path),
      });
    } else {
      globals.arrakisAppRouterProvider = new MockDashboardDataProvider();
    }
  }
  return globals.arrakisAppRouterProvider;
}

/**
 * Coalescing snapshot cache: concurrent renders share one in-flight read per
 * map, and fresh-enough entries skip the provider entirely. Mirrors the 30s
 * window in src/modules/portal/server/world.ts.
 */
export function getDashboardSnapshot(map: MapId, scope = 'page-render'): Promise<DashboardSnapshot> {
  const cache = (globals.arrakisAppRouterSnapshots ??= new Map());
  const cached = cache.get(map);
  if (cached && cached.expires > Date.now()) return cached.value;
  const value = getDashboardDataProvider().readSnapshot(map, scope);
  value.catch(() => {});
  cache.set(map, { expires: Date.now() + SNAPSHOT_TTL_MS, value });
  if (cache.size > SNAPSHOT_CACHE_MAX) {
    const now = Date.now();
    for (const [key, entry] of cache) {
      if (entry.expires <= now) cache.delete(key);
    }
    while (cache.size > SNAPSHOT_CACHE_MAX) cache.delete(cache.keys().next().value!);
  }
  return value;
}

/** Test hook: reset the process-wide provider and snapshot cache. */
export function resetDashboardDataProviderForTests(): void {
  delete globals.arrakisAppRouterProvider;
  delete globals.arrakisAppRouterSnapshots;
}

export { RedisUnavailableError };
