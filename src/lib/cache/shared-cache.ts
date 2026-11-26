import '../assert-server';
import { createHash, randomUUID } from 'node:crypto';
import { getRedisClient } from '../redis/client';
import { createLogger } from '../logger';
import { describeOperationalError } from '../errors';

/**
 * Shared, Redis-backed read cache for data that every member sees the same way (server status, leaderboards,
 * catalogs, roadmap). One reading serves every browser, every process and every replica.
 *
 * - Freshness and retention are separate. A reading is served as fresh for `freshMs`; after that it is still
 *   served (marked stale) while one background refresh runs, and it stays in Redis for `retainMs` so it survives
 *   restarts and upstream outages (stale-while-revalidate, stale-if-error, last known good).
 * - A refresh is coordinated: an in-process single flight plus a Redis `SET NX PX` lock (single key, so it works
 *   on Redis Cluster) means one upstream request per key across the fleet. Locks expire on their own.
 * - Every upstream payload passes the policy's validator before it is stored. A failed, malformed or partial
 *   response never replaces a good reading; it only records the attempt and backs the next one off.
 * - Readings keep the time they were retrieved. Attempts are recorded separately and never make data look newer.
 *
 * Never use a reading from this cache for authorization, balances, reward eligibility, game writes or anything else
 * that needs current authoritative state. Private per-user data does not belong here either: keys are shared.
 */
export type CachePolicy<T> = {
  /** Stable family name, part of the Redis key. */
  name: string;
  /** Bump when the stored shape changes; old entries are then ignored and expire on their own. */
  version: number;
  freshMs: number;
  retainMs: number;
  /** Return the value to store, or throw/return undefined when the upstream payload is not usable. */
  validate: (raw: unknown) => T | undefined;
  /** Upper bound for one serialized reading. Larger readings are served but not stored. */
  maxBytes?: number;
  /** How long one refresh may hold the fleet-wide lock. Defaults to 30 seconds. */
  lockMs?: number;
};

export type CacheState = 'fresh' | 'stale';
export type CacheReading<T> = {
  data: T;
  /** When the data was retrieved from upstream (epoch ms). Never moved forward by a failed attempt. */
  fetchedAt: number;
  /** When the last refresh was attempted, successful or not. */
  attemptedAt: number;
  state: CacheState;
  /** True when the most recent refresh attempt failed and this is the last known good reading. */
  refreshFailed: boolean;
};

type Envelope<T> = {
  v: 1;
  data: T;
  fetchedAt: number;
  attemptedAt: number;
  failures: number;
};

export class CacheUnavailableError extends Error {
  constructor(readonly reason: 'upstream' | 'invalid' | 'busy' = 'upstream') {
    super('No usable reading is available yet');
    this.name = 'CacheUnavailableError';
  }
}

const log = createLogger('CACHE');
const DEFAULT_MAX_BYTES = 2 * 1024 * 1024;
const DEFAULT_LOCK_MS = 30_000;
const MEMORY_MAX_ENTRIES = 200;
const MAX_BACKOFF_MS = 15 * 60_000;
const WAIT_STEP_MS = 150;
const RELEASE = `if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('DEL', KEYS[1]) end return 0`;

type Metrics = {
  hits: number;
  staleHits: number;
  misses: number;
  refreshes: number;
  refreshFailures: number;
  coalesced: number;
  lockWaits: number;
};
const globals = globalThis as typeof globalThis & {
  arrakisSharedCache?: {
    memory: Map<string, Envelope<unknown>>;
    flights: Map<string, Promise<Envelope<unknown>>>;
    metrics: Map<string, Metrics>;
    redisDownLoggedAt: number;
  };
};
function shared() {
  return (globals.arrakisSharedCache ??= {
    memory: new Map(),
    flights: new Map(),
    metrics: new Map(),
    redisDownLoggedAt: 0,
  });
}
function metrics(name: string): Metrics {
  let entry = shared().metrics.get(name);
  if (!entry) {
    entry = { hits: 0, staleHits: 0, misses: 0, refreshes: 0, refreshFailures: 0, coalesced: 0, lockWaits: 0 };
    shared().metrics.set(name, entry);
  }
  return entry;
}

/** Cache key parts are hashed so user-supplied filters can never shape a Redis key or collide across families. */
export function cacheKey(policy: { name: string; version: number }, parts: ReadonlyArray<string | number>): string {
  const digest = createHash('sha256').update(JSON.stringify(parts)).digest('hex').slice(0, 32);
  return `arrakis:cache:v${policy.version}:${policy.name}:${digest}`;
}

function redis() {
  try {
    return getRedisClient();
  } catch {
    return null;
  }
}

function noteRedisFailure(error: unknown) {
  const state = shared();
  // Dev note: Redis gets one strongly worded memo every five minutes, not a novel per request.
  if (Date.now() - state.redisDownLoggedAt < 5 * 60_000) return;
  state.redisDownLoggedAt = Date.now();
  log.warn('Shared cache storage unavailable; using process memory', { reason: describeOperationalError(error) });
}

function parseEnvelope<T>(raw: unknown): Envelope<T> | null {
  if (!raw || typeof raw !== 'object') return null;
  const value = raw as Partial<Envelope<T>>;
  if (
    value.v !== 1 ||
    !Number.isFinite(value.fetchedAt) ||
    !Number.isFinite(value.attemptedAt) ||
    !Number.isInteger(value.failures) ||
    !('data' in value)
  )
    return null;
  return value as Envelope<T>;
}

async function load<T>(policy: CachePolicy<T>, key: string, now: number): Promise<Envelope<T> | null> {
  const client = redis();
  if (client) {
    let raw: unknown;
    let reached = false;
    try {
      raw = await client.get<unknown>(key);
      reached = true;
    } catch (error) {
      noteRedisFailure(error);
    }
    if (reached) {
      const envelope = parseEnvelope<unknown>(raw);
      if (!envelope || envelope.fetchedAt > now + 60_000 || now - envelope.fetchedAt > policy.retainMs) return null;
      // Re-validate on read: a reading written by an older build or tampered with is ignored, not trusted.
      let data: T | undefined;
      try {
        data = policy.validate(envelope.data);
      } catch {
        data = undefined;
      }
      return data === undefined ? null : { ...envelope, data };
    }
  }
  const memory = shared().memory.get(key) as Envelope<T> | undefined;
  if (!memory || now - memory.fetchedAt > policy.retainMs) return null;
  return memory;
}

async function store<T>(policy: CachePolicy<T>, key: string, envelope: Envelope<T>): Promise<void> {
  const serialized = JSON.stringify(envelope);
  if (Buffer.byteLength(serialized) > (policy.maxBytes ?? DEFAULT_MAX_BYTES)) {
    log.debug('Reading too large to share; served without storing', { cache: policy.name });
    return;
  }
  const memory = shared().memory;
  memory.delete(key);
  memory.set(key, envelope as Envelope<unknown>);
  while (memory.size > MEMORY_MAX_ENTRIES) memory.delete(memory.keys().next().value!);
  const client = redis();
  if (!client) return;
  try {
    // Retention, not freshness, sets the Redis TTL: the last good reading outlives an outage.
    await client.command(['SET', key, serialized, 'PX', Math.max(1_000, Math.round(policy.retainMs))]);
  } catch (error) {
    noteRedisFailure(error);
  }
}

async function acquireLock(key: string, ms: number): Promise<string | null | 'local'> {
  const client = redis();
  if (!client) return 'local';
  const token = randomUUID();
  try {
    const result = await client.command(['SET', `${key}:lock`, token, 'PX', ms, 'NX']);
    return result === 'OK' ? token : null;
  } catch (error) {
    noteRedisFailure(error);
    // Without Redis there is no fleet to coordinate; the in-process single flight still applies.
    return 'local';
  }
}
async function releaseLock(key: string, token: string) {
  if (token === 'local') return;
  try {
    await redis()?.eval(RELEASE, [`${key}:lock`], [token]);
  } catch {
    /* the lock expires on its own */
  }
}

/** Failed attempts back the next one off exponentially (capped), so an outage does not mean a refresh per request. */
export function nextAttemptAt(envelope: { attemptedAt: number; failures: number }, freshMs: number): number {
  if (envelope.failures <= 0) return 0;
  const base = Math.min(Math.max(freshMs / 4, 5_000), 60_000);
  return envelope.attemptedAt + Math.min(base * 2 ** (envelope.failures - 1), MAX_BACKOFF_MS);
}

async function refresh<T>(
  policy: CachePolicy<T>,
  key: string,
  fetcher: () => Promise<unknown>,
  previous: Envelope<T> | null,
): Promise<Envelope<T>> {
  const flights = shared().flights;
  const existing = flights.get(key);
  if (existing) {
    metrics(policy.name).coalesced++;
    return existing as Promise<Envelope<T>>;
  }
  const work = (async (): Promise<Envelope<T>> => {
    const lockMs = policy.lockMs ?? DEFAULT_LOCK_MS;
    const token = await acquireLock(key, lockMs);
    if (!token) {
      // Another process is refreshing. Serve what we have, or wait briefly for its result.
      metrics(policy.name).lockWaits++;
      if (previous) return previous;
      const deadline = Date.now() + Math.min(lockMs, 10_000);
      while (Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, WAIT_STEP_MS));
        const landed = await load(policy, key, Date.now());
        if (landed) return landed;
      }
      throw new CacheUnavailableError('busy');
    }
    const attemptedAt = Date.now();
    metrics(policy.name).refreshes++;
    try {
      let data: T | undefined;
      let invalid = false;
      try {
        data = policy.validate(await fetcher());
        invalid = data === undefined;
      } catch (error) {
        if (error instanceof InvalidReadingError) invalid = true;
        else throw error;
      }
      if (invalid || data === undefined) {
        log.debug('Upstream reading rejected by validation', { cache: policy.name });
        throw new CacheUnavailableError('invalid');
      }
      const envelope: Envelope<T> = { v: 1, data, fetchedAt: Date.now(), attemptedAt, failures: 0 };
      await store(policy, key, envelope);
      return envelope;
    } catch (error) {
      metrics(policy.name).refreshFailures++;
      // Keep the last good reading and its original timestamp; only the attempt bookkeeping changes.
      const latest = (await load(policy, key, Date.now())) ?? previous;
      if (latest) {
        const kept: Envelope<T> = { ...latest, attemptedAt, failures: latest.failures + 1 };
        await store(policy, key, kept);
        return kept;
      }
      throw error instanceof CacheUnavailableError ? error : new CacheUnavailableError('upstream');
    } finally {
      await releaseLock(key, token);
    }
  })().finally(() => {
    if (flights.get(key) === work) flights.delete(key);
  });
  flights.set(key, work as Promise<Envelope<unknown>>);
  return work;
}

function reading<T>(envelope: Envelope<T>, policy: CachePolicy<T>, now: number): CacheReading<T> {
  return {
    data: envelope.data,
    fetchedAt: envelope.fetchedAt,
    attemptedAt: envelope.attemptedAt,
    state: now - envelope.fetchedAt < policy.freshMs ? 'fresh' : 'stale',
    refreshFailed: envelope.failures > 0,
  };
}

/** Thrown by a validator to reject a payload explicitly (distinct from an upstream/network failure). */
export class InvalidReadingError extends Error {
  constructor(message = 'Upstream reading failed validation') {
    super(message);
    this.name = 'InvalidReadingError';
  }
}

/**
 * Read through the shared cache. Fresh readings return immediately. Stale readings return immediately and start
 * one coordinated background refresh. A miss waits for one coordinated refresh. `force` waits for a refresh but
 * still falls back to the last good reading when it fails.
 */
export async function readShared<T>(
  policy: CachePolicy<T>,
  parts: ReadonlyArray<string | number>,
  fetcher: () => Promise<unknown>,
  options: { force?: boolean; now?: number } = {},
): Promise<CacheReading<T>> {
  const key = cacheKey(policy, parts);
  const now = options.now ?? Date.now();
  const current = await load(policy, key, now);
  const counters = metrics(policy.name);
  if (current && !options.force) {
    if (now - current.fetchedAt < policy.freshMs) {
      counters.hits++;
      return reading(current, policy, now);
    }
    counters.staleHits++;
    if (now >= nextAttemptAt(current, policy.freshMs))
      void refresh(policy, key, fetcher, current).catch(() => undefined);
    return reading(current, policy, now);
  }
  counters.misses++;
  if (current && options.force && now < nextAttemptAt(current, policy.freshMs)) return reading(current, policy, now);
  const envelope = await refresh(policy, key, fetcher, current);
  return reading(envelope, policy, Date.now());
}

/** Peek without refreshing: for views that should never trigger upstream work. */
export async function peekShared<T>(
  policy: CachePolicy<T>,
  parts: ReadonlyArray<string | number>,
  now = Date.now(),
): Promise<CacheReading<T> | null> {
  const envelope = await load(policy, cacheKey(policy, parts), now);
  return envelope ? reading(envelope, policy, now) : null;
}

/** Drop one reading everywhere (Redis and this process). Other keys are untouched. */
export async function invalidateShared(
  policy: { name: string; version: number },
  parts: ReadonlyArray<string | number>,
): Promise<void> {
  const key = cacheKey(policy, parts);
  shared().memory.delete(key);
  try {
    await redis()?.del(key);
  } catch (error) {
    noteRedisFailure(error);
  }
}

export function sharedCacheMetrics(): Record<string, Metrics & { hitRatio: number | null }> {
  return Object.fromEntries(
    [...shared().metrics].map(([name, value]) => {
      const served = value.hits + value.staleHits + value.misses;
      return [name, { ...value, hitRatio: served ? (value.hits + value.staleHits) / served : null }];
    }),
  );
}

/** Tests only: forget process memory, in-flight refreshes and metrics. Redis is left alone. */
export function resetSharedCacheForTests(): void {
  const state = shared();
  state.memory.clear();
  state.flights.clear();
  state.metrics.clear();
  state.redisDownLoggedAt = 0;
}
